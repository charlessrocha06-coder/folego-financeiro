import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  TrendingDown, TrendingUp, BarChart3, AlertTriangle,
  Plus, Trash2, Repeat, Pencil, X, Eye, EyeOff, Target, Check, Zap, Percent, Landmark, Download, Upload, LogOut,
} from "lucide-react";

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlShort = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const toDateBR = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const addDaysISO = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonthISO = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};
const nextDateAfter = (iso, freq) => (freq === "mensal" ? addMonthISO(iso, 1) : addDaysISO(iso, freq === "quinzenal" ? 14 : 7));

const PALAVRAS_CATEGORIA = {
  "Alimentação": ["almoco", "almoço", "lanche", "jantar", "cafe", "café", "restaurante", "ifood", "padaria", "pizza", "lanchonete", "marmita", "sushi", "hamburguer", "hambúrguer", "mercado", "feira", "acai", "açaí"],
  "Transporte": ["uber", "99", "taxi", "táxi", "gasolina", "combustivel", "combustível", "estacionamento", "pedagio", "pedágio", "onibus", "ônibus", "metro", "metrô", "passagem", "posto"],
  "Saúde": ["farmacia", "farmácia", "remedio", "remédio", "consulta", "dentista", "academia"],
  "Lazer": ["cinema", "bar", "show", "balada", "ingresso", "streaming"],
  "Moradia": ["luz", "agua", "água", "internet", "condominio", "condomínio"],
  "Educação": ["curso", "livro", "mensalidade", "material"],
};
// sugere categoria: primeiro olha se você já usou esse nome antes (aprendizado), depois tenta por palavra-chave
function sugerirCategoria(nomeDigitado, categoriasDisponiveis, historico) {
  const low = (nomeDigitado || "").toLowerCase().trim();
  const aprendido = [...(historico || [])].reverse().find((c) => c.nome.toLowerCase().trim() === low);
  if (aprendido) return aprendido.categoria;
  for (const [cat, palavras] of Object.entries(PALAVRAS_CATEGORIA)) {
    if (palavras.some((p) => low.includes(p))) {
      const achou = categoriasDisponiveis.find((c) => c.toLowerCase() === cat.toLowerCase());
      if (achou) return achou;
    }
  }
  return categoriasDisponiveis.includes("Outros") ? "Outros" : categoriasDisponiveis[0];
}
// entende texto livre tipo "almoço 32,50" ou "8,50 estacionamento" e separa nome + valor
function parseGastoRapido(texto) {
  const match = (texto || "").match(/(\d+[.,]?\d*)/);
  if (!match) return null;
  const valor = parseFloat(match[0].replace(",", "."));
  if (!valor) return null;
  const nome = texto.replace(match[0], "").trim().replace(/^[-–:]+|[-–:]+$/g, "").trim();
  return { nome: nome || "Gasto rápido", valor };
}

// dado o dia da compra no cartão, calcula em qual fatura (data de vencimento) ela cai,
// considerando o dia de fechamento e o dia de vencimento configurados.
function calcularVencimentoFatura(dataCompra, fechamento, vencimento) {
  const diaCompra = Number(dataCompra.slice(8, 10));
  let base = dataCompra.slice(0, 7) + "-01";
  if (diaCompra > fechamento) base = addMonthISO(base, 1);
  let venc = base.slice(0, 8) + String(vencimento).padStart(2, "0");
  if (vencimento < fechamento) venc = addMonthISO(venc, 1);
  return venc;
}

const CATEGORY_COLORS = ["#0F6D66", "#4338CA", "#C2410C", "#1D4ED8", "#9D174D", "#4D7C0F", "#B45309", "#475569"];
const catColor = (name) => {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
};

const DEFAULT_CAT_DESPESA = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Assinaturas", "Cartão de crédito", "Outros"];
const DEFAULT_CAT_RECEITA = ["Salário", "Freelance / Extra", "Investimentos", "Reembolso", "Outros"];
const HORIZON_MONTHS = 6;
const NOMES_MES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function getRangeMes(mesISO) {
  const [y, m] = mesISO.split("-").map(Number);
  return { inicio: `${mesISO}-01`, fim: new Date(y, m, 0).toISOString().slice(0, 10) };
}
// lista de meses selecionáveis no filtro: 6 antes e 6 depois do mês atual
function listaMeses(hoje) {
  return Array.from({ length: 13 }, (_, i) => {
    const iso = addMonthISO(hoje, i - 6).slice(0, 7);
    const [, m] = iso.split("-");
    return { value: iso, label: `${NOMES_MES_LONGO[Number(m) - 1]} de ${iso.slice(0, 4)}` };
  });
}

const DEFAULT_STATE = {
  saldoInicial: 0,
  valoresOcultos: false,
  categoriasDespesa: DEFAULT_CAT_DESPESA,
  categoriasReceita: DEFAULT_CAT_RECEITA,
  cartaoConfig: { fechamento: 18, vencimento: 25 },
  contasPagar: [],
  contasReceber: [],
  recorrencias: [],
  investimentos: [],
  guardado: [],
};

function normalizeState(raw) {
  const norm = (arr, statusFallbackKey) =>
    (arr || []).map((c) => ({ categoria: "Outros", status: c[statusFallbackKey] ? "efetivada" : "prevista", valorPlanejado: c.valor, ...c }));
  return {
    saldoInicial: raw.saldoInicial ?? raw.saldoAtual ?? 0,
    valoresOcultos: raw.valoresOcultos ?? false,
    categoriasDespesa: raw.categoriasDespesa?.length ? raw.categoriasDespesa : DEFAULT_CAT_DESPESA,
    categoriasReceita: raw.categoriasReceita?.length ? raw.categoriasReceita : DEFAULT_CAT_RECEITA,
    cartaoConfig: { fechamento: 18, vencimento: 25, ...(raw.cartaoConfig || {}) },
    contasPagar: norm(raw.contasPagar, "paga"),
    contasReceber: norm(raw.contasReceber, "recebida"),
    recorrencias: raw.recorrencias || raw.recorrenciasFixas || [],
    investimentos: (raw.investimentos || []).map((i) => ({ data: todayISO(), ...i })),
    guardado: (raw.guardado || []).map((i) => ({ data: todayISO(), ...i })),
  };
}

// parcelamento com número fixo de parcelas (>=1)
function gerarParcelas({ nome, categoria, valor, data, freq, parcelas, efetivada }) {
  const n = Math.max(1, Number(parcelas) || 1);
  if (n === 1) return [{ id: uid(), nome, categoria, valor, valorPlanejado: valor, data, status: efetivada ? "efetivada" : "prevista" }];
  const grupoId = uid();
  const items = [];
  for (let i = 0; i < n; i++) {
    const d = freq === "mensal" ? addMonthISO(data, i) : addDaysISO(data, (freq === "quinzenal" ? 14 : 7) * i);
    items.push({ id: uid(), nome: `${nome} (${i + 1}/${n})`, categoria, valor, valorPlanejado: valor, data: d, status: i === 0 && efetivada ? "efetivada" : "prevista", grupoId, parcela: i + 1, totalParcelas: n });
  }
  return items;
}

// recorrência sem fim (parcelas = 0) — janela rolante
function primeiraOcorrencia(t) {
  let cursor = t.dataInicio;
  while (cursor < todayISO()) cursor = nextDateAfter(cursor, t.freq);
  return cursor;
}
function gerarOcorrenciasTemplate(t, ate) {
  let cursor = t.geradoAte ? nextDateAfter(t.geradoAte, t.freq) : primeiraOcorrencia(t);
  const novas = [];
  let last = t.geradoAte || null;
  while (cursor <= ate) {
    novas.push({ id: uid(), nome: t.nome, categoria: t.categoria, valor: t.valor, valorPlanejado: t.valor, data: cursor, status: "prevista", origemRecorrenciaId: t.id });
    last = cursor;
    cursor = nextDateAfter(cursor, t.freq);
  }
  return { novas, novoGeradoAte: last || t.geradoAte };
}

const STORAGE_KEY = "folego-financeiro-dados";

