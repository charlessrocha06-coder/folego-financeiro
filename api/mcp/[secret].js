// Conector MCP do Fôlego Financeiro (Claude ↔ seus dados)
// Endereço: https://<seu-app>.vercel.app/api/mcp/<chave-secreta>
// A chave nunca fica guardada aqui: o banco só tem o hash dela e valida a cada chamada.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// ---------- acesso ao banco (funções seguras no Supabase) ----------
async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) {
    const msg = (body && (body.message || body.error)) || text || `HTTP ${r.status}`;
    const err = new Error(msg);
    err.conflict = /conflito/i.test(msg);
    throw err;
  }
  return body;
}

const ler = (secret) => rpc("folego_api_get", { p_secret: secret });

// lê → altera → grava, com proteção contra sobrescrever mudanças feitas no app ao mesmo tempo
async function alterar(secret, fn) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { dados, updated_at } = await ler(secret);
    const d = normalizar(dados);
    const resultado = fn(d);
    try {
      await rpc("folego_api_put", { p_secret: secret, p_dados: d, p_expected: updated_at });
      return resultado;
    } catch (e) {
      if (!e.conflict) throw e;
    }
  }
  throw new Error("Os dados mudaram no app enquanto eu gravava. Tente de novo em alguns segundos.");
}

// ---------- regras do Fôlego (iguais às do app) ----------
const LISTA = { pagar: "contasPagar", receber: "contasReceber" };
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const novoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const num = (v) => Number(String(v ?? 0).replace(",", ".")) || 0;
const r2 = (v) => Math.round(v * 100) / 100;
const addDias = (iso, n) => {
  const [y, m, dd] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd + n));
  return dt.toISOString().slice(0, 10);
};
const soma = (arr) => r2(arr.reduce((s, c) => s + num(c.valor), 0));

function normalizar(d) {
  d = d && typeof d === "object" ? d : {};
  d.contasPagar = Array.isArray(d.contasPagar) ? d.contasPagar : [];
  d.contasReceber = Array.isArray(d.contasReceber) ? d.contasReceber : [];
  d.recorrencias = Array.isArray(d.recorrencias) ? d.recorrencias : [];
  d.investimentos = Array.isArray(d.investimentos) ? d.investimentos : [];
  d.guardado = Array.isArray(d.guardado) ? d.guardado : [];
  d.categoriasDespesa = Array.isArray(d.categoriasDespesa) ? d.categoriasDespesa : [];
  d.categoriasReceita = Array.isArray(d.categoriasReceita) ? d.categoriasReceita : [];
  return d;
}

const saldoConfirmado = (d) =>
  r2(num(d.saldoInicial) + soma(d.contasReceber.filter((c) => c.status === "efetivada")) - soma(d.contasPagar.filter((c) => c.status === "efetivada")));

function acharLancamento(d, id) {
  for (const tipo of ["pagar", "receber"]) {
    const arr = d[LISTA[tipo]];
    const i = arr.findIndex((c) => c.id === id);
    if (i >= 0) return { tipo, arr, i, item: arr[i] };
  }
  throw new Error(`Lançamento ${id} não encontrado. Use listar_lancamentos para ver os ids.`);
}

const resumoItem = (tipo, c) => ({
  id: c.id, tipo, nome: c.nome, categoria: c.categoria, valor: num(c.valor), data: c.data, status: c.status,
  ...(c.parcela ? { parcela: `${c.parcela}/${c.totalParcelas}` } : {}),
  ...(c.origemRecorrenciaId ? { recorrente: true } : {}),
});

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 1) }] });