export default function FolegoFinanceiro({ userId, supabase, onSignOut }) {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("pagar");
  const [filtro, setFiltro] = useState({ tipo: "todas", mes: todayISO().slice(0, 7), inicio: todayISO(), fim: todayISO(), categorias: [] });
  const [editarSaldoInicial, setEditarSaldoInicial] = useState(false);
  const saveTimer = useRef(null);
  const lastSeen = useRef(null);
  const skipSave = useRef(true);
  const fileRef = useRef(null);
  const [erroSync, setErroSync] = useState("");
  const [importPendente, setImportPendente] = useState(null);
  const [msgOk, setMsgOk] = useState("");

  const carregarServidor = async (primeira) => {
    const { data, error } = await supabase.from("dados_financeiros").select("dados, updated_at").eq("user_id", userId).maybeSingle();
    if (error) {
      setErroSync("Não consegui carregar seus dados: " + error.message);
    } else if (data && data.updated_at !== lastSeen.current) {
      lastSeen.current = data.updated_at;
      skipSave.current = true;
      setState(normalizeState(data.dados || {}));
    }
    if (primeira) setLoaded(true);
  };

  useEffect(() => {
    carregarServidor(true);
    const onVis = () => { if (document.visibilityState === "visible") carregarServidor(false); };
    document.addEventListener("visibilitychange", onVis);
    const timer = setInterval(() => carregarServidor(false), 15000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!loaded) return;
    const horizonte = addMonthISO(todayISO(), HORIZON_MONTHS);
    setState((s) => {
      let contasPagar = [...s.contasPagar];
      let contasReceber = [...s.contasReceber];
      const recorrencias = s.recorrencias.map((t) => {
        if (!t.ativa) return t;
        const { novas, novoGeradoAte } = gerarOcorrenciasTemplate(t, horizonte);
        if (novas.length) {
          if (t.tipo === "pagar") contasPagar = [...contasPagar, ...novas];
          else contasReceber = [...contasReceber, ...novas];
        }
        return { ...t, geradoAte: novoGeradoAte };
      });
      return { ...s, contasPagar, contasReceber, recorrencias };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (skipSave.current) { skipSave.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from("dados_financeiros")
        .upsert({ user_id: userId, dados: state, updated_at: new Date().toISOString() })
        .select("updated_at")
        .single();
      if (error) setErroSync("Não consegui salvar: " + error.message);
      else { lastSeen.current = data.updated_at; setErroSync(""); }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [state, loaded]);

  const update = (fn) => setState((s) => fn(structuredClone(s)));
  const hidden = state.valoresOcultos;
  const fmt = (n) => (hidden ? "••••" : brl(n));
  const fmtShort = (n) => (hidden ? "•••" : brlShort(n));

  // ---------- adicionar conta ----------
  // lançamento rápido do dia a dia (almoço, lanche, estacionamento...) — já nasce efetivado, hoje.
  const adicionarGastoRapido = (item) =>
    update((s) => ({ ...s, contasPagar: [...s.contasPagar, { id: uid(), status: "efetivada", valorPlanejado: item.valor, ...item }] }));

  const handleAddConta = (tipo, form) => {
    const parcelasNum = Number(form.parcelas);
    if (form.recorrente && parcelasNum === 0) {
      const horizonte = addMonthISO(todayISO(), HORIZON_MONTHS);
      const template = { id: uid(), ativa: true, geradoAte: null, reajustes: [], tipo, nome: form.nome, categoria: form.categoria, valor: Number(form.valor), freq: form.freq, dataInicio: form.data };

      // a primeira ocorrência é SEMPRE a data exata que você digitou (mesmo que já tenha passado) —
      // nunca pula pro próximo mês. As seguintes são geradas a partir dela pra frente.
      const primeira = { id: uid(), nome: form.nome, categoria: form.categoria, valor: Number(form.valor), valorPlanejado: Number(form.valor), data: form.data, status: form.efetivada ? "efetivada" : "prevista", origemRecorrenciaId: template.id };
      const baseTemplate = { ...template, geradoAte: form.data };
      const { novas: futuras, novoGeradoAte } = gerarOcorrenciasTemplate(baseTemplate, horizonte);
      const novas = [primeira, ...futuras];

      update((s) => ({
        ...s,
        recorrencias: [...s.recorrencias, { ...template, geradoAte: novoGeradoAte }],
        contasPagar: tipo === "pagar" ? [...s.contasPagar, ...novas] : s.contasPagar,
        contasReceber: tipo === "receber" ? [...s.contasReceber, ...novas] : s.contasReceber,
      }));
    } else {
      const items = gerarParcelas({ ...form, parcelas: form.recorrente ? parcelasNum : 1 });
      update((s) => (tipo === "pagar" ? { ...s, contasPagar: [...s.contasPagar, ...items] } : { ...s, contasReceber: [...s.contasReceber, ...items] }));
    }
  };

  // reajustar valor de uma recorrência sem fim — nunca mexe no que já foi efetivado.
  // "este" — só aquela ocorrência específica, a recorrência mantém o valor antigo depois.
  // "futuro" — essa e as previsões seguintes; o valor-base da recorrência muda pra frente.
  // "todos" — todas as previsões (mesmo anteriores a essa), o valor-base também muda.
  const reajustarRecorrencia = (id, itemId, campos, modo, dataRef) =>
    update((s) => {
      const bump = (arr) =>
        arr.map((c) => {
          if (c.origemRecorrenciaId !== id || c.status !== "prevista") return c;
          if (modo === "este") return c.id === itemId ? { ...c, ...campos } : c;
          if (modo === "futuro") return c.data >= dataRef ? { ...c, ...campos } : c;
          return { ...c, ...campos }; // todos
        });
      const recorrencias =
        modo === "este"
          ? s.recorrencias
          : s.recorrencias.map((t) => (t.id === id ? { ...t, ...campos, reajustes: campos.valor != null ? [...(t.reajustes || []), { data: dataRef, valor: campos.valor }] : t.reajustes || [] } : t));
      return { ...s, recorrencias, contasPagar: bump(s.contasPagar), contasReceber: bump(s.contasReceber) };
    });

  // mesma ideia do reajuste, mas pra compras parceladas com número fixo de parcelas (sem "template" pra atualizar)
  const editarParcela = (tipo, grupoId, itemId, campos, modo, dataRef) =>
    update((s) => {
      const chave = tipo === "pagar" ? "contasPagar" : "contasReceber";
      const bump = (arr) =>
        arr.map((c) => {
          if (c.grupoId !== grupoId || c.status !== "prevista") return c;
          if (modo === "este") return c.id === itemId ? { ...c, ...campos } : c;
          if (modo === "futuro") return c.data >= dataRef ? { ...c, ...campos } : c;
          return { ...c, ...campos }; // todos
        });
      return { ...s, [chave]: bump(s[chave]) };
    });

  // apagar uma ocorrência de recorrência sem fim: pergunta o alcance, mas SEMPRE dentro do
  // mesmo status do item clicado — apagar uma previsão nunca mexe no que já foi efetivado,
  // e apagar um efetivado nunca mexe nas previsões futuras.
  // "este" — só aquela ocorrência.
  // "futuro" — essa e as seguintes (mesmo status); se for previsão, também encerra a recorrência.
  // "todos" — todas as ocorrências daquele status; se for previsão, também encerra a recorrência.
  // item avulso ou parcelado (não recorrente sem fim): apaga só aquele registro, sempre.
  const excluirConta = (tipo, c, modo = "este") =>
    update((s) => {
      const chave = tipo === "pagar" ? "contasPagar" : "contasReceber";
      const chaveSerie = c.origemRecorrenciaId ? "origemRecorrenciaId" : c.grupoId ? "grupoId" : null;
      if (chaveSerie && modo !== "este") {
        const idSerie = c[chaveSerie];
        const alvo = c.status;
        const encerraTemplate = (recorrencias) =>
          chaveSerie === "origemRecorrenciaId" && alvo === "prevista"
            ? recorrencias.map((t) => (t.id === idSerie ? { ...t, ativa: false } : t))
            : recorrencias;
        if (modo === "todos") {
          return {
            ...s,
            recorrencias: encerraTemplate(s.recorrencias),
            [chave]: s[chave].filter((x) => !(x[chaveSerie] === idSerie && x.status === alvo)),
          };
        }
        if (modo === "futuro") {
          const cortar = (arr) => arr.filter((x) => !(x[chaveSerie] === idSerie && x.status === alvo && x.data >= c.data));
          return { ...s, recorrencias: encerraTemplate(s.recorrencias), [chave]: cortar(s[chave]) };
        }
      }
      return { ...s, [chave]: s[chave].filter((x) => x.id !== c.id) };
    });

  // edição geral de um lançamento único — funciona pra qualquer conta (avulsa, parcelada ou recorrente)
  const editarConta = (tipo, id, campos) =>
    update((s) => {
      const chave = tipo === "pagar" ? "contasPagar" : "contasReceber";
      return { ...s, [chave]: s[chave].map((x) => (x.id === id ? { ...x, ...campos } : x)) };
    });

  // efetivar ("baixar") uma conta prevista: confirma ou edita o valor real antes de marcar como paga/recebida.
  // o valorPlanejado original fica guardado pra comparação no analítico.
  const baixarConta = (tipo, id, valorReal, dataReal) =>
    update((s) => {
      const bump = (arr) => arr.map((x) => (x.id === id ? { ...x, status: "efetivada", valor: Number(valorReal), data: dataReal || x.data } : x));
      return tipo === "pagar" ? { ...s, contasPagar: bump(s.contasPagar) } : { ...s, contasReceber: bump(s.contasReceber) };
    });
  // reverter uma baixa: volta a ser previsão, com o valor planejado original
  const reverterConta = (tipo, id) =>
    update((s) => {
      const bump = (arr) => arr.map((x) => (x.id === id ? { ...x, status: "prevista", valor: x.valorPlanejado } : x));
      return tipo === "pagar" ? { ...s, contasPagar: bump(s.contasPagar) } : { ...s, contasReceber: bump(s.contasReceber) };
    });

  const today = todayISO();
  // saldo baixado = saldo inicial + tudo que já foi efetivado (pago/recebido) até agora — dinheiro confirmado
  const totalReceitaEfetivada = state.contasReceber.filter((c) => c.status === "efetivada").reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalDespesaEfetivada = state.contasPagar.filter((c) => c.status === "efetivada").reduce((s, c) => s + Number(c.valor || 0), 0);
  const saldoBaixado = Number(state.saldoInicial || 0) + totalReceitaEfetivada - totalDespesaEfetivada;
  const rangeAtual = filtro.tipo === "custom" ? { inicio: filtro.inicio, fim: filtro.fim } : filtro.tipo === "mes" ? getRangeMes(filtro.mes) : null;
  const dentroDoPeriodo = (data) => !rangeAtual || (data >= rangeAtual.inicio && data <= rangeAtual.fim);
  const dentroDoFiltro = (data, categoria) => dentroDoPeriodo(data) && (filtro.categorias.length === 0 || filtro.categorias.includes(categoria));
  const todasCategorias = [...new Set([...state.categoriasDespesa, ...state.categoriasReceita])];

  // ---------- fôlego: saldo baixado + tudo que está previsto (a receber − a pagar) dentro do período selecionado ----------
  const fimPeriodo = rangeAtual ? rangeAtual.fim : addDaysISO(today, 30);
  const inicioPeriodo = rangeAtual ? rangeAtual.inicio : "0001-01-01";
  const periodoEncerrado = fimPeriodo < today; // período inteiro já ficou no passado
  const diasPeriodo = Math.max(1, daysBetween(today, fimPeriodo));
  const noPeriodo = (c) => c.status === "prevista" && c.data >= inicioPeriodo && c.data <= fimPeriodo;
  const receitaPeriodo = state.contasReceber.filter(noPeriodo).reduce((s, c) => s + Number(c.valor || 0), 0);
  const despesaPeriodo = state.contasPagar.filter(noPeriodo).reduce((s, c) => s + Number(c.valor || 0), 0);
  // saldo planejado: se o período terminasse hoje considerando tudo que está previsto, esse seria o saldo — positivo ou negativo
  const saldoAtual = saldoBaixado + receitaPeriodo - despesaPeriodo;
  // período totalmente no passado não tem dias restantes pra dividir — fôlego não faz sentido, mostra zero
  const folegoDiario = periodoEncerrado ? 0 : saldoAtual / diasPeriodo;
  const tenso = folegoDiario < 0;
  const pct = periodoEncerrado ? 0 : Math.max(6, Math.min(100, (diasPeriodo / 60) * 100));
  const previstasPagar = state.contasPagar.filter((c) => c.status === "prevista");
  const previstasReceber = state.contasReceber.filter((c) => c.status === "prevista");

  // desvio do planejado no mês: quanto você economizou (+) ou passou (-) do que tinha previsto
  const mesAtual = today.slice(0, 7);
  const noMes = (c) => c.status === "efetivada" && c.data.slice(0, 7) === mesAtual;
  const desvioDespesas = state.contasPagar.filter(noMes).reduce((s, c) => s + (Number(c.valorPlanejado || 0) - Number(c.valor || 0)), 0);
  const desvioReceitas = state.contasReceber.filter(noMes).reduce((s, c) => s + (Number(c.valor || 0) - Number(c.valorPlanejado || 0)), 0);
  const desvioMes = desvioDespesas + desvioReceitas;

  // totais do mês, taxa de poupança e contas em aberto
  const totalReceitaMes = state.contasReceber.filter(noMes).reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalDespesaMes = state.contasPagar.filter(noMes).reduce((s, c) => s + Number(c.valor || 0), 0);
  const taxaPoupanca = totalReceitaMes > 0 ? ((totalReceitaMes - totalDespesaMes) / totalReceitaMes) * 100 : null;
  const totalPendentePagar = previstasPagar.reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalPendenteReceber = previstasReceber.reduce((s, c) => s + Number(c.valor || 0), 0);

  // histórico dos últimos 6 meses (receita x despesa efetivadas)
  const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const historicoMeses = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx;
    const mesISO = addMonthISO(today, -i).slice(0, 7);
    const [y, m] = mesISO.split("-");
    const receita = state.contasReceber.filter((c) => c.status === "efetivada" && c.data.slice(0, 7) === mesISO).reduce((s, c) => s + Number(c.valor || 0), 0);
    const despesa = state.contasPagar.filter((c) => c.status === "efetivada" && c.data.slice(0, 7) === mesISO).reduce((s, c) => s + Number(c.valor || 0), 0);
    return { mes: `${NOMES_MES[Number(m) - 1]}/${y.slice(2)}`, receita, despesa };
  });

  // ---------- analytics (só o essencial) ----------
  const porCategoria = (items) => {
    const map = {};
    items.forEach((i) => { map[i.categoria || "Outros"] = (map[i.categoria || "Outros"] || 0) + Number(i.valor || 0); });
    return Object.entries(map).map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total);
  };
  const gastoPorCategoria = porCategoria(state.contasPagar.filter((c) => dentroDoFiltro(c.data, c.categoria)));
  const receitaPorCategoria = porCategoria(state.contasReceber.filter((c) => dentroDoFiltro(c.data, c.categoria)));

  const projecao = (() => {
    const eventos = [
      ...previstasPagar.map((c) => ({ data: c.data, delta: -Number(c.valor || 0) })),
      ...previstasReceber.map((c) => ({ data: c.data, delta: Number(c.valor || 0) })),
    ].filter((e) => e.data >= today).sort((a, b) => a.data.localeCompare(b.data));
    let saldo = saldoBaixado;
    const pontos = [{ label: toDateBR(today), saldo: Math.round(saldo * 100) / 100 }];
    let primeiraNegativa = null;
    eventos.forEach((e) => {
      saldo = Math.round((saldo + e.delta) * 100) / 100;
      pontos.push({ label: toDateBR(e.data), saldo });
      if (saldo < 0 && !primeiraNegativa) primeiraNegativa = e.data;
    });
    return { pontos, primeiraNegativa };
  })();

  const tooltipFmt = (v) => fmt(v);

  return (
    <div className="ff-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .ff-root {
          --paper:#F5F6F8; --paper-2:#EEF0F3; --ink:#12171C; --ink-soft:#66707B; --rule:#E2E5EA;
          --breath:#0F6D66; --breath-soft:#7FC4BC; --breath-pale:#E4F2F0;
          --tight:#D64545; --tight-pale:#FBEAE9; --gold:#B45309; --gold-pale:#FBEEDD;
          --shadow:0 1px 2px rgba(16,24,40,.06), 0 2px 8px rgba(16,24,40,.05);
          font-family:'IBM Plex Sans',sans-serif; background:var(--paper); color:var(--ink);
          border-radius:10px; padding:20px; max-width:940px; margin:0 auto; box-sizing:border-box;
        }
        .ff-root * { box-sizing:border-box; }
        .num { font-family:'IBM Plex Mono',monospace; font-variant-numeric:tabular-nums; }
        .ff-topbar { display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-bottom:6px; }
        .ff-hero { background:var(--ink); color:var(--paper); border-radius:10px; padding:22px 24px 18px; margin-bottom:16px; box-shadow:var(--shadow); }
        .ff-hero-top { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:10px; }
        .ff-hero-label { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--breath-soft); font-weight:500; }
        .ff-hero-figure { font-family:'Fraunces',serif; font-weight:600; font-size:44px; line-height:1; color:${tenso ? "#F3A5A0" : "#6FE0D3"}; }
        .ff-saldo-inline { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--breath-soft); }
        .ff-saldo-inline input { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.2); color:var(--paper); border-radius:5px; padding:5px 8px; width:130px; font-family:'IBM Plex Mono',monospace; font-size:13px; }
        .saldo-baixado-hint { text-align:right; font-size:11px; color:rgba(245,246,248,.45); margin-top:2px; font-family:'IBM Plex Mono',monospace; }
        .saldo-inicial-box { display:flex; align-items:center; gap:8px; flex-wrap:wrap; background:rgba(255,255,255,.06); border-radius:6px; padding:8px 10px; margin-top:8px; font-size:11.5px; color:var(--breath-soft); }
        .saldo-inicial-box input { background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); color:var(--paper); border-radius:5px; padding:4px 8px; width:110px; font-family:'IBM Plex Mono',monospace; font-size:12.5px; }
        .masked-val { font-family:'IBM Plex Mono',monospace; letter-spacing:2px; }
        .breath-track { position:relative; height:34px; margin-top:16px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden; }
        .breath-fill { position:absolute; inset:0; border-radius:999px; background:linear-gradient(90deg,var(--breath),${tenso ? "#B23636" : "#14B8A6"}); transition:width .4s ease; }
        .breath-pulse { position:absolute; top:50%; left:0; width:10px; height:10px; margin-top:-5px; border-radius:50%; background:#fff; opacity:.85; box-shadow:0 0 10px 2px rgba(255,255,255,.5); animation:breathe 3.4s ease-in-out infinite; }
        @keyframes breathe { 0%{left:2%; transform:scale(.8); opacity:.5;} 50%{left:calc(var(--pct,60%) - 12px); transform:scale(1.15); opacity:1;} 100%{left:2%; transform:scale(.8); opacity:.5;} }
        .ff-hero-foot { display:flex; justify-content:space-between; margin-top:8px; font-size:12px; color:var(--breath-soft); }
        .ff-target { margin-top:10px; font-size:12.5px; color:var(--breath-soft); }
        .ff-target b { color:var(--paper); font-weight:500; }
        .ff-reserve { margin-bottom:16px; }
        .quick-card { background:var(--ink); border-radius:10px; padding:12px 14px; margin-bottom:18px; box-shadow:var(--shadow); }
        .quick-row { display:flex; align-items:center; gap:10px; }
        .quick-input { flex:1; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.16); color:var(--paper); border-radius:6px; padding:9px 12px; font-size:13.5px; font-family:inherit; }
        .quick-input::placeholder { color:rgba(245,246,248,.45); }
        .quick-input:focus { outline:none; border-color:var(--breath-soft); }
        .quick-preview { display:flex; align-items:center; gap:8px; margin-top:9px; font-size:13px; color:var(--paper); }
        .quick-status { font-size:11px; color:var(--breath-soft); }
        .quick-metodo { display:flex; border:1px solid rgba(255,255,255,.18); border-radius:6px; overflow:hidden; flex-shrink:0; }
        .quick-metodo button { background:none; border:none; color:rgba(245,246,248,.6); font-size:11.5px; padding:8px 10px; cursor:pointer; }
        .quick-metodo button.active { background:var(--breath); color:#fff; }
        .quick-cats { display:flex; gap:5px; flex-wrap:wrap; margin-top:8px; }
        .reserve-card { background:#fff; border:1px solid var(--rule); box-shadow:var(--shadow); border-radius:8px; padding:10px 14px; display:flex; align-items:center; gap:10px; max-width:280px; }
        .reserve-card .lbl { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--gold); font-weight:600; }
        .reserve-card .val { font-family:'Fraunces',serif; font-size:18px; margin-top:2px; color:var(--ink); }
        .ff-tabs { display:flex; gap:4px; border-bottom:1px solid var(--rule); margin-bottom:16px; flex-wrap:wrap; }
        .ff-tab { padding:8px 12px; font-size:13px; font-weight:500; color:var(--ink-soft); cursor:pointer; border-bottom:2px solid transparent; background:none; border-top:none; border-left:none; border-right:none; display:flex; align-items:center; gap:6px; }
        .ff-tab.active { color:var(--breath); border-bottom-color:var(--breath); }
        .add-card { background:var(--paper-2); border:1px solid var(--rule); border-radius:8px; padding:14px; margin-bottom:18px; box-shadow:var(--shadow); }
        .add-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .add-row + .add-row { margin-top:8px; }
        .hint { font-size:11.5px; color:var(--ink-soft); margin-top:8px; }
        .inp, .rec-sel { border:1px solid var(--rule); background:#fff; border-radius:5px; padding:7px 9px; font-size:13px; font-family:inherit; }
        .inp-text { flex:1; min-width:150px; }
        .inp-number { width:110px; font-family:'IBM Plex Mono',monospace; }
        .inp-date { width:140px; }
        .chk-label { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--ink-soft); cursor:pointer; }
        .btn-add { background:var(--breath); color:#fff; border:none; border-radius:5px; padding:8px 14px; font-size:13px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:6px; }
        .btn-add:hover { background:#0B5852; }
        .btn-add:disabled { background:rgba(255,255,255,.15); cursor:default; }
        .icon-btn { background:none; border:1px solid var(--rule); color:var(--ink-soft); border-radius:5px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
        .icon-btn:hover { border-color:var(--breath); color:var(--breath); }
        .section-h { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; font-size:11.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-soft); font-weight:600; margin:14px 0 6px; }
        .section-total { font-size:13px; color:var(--ink); text-transform:none; letter-spacing:0; font-weight:600; }
        .filtro-row { display:flex; gap:4px; text-transform:none; letter-spacing:0; flex-wrap:wrap; }
        .filtro-chip { font-size:11px; padding:3px 9px; border-radius:99px; border:1px solid var(--rule); background:#fff; color:var(--ink-soft); cursor:pointer; font-weight:500; }
        .filtro-chip.active { background:var(--breath); border-color:var(--breath); color:#fff; }
        .filtro-bar { display:flex; align-items:center; gap:8px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--rule); flex-wrap:wrap; }
        .filtro-select { border:none; background:none; color:var(--ink); font-size:12.5px; font-weight:500; font-family:inherit; padding:2px 4px; cursor:pointer; }
        .filtro-select:hover { color:var(--breath); }
        .filtro-date { border:none; border-bottom:1px solid var(--rule); background:none; font-size:12px; font-family:inherit; color:var(--ink); padding:2px 2px; }
        .filtro-sep { color:var(--rule); font-size:12px; }
        .filtro-hint { font-size:11.5px; color:var(--ink-soft); }
        .filtro-overlay { position:fixed; inset:0; z-index:10; }
        .filtro-popover { position:absolute; top:26px; left:0; z-index:11; background:#fff; border:1px solid var(--rule); border-radius:7px; box-shadow:0 6px 18px rgba(0,0,0,.1); padding:8px; min-width:180px; max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
        .filtro-popover-clear { align-self:flex-end; font-size:10.5px; color:var(--ink-soft); background:none; border:none; cursor:pointer; margin-bottom:4px; text-decoration:underline; }
        .filtro-popover-item { display:flex; align-items:center; gap:7px; padding:4px 4px; border-radius:4px; cursor:pointer; font-size:12.5px; }
        .filtro-popover-item:hover { background:var(--paper-2); }
        .filtro-popover-item input { accent-color:var(--breath); }
        .ff-list { display:flex; flex-direction:column; gap:1px; background:var(--rule); border-radius:6px; overflow:hidden; border:1px solid var(--rule); }
        .ff-row-wrap { background:#fff; }
        .ff-row { padding:9px 12px; display:flex; align-items:center; gap:8px; font-size:13.5px; flex-wrap:wrap; }
        .ff-row.done { opacity:.55; }
        .ff-row .nome { flex:1; min-width:110px; }
        .ff-row .parcela { color:var(--ink-soft); font-size:11.5px; }
        .cat-badge { font-size:10.5px; padding:2px 7px; border-radius:99px; color:#fff; font-weight:600; white-space:nowrap; }
        .rec-badge { font-size:10.5px; padding:2px 7px; border-radius:5px; background:var(--breath-pale); color:var(--breath); font-weight:600; white-space:nowrap; display:flex; align-items:center; gap:3px; }
        .ff-row .data { color:var(--ink-soft); font-size:12px; width:70px; }
        .ff-row .valor { width:96px; text-align:right; }
        .ff-row input[type=checkbox] { accent-color:var(--breath); width:16px; height:16px; }
        .ff-row .del { background:none; border:none; color:var(--ink-soft); cursor:pointer; padding:0 2px; }
        .ff-row .del:hover { color:var(--tight); }
        .empty { padding:16px; text-align:center; color:var(--ink-soft); font-size:13px; background:#fff; }
        .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:18px; }
        .kpi-card { background:#fff; border:1px solid var(--rule); box-shadow:var(--shadow); border-radius:8px; padding:12px; }
        .kpi-card .lbl { display:flex; align-items:center; gap:6px; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-soft); font-weight:600; }
        .kpi-card .val { font-family:'Fraunces',serif; font-size:17px; margin-top:6px; color:var(--ink); }
        .kpi-card .sub { font-size:11.5px; color:var(--ink-soft); margin-top:2px; }
        .chart-card { background:#fff; border:1px solid var(--rule); box-shadow:var(--shadow); border-radius:8px; padding:14px 14px 6px; margin-bottom:16px; }
        .chart-card h4 { margin:0 0 10px; font-size:13px; font-weight:600; color:var(--ink); }
        .alert-neg { background:var(--tight-pale); color:var(--tight); border-radius:6px; padding:8px 12px; font-size:12.5px; font-weight:600; }
        .alert-ok { background:var(--breath-pale); color:var(--breath); border-radius:6px; padding:8px 12px; font-size:12.5px; font-weight:600; }
        .reajuste-box { background:var(--paper-2); border-top:1px dashed var(--rule); padding:10px 12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        @media (max-width:640px) {
          .ff-hero-figure { font-size:32px; } .kpi-grid { grid-template-columns:1fr 1fr; }
        }
      `}</style>

      <div className="ff-topbar">
        <button
          className="icon-btn"
          title="Exportar backup (JSON)"
          style={{ display: "flex", alignItems: "center", gap: 6, width: "auto", padding: "0 10px", fontSize: 12.5, fontWeight: 600 }}
          onClick={() => {
            const payload = JSON.stringify({ exportadoEm: new Date().toISOString(), ...state }, null, 2);
            const blob = new Blob([payload], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `folego-backup-${todayISO()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          <Download size={15} /> Exportar backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = "";
            if (!f) return;
            try {
              const obj = JSON.parse(await f.text());
              if (!Array.isArray(obj.contasPagar) && !Array.isArray(obj.contasReceber) && !Array.isArray(obj.recorrencias)) throw new Error("formato inesperado");
              setErroSync("");
              setImportPendente(obj);
            } catch (err) {
              setErroSync("Arquivo de backup inválido: " + err.message);
            }
          }}
        />
        <button
          className="icon-btn"
          title="Importar backup (JSON)"
          style={{ display: "flex", alignItems: "center", gap: 6, width: "auto", padding: "0 10px", fontSize: 12.5, fontWeight: 600 }}
          onClick={() => fileRef.current && fileRef.current.click()}
        >
          <Upload size={15} /> Importar backup
        </button>
        <button className="icon-btn" title={hidden ? "Mostrar valores" : "Ocultar valores"} onClick={() => update((s) => ({ ...s, valoresOcultos: !s.valoresOcultos }))}>
          {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button className="icon-btn" title="Sair" style={{ display: "flex", alignItems: "center", gap: 6, width: "auto", padding: "0 10px", fontSize: 12.5, fontWeight: 600 }} onClick={onSignOut}>
          <LogOut size={15} /> Sair
        </button>
      </div>
      {erroSync && (
        <div style={{ background: "#FDE8E0", color: "#9A3412", padding: "8px 12px", borderRadius: 6, fontSize: 13, margin: "8px 0" }}>{erroSync}</div>
      )}
      {msgOk && (
        <div style={{ background: "#DDF3EA", color: "#0F6D66", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, margin: "8px 0" }}>{msgOk}</div>
      )}
      {importPendente && (
        <div style={{ background: "#FFF7E0", border: "1px solid #E5C766", padding: "12px 14px", borderRadius: 8, fontSize: 13.5, margin: "8px 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            Backup lido: <b>{(importPendente.contasPagar || []).length}</b> contas a pagar, <b>{(importPendente.contasReceber || []).length}</b> a receber e <b>{(importPendente.recorrencias || []).length}</b> recorrências.
            Importar vai <b>substituir</b> os dados atuais do app.
          </span>
          <button
            className="icon-btn"
            style={{ width: "auto", padding: "6px 12px", fontWeight: 600 }}
            onClick={() => {
              const obj = importPendente;
              setImportPendente(null);
              setState(normalizeState(obj));
              setMsgOk(`Backup importado: ${(obj.contasPagar || []).length} contas a pagar, ${(obj.contasReceber || []).length} a receber, ${(obj.recorrencias || []).length} recorrências. Salvando na nuvem…`);
              setTimeout(() => setMsgOk(""), 9000);
            }}
          >
            Substituir e importar
          </button>
          <button className="icon-btn" style={{ width: "auto", padding: "6px 12px" }} onClick={() => setImportPendente(null)}>Cancelar</button>
        </div>
      )}

      {/* HERO */}
      <div className="ff-hero" style={{ "--pct": `${pct}%` }}>
        <div className="ff-hero-top">
          <div>
            <div className="ff-hero-label">Fôlego financeiro</div>
            <div className="ff-hero-figure num">{hidden ? "•••• / dia" : `${brl(folegoDiario)} / dia`}</div>
          </div>
          <div>
            <div className="ff-saldo-inline">
              Saldo planejado
              {hidden
                ? <span className="masked-val">••••••</span>
                : <span className="num" style={{ fontWeight: 600, color: "var(--paper)" }}>{brl(saldoAtual)}</span>}
              <button className="icon-btn" title="Editar saldo inicial" onClick={() => setEditarSaldoInicial((v) => !v)} style={{ borderColor: "rgba(255,255,255,.25)", color: "var(--breath-soft)" }}>
                <Pencil size={12} />
              </button>
            </div>
            {!hidden && <div className="saldo-baixado-hint">Confirmado: {brl(saldoBaixado)}</div>}
          </div>
        </div>
        {editarSaldoInicial && (
          <div className="saldo-inicial-box">
            <span>Saldo inicial — o que você já tinha antes de começar a usar o sistema</span>
            <input type="number" step="0.01" value={state.saldoInicial} onChange={(e) => update((s) => ({ ...s, saldoInicial: e.target.value }))} />
            <span className="hint" style={{ margin: 0, color: "var(--breath-soft)" }}>A partir daqui, o saldo confirmado se atualiza sozinho conforme você registra pagamentos e recebimentos.</span>
          </div>
        )}
        <div className="breath-track"><div className="breath-fill" style={{ width: `${pct}%` }} /><div className="breath-pulse" /></div>
        <div className="ff-hero-foot"><span>Hoje · {toDateBR(today)}</span><span>{periodoEncerrado ? 0 : diasPeriodo} dias no período</span></div>
        <div className="ff-target">
          {periodoEncerrado
            ? <>Período (<b>{toDateBR(rangeAtual.inicio)} – {toDateBR(rangeAtual.fim)}</b>) já terminou — fôlego zerado.</>
            : <>Confirmado + previsto do período ÷ dias restantes{rangeAtual ? <> · <b>{toDateBR(today)} – {toDateBR(fimPeriodo)}</b></> : <> · próximos 30 dias</>}</>}
        </div>
      </div>

      <GastoRapido categorias={state.categoriasDespesa} historico={state.contasPagar} onAdd={adicionarGastoRapido} fmt={fmt} cartaoConfig={state.cartaoConfig} />

      <div className="ff-tabs">
        {[
          ["pagar", "Contas a pagar"], ["receber", "Contas a receber"],
          ["investimento", "Investimentos"], ["guardado", "Guardado"], ["analitico", "Análise"],
        ].map(([key, label]) => (
          <button key={key} className={`ff-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {key === "analitico" && <BarChart3 size={14} />}{label}
          </button>
        ))}
      </div>

      <FiltroBar filtro={filtro} setFiltro={setFiltro} rangeAtual={rangeAtual} todasCategorias={todasCategorias} />

      {tab === "pagar" && (
        <ContaTab tipo="pagar" items={state.contasPagar} categorias={state.categoriasDespesa}
          statusLabels={{ prevista: "Previsão", efetivada: "Já paguei" }}
          onAdd={(form) => handleAddConta("pagar", form)}
          onBaixar={(id, v, d) => baixarConta("pagar", id, v, d)}
          onReverter={(id) => reverterConta("pagar", id)}
          onDel={(c, modo) => excluirConta("pagar", c, modo)}
          onEditar={(id, campos) => editarConta("pagar", id, campos)}
          onNovaCategoria={(nome) => update((s) => ({ ...s, categoriasDespesa: [...s.categoriasDespesa, nome] }))}
          onReajuste={reajustarRecorrencia} onEditarParcela={(grupoId, itemId, v, modo, d) => editarParcela("pagar", grupoId, itemId, v, modo, d)}
          fmt={fmt} dentroDoFiltro={dentroDoFiltro}
          cartaoConfig={state.cartaoConfig} onSalvarCartaoConfig={(cfg) => update((s) => ({ ...s, cartaoConfig: cfg }))} />
      )}

      {tab === "receber" && (
        <ContaTab tipo="receber" items={state.contasReceber} categorias={state.categoriasReceita}
          statusLabels={{ prevista: "Previsão", efetivada: "Já recebi" }}
          onAdd={(form) => handleAddConta("receber", form)}
          onBaixar={(id, v, d) => baixarConta("receber", id, v, d)}
          onReverter={(id) => reverterConta("receber", id)}
          onDel={(c, modo) => excluirConta("receber", c, modo)}
          onEditar={(id, campos) => editarConta("receber", id, campos)}
          onNovaCategoria={(nome) => update((s) => ({ ...s, categoriasReceita: [...s.categoriasReceita, nome] }))}
          onReajuste={reajustarRecorrencia} onEditarParcela={(grupoId, itemId, v, modo, d) => editarParcela("receber", grupoId, itemId, v, modo, d)}
          fmt={fmt} dentroDoFiltro={dentroDoFiltro} />
      )}

      {tab === "investimento" && (
        <SimpleMoneyList items={state.investimentos} fmt={fmt} dentroDoFiltro={dentroDoPeriodo}
          onAdd={(v) => update((s) => ({ ...s, investimentos: [...s.investimentos, { id: uid(), ...v }] }))}
          onDel={(id) => update((s) => ({ ...s, investimentos: s.investimentos.filter((x) => x.id !== id) }))}
          onEditar={(id, campos) => update((s) => ({ ...s, investimentos: s.investimentos.map((x) => (x.id === id ? { ...x, ...campos } : x)) }))}
          emptyText="Nenhum investimento cadastrado" />
      )}

      {tab === "guardado" && (
        <SimpleMoneyList items={state.guardado} fmt={fmt} dentroDoFiltro={() => true}
          onAdd={(v) => update((s) => ({ ...s, guardado: [...s.guardado, { id: uid(), ...v }] }))}
          onDel={(id) => update((s) => ({ ...s, guardado: s.guardado.filter((x) => x.id !== id) }))}
          onEditar={(id, campos) => update((s) => ({ ...s, guardado: s.guardado.map((x) => (x.id === id ? { ...x, ...campos } : x)) }))}
          emptyText="Nada guardado ainda" />
      )}

      {tab === "analitico" && (
        <div>
          <div className="kpi-grid">
            <div className="kpi-card"><div className="lbl"><TrendingDown size={13} />Maior gasto</div>
              <div className="val">{gastoPorCategoria[0]?.categoria || "—"}</div>
              <div className="sub num">{fmt(gastoPorCategoria[0]?.total || 0)}</div></div>
            <div className="kpi-card"><div className="lbl"><TrendingUp size={13} />Maior receita</div>
              <div className="val">{receitaPorCategoria[0]?.categoria || "—"}</div>
              <div className="sub num">{fmt(receitaPorCategoria[0]?.total || 0)}</div></div>
            <div className="kpi-card"><div className="lbl"><Target size={13} />Desvio do planejado (mês)</div>
              {desvioMes >= 0
                ? <><div className="val" style={{ color: "var(--breath)" }}>Economizou</div><div className="sub num">{fmt(desvioMes)}</div></>
                : <><div className="val" style={{ color: "var(--tight)" }}>Passou do previsto</div><div className="sub num">{fmt(Math.abs(desvioMes))}</div></>}
            </div>
            <div className="kpi-card"><div className="lbl"><AlertTriangle size={13} />Saldo projetado</div>
              {projecao.primeiraNegativa
                ? <><div className="val" style={{ color: "var(--tight)" }}>Fica negativo</div><div className="sub">em {toDateBR(projecao.primeiraNegativa)}</div></>
                : <><div className="val" style={{ color: "var(--breath)" }}>Positivo</div><div className="sub">em todo o período previsto</div></>}
            </div>
            <div className="kpi-card"><div className="lbl"><TrendingUp size={13} />Receitas do mês</div>
              <div className="val num" style={{ fontSize: 16 }}>{fmt(totalReceitaMes)}</div></div>
            <div className="kpi-card"><div className="lbl"><TrendingDown size={13} />Despesas do mês</div>
              <div className="val num" style={{ fontSize: 16 }}>{fmt(totalDespesaMes)}</div></div>
            <div className="kpi-card"><div className="lbl"><Percent size={13} />Taxa de poupança</div>
              {taxaPoupanca == null
                ? <div className="val" style={{ fontSize: 14 }}>Sem receita no mês</div>
                : <div className="val" style={{ color: taxaPoupanca >= 0 ? "var(--breath)" : "var(--tight)" }}>{taxaPoupanca.toFixed(0)}%</div>}
            </div>
            <div className="kpi-card"><div className="lbl"><Landmark size={13} />Contas em aberto</div>
              <div className="sub num">A pagar <b>{fmt(totalPendentePagar)}</b></div>
              <div className="sub num">A receber <b>{fmt(totalPendenteReceber)}</b></div>
            </div>
          </div>

          <div className="chart-card">
            <h4>Receita x despesa — últimos 6 meses</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={historicoMeses} margin={{ left: 4, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="mes" fontSize={11} stroke="var(--ink-soft)" />
                <YAxis tickFormatter={fmtShort} fontSize={11} stroke="var(--ink-soft)" />
                <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <Bar dataKey="receita" name="Receita" radius={[4, 4, 0, 0]} fill="var(--breath)" />
                <Bar dataKey="despesa" name="Despesa" radius={[4, 4, 0, 0]} fill="var(--tight)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <h4>Para onde vai seu dinheiro (por categoria)</h4>
            {gastoPorCategoria.length ? (
              <ResponsiveContainer width="100%" height={Math.max(120, gastoPorCategoria.length * 34)}>
                <BarChart data={gastoPorCategoria} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtShort} fontSize={11} stroke="var(--ink-soft)" />
                  <YAxis type="category" dataKey="categoria" width={110} fontSize={12} stroke="var(--ink-soft)" />
                  <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>{gastoPorCategoria.map((e, i) => <Cell key={i} fill={catColor(e.categoria)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="empty">Sem contas a pagar cadastradas ainda</div>}
          </div>

          <div className="chart-card">
            <h4>Projeção de saldo (contas previstas)</h4>
            {projecao.primeiraNegativa
              ? <div className="alert-neg">Se nada mudar, seu saldo fica negativo em {toDateBR(projecao.primeiraNegativa)}.</div>
              : <div className="alert-ok">Seu saldo se mantém positivo em todo o período com contas previstas.</div>}
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={projecao.pontos} margin={{ top: 14, left: 4, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="label" fontSize={10.5} stroke="var(--ink-soft)" />
                <YAxis tickFormatter={fmtShort} fontSize={11} stroke="var(--ink-soft)" />
                <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                <ReferenceLine y={0} stroke="var(--tight)" strokeDasharray="4 4" />
                <Area type="stepAfter" dataKey="saldo" stroke="var(--breath)" fill="var(--breath-pale)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- contas a pagar / receber ----------
// ---------- barra de filtro minimalista (período + categorias) ----------
function FiltroBar({ filtro, setFiltro, rangeAtual, todasCategorias }) {
  const [catAberto, setCatAberto] = useState(false);
  const nCat = filtro.categorias.length;
  const meses = listaMeses(todayISO());

  const toggleCategoria = (c) => {
    const set = filtro.categorias.includes(c) ? filtro.categorias.filter((x) => x !== c) : [...filtro.categorias, c];
    setFiltro({ ...filtro, categorias: set });
  };

  const selecionarPeriodo = (valor) => {
    if (valor === "todas" || valor === "custom") setFiltro({ ...filtro, tipo: valor });
    else setFiltro({ ...filtro, tipo: "mes", mes: valor });
  };

  return (
    <div className="filtro-bar">
      <select className="filtro-select" value={filtro.tipo === "mes" ? filtro.mes : filtro.tipo} onChange={(e) => selecionarPeriodo(e.target.value)}>
        <option value="todas">Todo período</option>
        {meses.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        <option value="custom">Período personalizado…</option>
      </select>

      {filtro.tipo === "custom" && (
        <>
          <input className="filtro-date" type="date" value={filtro.inicio} onChange={(e) => setFiltro({ ...filtro, inicio: e.target.value })} />
          <span className="filtro-sep">até</span>
          <input className="filtro-date" type="date" value={filtro.fim} onChange={(e) => setFiltro({ ...filtro, fim: e.target.value })} />
        </>
      )}
      {filtro.tipo === "mes" && rangeAtual && (
        <span className="filtro-hint">{toDateBR(rangeAtual.inicio)}–{toDateBR(rangeAtual.fim)}</span>
      )}

      <span className="filtro-sep">·</span>

      <div style={{ position: "relative" }}>
        <button className="filtro-select" style={{ cursor: "pointer" }} onClick={() => setCatAberto((v) => !v)}>
          {nCat === 0 ? "Todas as categorias" : `${nCat} categoria${nCat > 1 ? "s" : ""}`}
        </button>
        {catAberto && (
          <>
            <div className="filtro-overlay" onClick={() => setCatAberto(false)} />
            <div className="filtro-popover">
              <button className="filtro-popover-clear" onClick={() => setFiltro({ ...filtro, categorias: [] })}>Limpar seleção</button>
              {todasCategorias.map((c) => (
                <label key={c} className="filtro-popover-item">
                  <input type="checkbox" checked={filtro.categorias.includes(c)} onChange={() => toggleCategoria(c)} />
                  <span className="cat-badge" style={{ background: catColor(c) }}>{c}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- lançamento rápido do dia a dia ----------
function GastoRapido({ categorias, historico, onAdd, fmt, cartaoConfig }) {
  const [texto, setTexto] = useState("");
  const [catManual, setCatManual] = useState(null);
  const [metodo, setMetodo] = useState("debito"); // "debito" | "credito"
  const parsed = parseGastoRapido(texto);
  const categoria = parsed ? catManual || sugerirCategoria(parsed.nome, categorias, historico) : null;
  const dataFatura = metodo === "credito" ? calcularVencimentoFatura(todayISO(), cartaoConfig.fechamento, cartaoConfig.vencimento) : todayISO();

  const submit = () => {
    if (!parsed) return;
    onAdd({ nome: parsed.nome, categoria, valor: parsed.valor, data: dataFatura, status: metodo === "credito" ? "prevista" : "efetivada" });
    setTexto(""); setCatManual(null); setMetodo("debito");
  };

  return (
    <div className="quick-card">
      <div className="quick-row">
        <Zap size={16} color="var(--breath)" />
        <input
          className="quick-input"
          placeholder='Lançar rápido: "almoço 32", "uber 18"…'
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setCatManual(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <div className="quick-metodo">
          <button className={metodo === "debito" ? "active" : ""} onClick={() => setMetodo("debito")}>Débito</button>
          <button className={metodo === "credito" ? "active" : ""} onClick={() => setMetodo("credito")}>Crédito</button>
        </div>
        <button className="btn-add" onClick={submit} disabled={!parsed}><Plus size={14} />Lançar</button>
      </div>
      {parsed && (
        <div className="quick-preview">
          <span className="cat-badge" style={{ background: catColor(categoria) }}>{categoria}</span>
          <span>{parsed.nome}</span>
          <span className="num" style={{ marginLeft: "auto" }}>{fmt(parsed.valor)}</span>
          <span className="quick-status">{metodo === "credito" ? `Vai para a fatura de ${toDateBR(dataFatura)}` : "Pago hoje"}</span>
        </div>
      )}
      {parsed && (
        <div className="quick-cats">
          {categorias.map((c) => (
            <button key={c} className={`filtro-chip ${categoria === c ? "active" : ""}`} onClick={() => setCatManual(c)}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContaTab({ tipo, items, categorias, statusLabels, onAdd, onBaixar, onReverter, onDel, onEditar, onEditarParcela, onNovaCategoria, onReajuste, fmt, dentroDoFiltro, cartaoConfig, onSalvarCartaoConfig }) {
  const previstas = [...items].filter((c) => c.status === "prevista" && dentroDoFiltro(c.data, c.categoria)).sort((a, b) => a.data.localeCompare(b.data));
  const efetivadas = [...items].filter((c) => c.status === "efetivada" && dentroDoFiltro(c.data, c.categoria)).sort((a, b) => b.data.localeCompare(a.data));
  const totalPrevistas = previstas.reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalEfetivadas = efetivadas.reduce((s, c) => s + Number(c.valor || 0), 0);

  return (
    <div>
      <AddContaForm categorias={categorias} onAdd={onAdd} onNovaCategoria={onNovaCategoria} tipo={tipo} cartaoConfig={cartaoConfig} onSalvarCartaoConfig={onSalvarCartaoConfig} />
      <div className="section-h">
        <span>{statusLabels.prevista} · pendente</span>
        <span className="section-total num">{fmt(totalPrevistas)}</span>
      </div>
      <div className="ff-list">
        {previstas.length === 0 && <div className="empty">Nenhuma conta prevista nesse período</div>}
        {previstas.map((c) => <Row key={c.id} c={c} tipo={tipo} categorias={categorias} onBaixar={onBaixar} onReverter={onReverter} onDel={onDel} onEditar={onEditar} onEditarParcela={onEditarParcela} onReajuste={onReajuste} fmt={fmt} />)}
      </div>
      <div className="section-h">
        <span>{statusLabels.efetivada}</span>
        <span className="section-total num">{fmt(totalEfetivadas)}</span>
      </div>
      <div className="ff-list">
        {efetivadas.length === 0 && <div className="empty">Nada por aqui ainda</div>}
        {efetivadas.map((c) => <Row key={c.id} c={c} tipo={tipo} categorias={categorias} onBaixar={onBaixar} onReverter={onReverter} onDel={onDel} onEditar={onEditar} onEditarParcela={onEditarParcela} onReajuste={onReajuste} fmt={fmt} done />)}
      </div>
    </div>
  );
}

function Row({ c, tipo, categorias, onBaixar, onReverter, onDel, onEditar, onEditarParcela, onReajuste, fmt, done }) {
  const [modo, setModo] = useState(null); // null | "baixa" | "reajuste" | "apagar" | "editar"
  const [valorBaixa, setValorBaixa] = useState(c.valor);
  const [dataBaixa, setDataBaixa] = useState(c.data);
  const [camposPendentes, setCamposPendentes] = useState(null);
  const [editNome, setEditNome] = useState(c.nome);
  const [editCategoria, setEditCategoria] = useState(c.categoria);
  const [editData, setEditData] = useState(c.data);
  const [editValor, setEditValor] = useState(c.valor);
  const recorrente = !!c.origemRecorrenciaId;
  const parcelado = !!c.grupoId;
  const emSerie = recorrente || parcelado;
  const editado = c.status === "efetivada" && Number(c.valorPlanejado) !== Number(c.valor);

  const salvarEdicao = () => {
    // nome, categoria e valor fazem sentido cascatear pras próximas ocorrências; data é sempre só dessa
    const campos = {};
    if (editNome !== c.nome) campos.nome = editNome;
    if (editCategoria !== c.categoria) campos.categoria = editCategoria;
    if (Number(editValor) !== Number(c.valor)) campos.valor = Number(editValor);
    const dataMudou = editData !== c.data;
    const temMudancaCascatavel = Object.keys(campos).length > 0;

    if (temMudancaCascatavel && emSerie && c.status === "prevista") {
      if (dataMudou) onEditar(c.id, { data: editData });
      setCamposPendentes(campos);
      setModo("reajuste");
    } else {
      const extra = campos.valor != null && c.status === "prevista" ? { valorPlanejado: campos.valor } : {};
      onEditar(c.id, { ...campos, ...(dataMudou ? { data: editData } : {}), ...extra });
      setModo(null);
    }
  };

  const aplicarEscopo = (escopo) => {
    const campos = c.status === "prevista" && camposPendentes.valor != null ? { ...camposPendentes, valorPlanejado: camposPendentes.valor } : camposPendentes;
    if (recorrente) onReajuste(c.origemRecorrenciaId, c.id, campos, escopo, c.data);
    else onEditarParcela(c.grupoId, c.id, campos, escopo, c.data);
    setModo(null); setCamposPendentes(null);
  };

  return (
    <div className="ff-row-wrap">
      <div className={`ff-row ${done ? "done" : ""}`}>
        <input
          type="checkbox"
          checked={c.status === "efetivada"}
          onChange={() => (c.status === "efetivada" ? onReverter(c.id) : setModo(modo === "baixa" ? null : "baixa"))}
        />
        <span className="cat-badge" style={{ background: catColor(c.categoria) }}>{c.categoria}</span>
        <span className="nome">
          {c.nome} {c.totalParcelas > 1 && <span className="parcela">· parcela {c.parcela}/{c.totalParcelas}</span>}
        </span>
        {recorrente && <span className="rec-badge"><Repeat size={11} />Sem fim</span>}
        <span className="data num">{toDateBR(c.data)}</span>
        <span className="valor num">
          {fmt(c.valor)}
          {editado && <span className="parcela"> (previsto {fmt(c.valorPlanejado)})</span>}
        </span>
        <button className="icon-btn" title="Editar" onClick={() => (modo === "editar" ? setModo(null) : (setEditNome(c.nome), setEditCategoria(c.categoria), setEditData(c.data), setEditValor(c.valor), setModo("editar")))}>
          {modo === "editar" ? <X size={13} /> : <Pencil size={13} />}
        </button>
        <button className="del" title="Excluir" onClick={() => (emSerie ? setModo(modo === "apagar" ? null : "apagar") : onDel(c, "este"))}><Trash2 size={14} /></button>
      </div>

      {modo === "editar" && (
        <div className="reajuste-box">
          <input className="inp inp-text" style={{ minWidth: 130 }} value={editNome} onChange={(e) => setEditNome(e.target.value)} />
          <select className="rec-sel" value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)}>
            {categorias.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <input className="inp inp-date" type="date" value={editData} onChange={(e) => setEditData(e.target.value)} />
          <input className="inp inp-number" type="number" step="0.01" value={editValor} onChange={(e) => setEditValor(e.target.value)} />
          <button className="btn-add" onClick={salvarEdicao}><Check size={13} />Salvar</button>
        </div>
      )}

      {modo === "baixa" && (
        <div className="reajuste-box">
          <span style={{ fontSize: 12.5 }}>Valor {tipo === "pagar" ? "pago" : "recebido"}</span>
          <input className="inp inp-number" type="number" step="0.01" value={valorBaixa} onChange={(e) => setValorBaixa(e.target.value)} />
          <span style={{ fontSize: 12.5 }}>Data</span>
          <input className="inp inp-date" type="date" value={dataBaixa} onChange={(e) => setDataBaixa(e.target.value)} />
          <button className="btn-add" onClick={() => { onBaixar(c.id, valorBaixa, dataBaixa); setModo(null); }}><Check size={13} />Confirmar baixa</button>
        </div>
      )}
      {modo === "apagar" && (
        <div className="reajuste-box">
          <span style={{ fontSize: 12.5 }}>Excluir {done ? "dos já confirmados" : "das previsões"}:</span>
          <button className="filtro-chip" onClick={() => { onDel(c, "este"); setModo(null); }}>Só esta parcela</button>
          <button className="filtro-chip" onClick={() => { onDel(c, "futuro"); setModo(null); }}>Essa e as próximas</button>
          <button className="filtro-chip" onClick={() => { onDel(c, "todos"); setModo(null); }}>Todas</button>
        </div>
      )}
      {modo === "reajuste" && camposPendentes && (
        <div className="reajuste-box">
          <span style={{ fontSize: 12.5 }}>
            Alterar {[
              camposPendentes.nome != null && "nome",
              camposPendentes.categoria != null && "categoria",
              camposPendentes.valor != null && "valor",
            ].filter(Boolean).join(", ")} — aplicar em:
          </span>
          <button className="filtro-chip" onClick={() => aplicarEscopo("este")}>Só esta parcela</button>
          <button className="filtro-chip" onClick={() => aplicarEscopo("futuro")}>Essa e as próximas</button>
          <button className="filtro-chip" onClick={() => aplicarEscopo("todos")}>Todas</button>
        </div>
      )}
    </div>
  );
}

function AddContaForm({ categorias, onAdd, onNovaCategoria, tipo, cartaoConfig, onSalvarCartaoConfig }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState(categorias[0] || "Outros");
  const [novaCatMode, setNovaCatMode] = useState(false);
  const [novaCat, setNovaCat] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(todayISO());
  const [recorrente, setRecorrente] = useState(false);
  const [freq, setFreq] = useState("mensal");
  const [parcelas, setParcelas] = useState(0);
  const [efetivada, setEfetivada] = useState(false);
  const [cartao, setCartao] = useState(false);
  const [fechamento, setFechamento] = useState(cartaoConfig?.fechamento ?? 18);
  const [vencimento, setVencimento] = useState(cartaoConfig?.vencimento ?? 25);
  const [valorTipo, setValorTipo] = useState("parcela"); // "parcela" | "total" — só relevante pra cartão parcelado

  const confirmarNovaCategoria = () => {
    if (!novaCat.trim()) return;
    onNovaCategoria(novaCat.trim());
    setCategoria(novaCat.trim());
    setNovaCat(""); setNovaCatMode(false);
  };

  const dataFatura = cartao ? calcularVencimentoFatura(data, Number(fechamento) || 1, Number(vencimento) || 1) : data;
  const ehCartaoParcelado = cartao && recorrente && Number(parcelas) >= 2;
  const valorPorParcela = ehCartaoParcelado && valorTipo === "total" ? Number(valor || 0) / Number(parcelas) : Number(valor || 0);

  const submit = () => {
    if (!nome || !valor) return;
    if (cartao && onSalvarCartaoConfig) onSalvarCartaoConfig({ fechamento: Number(fechamento), vencimento: Number(vencimento) });
    onAdd({ nome, categoria, valor: valorPorParcela, data: dataFatura, recorrente, freq, parcelas, efetivada });
    setNome(""); setValor(""); setRecorrente(false); setParcelas(0); setEfetivada(false); setValorTipo("parcela");
  };

  return (
    <div className="add-card">
      <div className="add-row">
        <input className="inp inp-text" placeholder={tipo === "pagar" ? "Descrição (ex.: aluguel, mercado)" : "Descrição (ex.: salário, bônus)"} value={nome} onChange={(e) => setNome(e.target.value)} />
        {!novaCatMode ? (
          <select className="rec-sel" value={categoria} onChange={(e) => (e.target.value === "__nova" ? setNovaCatMode(true) : setCategoria(e.target.value))}>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__nova">+ Nova categoria…</option>
          </select>
        ) : (
          <>
            <input className="inp" style={{ width: 140 }} placeholder="Nome da categoria" value={novaCat} onChange={(e) => setNovaCat(e.target.value)} />
            <button className="btn-add" onClick={confirmarNovaCategoria}>Salvar</button>
          </>
        )}
        <input className="inp inp-number" type="number" step="0.01" placeholder="Valor" value={valor} onChange={(e) => setValor(e.target.value)} />
        <input className="inp inp-date" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </div>
      {tipo === "pagar" && (
        <div className="add-row">
          <label className="chk-label"><input type="checkbox" checked={cartao} onChange={(e) => setCartao(e.target.checked)} />Compra no cartão de crédito</label>
          {cartao && (
            <>
              <label className="chk-label">Fecha dia <input className="inp inp-number" style={{ width: 55 }} type="number" min="1" max="31" value={fechamento} onChange={(e) => setFechamento(e.target.value)} /></label>
              <label className="chk-label">Vence dia <input className="inp inp-number" style={{ width: 55 }} type="number" min="1" max="31" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></label>
              <span className="hint" style={{ margin: 0 }}>Vai para a fatura de <b>{toDateBR(dataFatura)}</b></span>
            </>
          )}
        </div>
      )}
      <div className="add-row">
        <label className="chk-label"><input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />Recorrente</label>
        {recorrente && (
          <>
            <select className="rec-sel" value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option>
            </select>
            <input className="inp inp-number" style={{ width: 130 }} type="number" min="0" placeholder="Parcelas" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
            <span className="hint" style={{ margin: 0 }}>0 = sem fim, repete para sempre{cartao ? " · cada parcela vai para a fatura seguinte" : ""}</span>
          </>
        )}
        <label className="chk-label"><input type="checkbox" checked={efetivada} onChange={(e) => setEfetivada(e.target.checked)} />Já {tipo === "pagar" ? "paguei" : "recebi"}</label>
        <button className="btn-add" onClick={submit}><Plus size={14} />Adicionar</button>
      </div>
      {ehCartaoParcelado && (
        <div className="add-row">
          <span className="hint" style={{ margin: 0 }}>O valor digitado é:</span>
          <label className="chk-label"><input type="radio" name="valorTipo" checked={valorTipo === "parcela"} onChange={() => setValorTipo("parcela")} />O valor de cada parcela</label>
          <label className="chk-label"><input type="radio" name="valorTipo" checked={valorTipo === "total"} onChange={() => setValorTipo("total")} />O valor total da compra</label>
          {valorTipo === "total" && Number(valor) > 0 && (
            <span className="hint" style={{ margin: 0 }}>→ {Number(parcelas)}x de <b>{brl(valorPorParcela)}</b></span>
          )}
        </div>
      )}
    </div>
  );
}

function SimpleMoneyList({ items, onAdd, onDel, onEditar, emptyText, fmt, dentroDoFiltro }) {
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(todayISO());
  const filtrados = [...items].filter((i) => dentroDoFiltro(i.data || todayISO())).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  return (
    <div>
      <div className="add-card">
        <div className="add-row">
          <input className="inp inp-text" placeholder="Descrição" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className="inp inp-number" type="number" step="0.01" placeholder="Valor" value={valor} onChange={(e) => setValor(e.target.value)} />
          <input className="inp inp-date" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <button className="btn-add" onClick={() => { if (!nome) return; onAdd({ nome, valor: valor || 0, data }); setNome(""); setValor(""); }}><Plus size={14} />Adicionar</button>
        </div>
      </div>
      <div className="ff-list">
        {filtrados.length === 0 && <div className="empty">{emptyText}</div>}
        {filtrados.map((i) => <SimpleMoneyRow key={i.id} i={i} onDel={onDel} onEditar={onEditar} fmt={fmt} />)}
      </div>
    </div>
  );
}

function SimpleMoneyRow({ i, onDel, onEditar, fmt }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(i.nome);
  const [valor, setValor] = useState(i.valor);
  const [data, setData] = useState(i.data);

  const abrirEdicao = () => { setNome(i.nome); setValor(i.valor); setData(i.data); setEditando(true); };
  const salvar = () => { onEditar(i.id, { nome, valor: Number(valor), data }); setEditando(false); };

  return (
    <div className="ff-row-wrap">
      <div className="ff-row">
        <span className="nome">{i.nome}</span>
        <span className="data num">{toDateBR(i.data)}</span>
        <span className="valor num">{fmt(i.valor)}</span>
        <button className="icon-btn" title="Editar" onClick={() => (editando ? setEditando(false) : abrirEdicao())}>{editando ? <X size={13} /> : <Pencil size={13} />}</button>
        <button className="del" onClick={() => onDel(i.id)}><Trash2 size={14} /></button>
      </div>
      {editando && (
        <div className="reajuste-box">
          <input className="inp inp-text" style={{ minWidth: 120 }} value={nome} onChange={(e) => setNome(e.target.value)} />
          <input className="inp inp-number" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          <input className="inp inp-date" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <button className="btn-add" onClick={salvar}><Check size={13} />Salvar</button>
        </div>
      )}
    </div>
  );
}