// ---------- servidor MCP ----------
function criarServidor(secret) {
  const server = new McpServer({ name: "folego-financeiro", version: "1.0.0" });
  const RO = { readOnlyHint: true, openWorldHint: false };
  const W = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const DEL = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

  server.registerTool("resumo_financeiro", {
    title: "Resumo financeiro",
    description: "Visão geral do Fôlego Financeiro: saldo confirmado, saldo planejado e fôlego/dia (próximos 30 dias, mesmo cálculo do app), guardado, investimentos, contas atrasadas e projeção mensal (receber × pagar) dos próximos meses.",
    inputSchema: { meses: z.number().int().min(1).max(12).optional().describe("Quantos meses de projeção (padrão 6)") },
    annotations: RO,
  }, async ({ meses = 6 }) => {
    const { dados } = await ler(secret);
    const d = normalizar(dados);
    const h = hoje();
    const fim = addDias(h, 30);
    const confirmado = saldoConfirmado(d);
    const prevAte = (arr) => soma(arr.filter((c) => c.status === "prevista" && c.data <= fim));
    const planejado = r2(confirmado + prevAte(d.contasReceber) - prevAte(d.contasPagar));
    const atrasados = [
      ...d.contasPagar.filter((c) => c.status === "prevista" && c.data < h).map((c) => resumoItem("pagar", c)),
      ...d.contasReceber.filter((c) => c.status === "prevista" && c.data < h).map((c) => resumoItem("receber", c)),
    ];
    const projecao = [];
    const [y, m] = h.split("-").map(Number);
    for (let k = 0; k < meses; k++) {
      const dt = new Date(Date.UTC(y, m - 1 + k, 1));
      const mes = dt.toISOString().slice(0, 7);
      const rec = soma(d.contasReceber.filter((c) => (c.data || "").startsWith(mes)));
      const pag = soma(d.contasPagar.filter((c) => (c.data || "").startsWith(mes)));
      projecao.push({ mes, receber: rec, pagar: pag, sobra: r2(rec - pag) });
    }
    return ok({
      hoje: h,
      saldo_confirmado: confirmado,
      proximos_30_dias: { receber_previsto: prevAte(d.contasReceber.filter((c) => c.data >= h)), pagar_previsto: prevAte(d.contasPagar.filter((c) => c.data >= h)) },
      saldo_planejado_30_dias: planejado,
      folego_por_dia_30_dias: r2(planejado / 30),
      guardado_total: soma(d.guardado),
      investimentos_total: soma(d.investimentos),
      atrasados,
      projecao_mensal: projecao,
      observacao: "Projeção mensal soma tudo do mês (previsto + efetivado). Atrasados = previstos com data anterior a hoje.",
    });
  });

  server.registerTool("listar_lancamentos", {
    title: "Listar lançamentos",
    description: "Lista contas a pagar e/ou a receber com filtros. Retorna o id de cada lançamento (necessário para editar, dar baixa ou excluir).",
    inputSchema: {
      tipo: z.enum(["pagar", "receber", "todos"]).optional().describe("Padrão: todos"),
      de: z.string().optional().describe("Data inicial AAAA-MM-DD"),
      ate: z.string().optional().describe("Data final AAAA-MM-DD"),
      status: z.enum(["prevista", "efetivada", "todos"]).optional().describe("prevista = pendente; efetivada = paga/recebida"),
      busca: z.string().optional().describe("Trecho do nome ou da categoria"),
      limite: z.number().int().min(1).max(500).optional().describe("Padrão 100"),
    },
    annotations: RO,
  }, async ({ tipo = "todos", de, ate, status = "todos", busca, limite = 100 }) => {
    const d = normalizar((await ler(secret)).dados);
    const tipos = tipo === "todos" ? ["pagar", "receber"] : [tipo];
    const b = busca ? busca.toLowerCase() : null;
    let itens = tipos.flatMap((t) => d[LISTA[t]].map((c) => resumoItem(t, c)));
    itens = itens.filter((c) =>
      (!de || c.data >= de) && (!ate || c.data <= ate) && (status === "todos" || c.status === status) &&
      (!b || `${c.nome} ${c.categoria}`.toLowerCase().includes(b)));
    itens.sort((a, c) => (a.data || "").localeCompare(c.data || ""));
    return ok({ total_encontrado: itens.length, soma: soma(itens), itens: itens.slice(0, limite) });
  });

  server.registerTool("adicionar_lancamento", {
    title: "Adicionar lançamento",
    description: "Cria uma conta a pagar ou a receber. Use status 'efetivada' para algo já pago/recebido (entra no saldo confirmado) e 'prevista' para algo futuro/pendente.",
    inputSchema: {
      tipo: z.enum(["pagar", "receber"]),
      nome: z.string().min(1),
      valor: z.number().positive(),
      data: z.string().optional().describe("AAAA-MM-DD. Padrão: hoje"),
      categoria: z.string().optional().describe("Ex.: Alimentação, Moradia, Salário. Padrão: Outros"),
      status: z.enum(["prevista", "efetivada"]).optional().describe("Padrão: prevista"),
    },
    annotations: W,
  }, async ({ tipo, nome, valor, data, categoria = "Outros", status = "prevista" }) => {
    const item = await alterar(secret, (d) => {
      const novo = { id: novoId(), nome, categoria, valor: r2(valor), valorPlanejado: r2(valor), data: data || hoje(), status };
      d[LISTA[tipo]].push(novo);
      const cats = tipo === "pagar" ? d.categoriasDespesa : d.categoriasReceita;
      if (!cats.includes(categoria)) cats.push(categoria);
      return resumoItem(tipo, novo);
    });
    return ok({ criado: item });
  });

  server.registerTool("dar_baixa", {
    title: "Dar baixa (marcar como pago/recebido)",
    description: "Marca um lançamento previsto como efetivado (pago ou recebido), opcionalmente com o valor e a data reais.",
    inputSchema: { id: z.string(), valor: z.number().positive().optional(), data: z.string().optional().describe("Data real AAAA-MM-DD") },
    annotations: W,
  }, async ({ id, valor, data }) => {
    const r = await alterar(secret, (d) => {
      const { tipo, item } = acharLancamento(d, id);
      item.status = "efetivada";
      if (valor !== undefined) item.valor = r2(valor);
      if (data) item.data = data;
      return { atualizado: resumoItem(tipo, item), saldo_confirmado: saldoConfirmado(d) };
    });
    return ok(r);
  });

  server.registerTool("reverter_baixa", {
    title: "Reverter baixa",
    description: "Volta um lançamento efetivado para previsto, com o valor planejado original.",
    inputSchema: { id: z.string() },
    annotations: W,
  }, async ({ id }) => {
    const r = await alterar(secret, (d) => {
      const { tipo, item } = acharLancamento(d, id);
      item.status = "prevista";
      if (item.valorPlanejado !== undefined) item.valor = item.valorPlanejado;
      return { atualizado: resumoItem(tipo, item), saldo_confirmado: saldoConfirmado(d) };
    });
    return ok(r);
  });

  server.registerTool("editar_lancamento", {
    title: "Editar lançamento",
    description: "Altera nome, valor, data e/ou categoria de um lançamento (só esse lançamento, não a série inteira).",
    inputSchema: { id: z.string(), nome: z.string().optional(), valor: z.number().positive().optional(), data: z.string().optional(), categoria: z.string().optional() },
    annotations: W,
  }, async ({ id, nome, valor, data, categoria }) => {
    const r = await alterar(secret, (d) => {
      const { tipo, item } = acharLancamento(d, id);
      const antes = resumoItem(tipo, { ...item });
      if (nome) item.nome = nome;
      if (data) item.data = data;
      if (categoria) item.categoria = categoria;
      if (valor !== undefined) { item.valor = r2(valor); if (item.status === "prevista") item.valorPlanejado = r2(valor); }
      return { antes, depois: resumoItem(tipo, item) };
    });
    return ok(r);
  });

  server.registerTool("excluir_lancamento", {
    title: "Excluir lançamento",
    description: "Exclui um lançamento pelo id. Ação permanente: confirme com o usuário antes.",
    inputSchema: { id: z.string() },
    annotations: DEL,
  }, async ({ id }) => {
    const r = await alterar(secret, (d) => {
      const { tipo, arr, i, item } = acharLancamento(d, id);
      arr.splice(i, 1);
      return { excluido: resumoItem(tipo, item), saldo_confirmado: saldoConfirmado(d) };
    });
    return ok(r);
  });

  server.registerTool("ajustar_saldo_atual", {
    title: "Ajustar saldo atual",
    description: "Faz o saldo confirmado do app bater com o saldo real da conta hoje, recalculando o saldo inicial (saldo inicial = saldo real − recebidos + pagos).",
    inputSchema: { saldo_real: z.number().describe("Quanto há de fato na conta hoje, em R$") },
    annotations: W,
  }, async ({ saldo_real }) => {
    const r = await alterar(secret, (d) => {
      const antes = saldoConfirmado(d);
      const rec = soma(d.contasReceber.filter((c) => c.status === "efetivada"));
      const pag = soma(d.contasPagar.filter((c) => c.status === "efetivada"));
      const inicialAntes = num(d.saldoInicial);
      d.saldoInicial = r2(saldo_real - rec + pag);
      return { saldo_confirmado_antes: antes, saldo_confirmado_depois: saldoConfirmado(d), saldo_inicial_antes: inicialAntes, saldo_inicial_depois: d.saldoInicial };
    });
    return ok(r);
  });

  const RESERVA = z.enum(["guardado", "investimentos"]);

  server.registerTool("listar_reservas", {
    title: "Listar guardado e investimentos",
    description: "Lista os itens de dinheiro guardado e de investimentos, com totais.",
    inputSchema: {},
    annotations: RO,
  }, async () => {
    const d = normalizar((await ler(secret)).dados);
    return ok({ guardado: { total: soma(d.guardado), itens: d.guardado }, investimentos: { total: soma(d.investimentos), itens: d.investimentos } });
  });

  server.registerTool("adicionar_reserva", {
    title: "Adicionar guardado/investimento",
    description: "Adiciona um item (aporte) ao dinheiro guardado ou aos investimentos.",
    inputSchema: { tipo: RESERVA, nome: z.string().min(1), valor: z.number(), data: z.string().optional().describe("AAAA-MM-DD. Padrão: hoje") },
    annotations: W,
  }, async ({ tipo, nome, valor, data }) => {
    const r = await alterar(secret, (d) => {
      const novo = { id: novoId(), nome, valor: r2(valor), data: data || hoje() };
      d[tipo].push(novo);
      return { criado: novo, total: soma(d[tipo]) };
    });
    return ok(r);
  });

  server.registerTool("editar_reserva", {
    title: "Editar guardado/investimento",
    description: "Altera nome e/ou valor de um item de guardado ou investimentos.",
    inputSchema: { tipo: RESERVA, id: z.string(), nome: z.string().optional(), valor: z.number().optional() },
    annotations: W,
  }, async ({ tipo, id, nome, valor }) => {
    const r = await alterar(secret, (d) => {
      const item = d[tipo].find((x) => x.id === id);
      if (!item) throw new Error(`Item ${id} não encontrado em ${tipo}.`);
      const antes = { ...item };
      if (nome) item.nome = nome;
      if (valor !== undefined) item.valor = r2(valor);
      return { antes, depois: item, total: soma(d[tipo]) };
    });
    return ok(r);
  });

  server.registerTool("excluir_reserva", {
    title: "Excluir guardado/investimento",
    description: "Exclui um item de guardado ou investimentos. Ação permanente: confirme com o usuário antes.",
    inputSchema: { tipo: RESERVA, id: z.string() },
    annotations: DEL,
  }, async ({ tipo, id }) => {
    const r = await alterar(secret, (d) => {
      const i = d[tipo].findIndex((x) => x.id === id);
      if (i < 0) throw new Error(`Item ${id} não encontrado em ${tipo}.`);
      const [item] = d[tipo].splice(i, 1);
      return { excluido: item, total: soma(d[tipo]) };
    });
    return ok(r);
  });

  server.registerTool("listar_recorrencias", {
    title: "Listar recorrências",
    description: "Lista as recorrências (contas fixas que se repetem) cadastradas no app. Somente leitura: criar ou alterar recorrências é feito no app.",
    inputSchema: {},
    annotations: RO,
  }, async () => {
    const d = normalizar((await ler(secret)).dados);
    return ok(d.recorrencias.map((t) => ({ id: t.id, nome: t.nome, tipo: t.tipo, categoria: t.categoria, valor: num(t.valor), frequencia: t.freq, inicio: t.dataInicio, ativa: t.ativa })));
  });

  return server;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null });
    return;
  }
  const secret = String((req.query && req.query.secret) || "");
  try {
    const valido = secret.length >= 32 && (await rpc("folego_api_check", { p_secret: secret })) === true;
    if (!valido) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Acesso negado" }, id: null });
      return;
    }
  } catch (e) {
    res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Erro ao validar acesso: " + e.message }, id: null });
    return;
  }
  const server = criarServidor(secret);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
