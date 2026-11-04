import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  TrendingDown, TrendingUp, BarChart3, AlertTriangle, PiggyBank, Landmark,
  Plus, Trash2, CalendarClock, Repeat, Pause, Play, Pencil, X, LogOut,
} from 'lucide-react';

// Supabase Setup
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Helpers
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const toDateBR = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const addDaysISO = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonthISO = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const CATEGORY_COLORS = ['#3E6259', '#8C6A2F', '#B6552E', '#5C6B96', '#4A7A7E', '#96693B', '#6B7A4A', '#9C5B6B'];
const catColor = (name) => {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
};

const DEFAULT_CAT_DESPESA = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Assinaturas', 'Cartão de crédito', 'Outros'];
const DEFAULT_CAT_RECEITA = ['Salário', 'Freelance / Extra', 'Investimentos', 'Reembolso', 'Outros'];

export default function FolegoFinanceiro() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pagar');
  const [state, setState] = useState({
    saldoAtual: 0,
    categoriasDespesa: DEFAULT_CAT_DESPESA,
    categoriasReceita: DEFAULT_CAT_RECEITA,
    contasPagar: [],
    contasReceber: [],
    recorrenciasFixas: [],
    investimentos: [],
    guardado: [],
  });

  useEffect(() => {
    // Check auth
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setUser(session.user);
        loadData(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });
  }, []);

  const loadData = async (userId) => {
    try {
      // Load user config
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('saldo_atual')
        .eq('id', userId)
        .single();

      if (usuario) {
        setState((s) => ({ ...s, saldoAtual: usuario.saldo_atual }));
      } else {
        // First login: create usuario record
        await supabase.from('usuarios').insert([{ id: userId, saldo_atual: 0 }]);
      }

      // Load all data
      const [contas_pagar, contas_receber, investimentos, guardado] = await Promise.all([
        supabase.from('contas_pagar').select('*').eq('usuario_id', userId),
        supabase.from('contas_receber').select('*').eq('usuario_id', userId),
        supabase.from('investimentos').select('*').eq('usuario_id', userId),
        supabase.from('guardado').select('*').eq('usuario_id', userId),
      ]);

      setState((s) => ({
        ...s,
        contasPagar: contas_pagar.data || [],
        contasReceber: contas_receber.data || [],
        investimentos: investimentos.data || [],
        guardado: guardado.data || [],
      }));
    } catch (e) {
      console.error('Load error:', e);
    }
    setLoading(false);
  };

  const update = async (fn) => {
    setState((s) => fn(structuredClone(s)));
    // Sync updates to Supabase (debounced in real app)
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Carregando...</div>;

  if (!user) {
    return <AuthScreen />;
  }

  // Calculations
  const today = todayISO();
  const previstasPagar = state.contasPagar.filter((c) => c.status === 'prevista');
  const previstasReceber = state.contasReceber.filter((c) => c.status === 'prevista');

  const grandes = previstasPagar.filter((c) => c.grande && c.data >= today).sort((a, b) => a.data.localeCompare(b.data));
  let targetDate, targetLabel;
  if (grandes.length) {
    targetDate = grandes[0].data;
    targetLabel = grandes[0].nome;
  } else {
    const candidatos = [...previstasPagar, ...previstasReceber].filter((c) => c.data >= today).sort((a, b) => a.data.localeCompare(b.data));
    if (candidatos.length) {
      targetDate = candidatos[0].data;
      targetLabel = candidatos[0].nome;
    } else {
      targetDate = addDaysISO(today, 30);
      targetLabel = 'próximos 30 dias';
    }
  }

  const daysRemaining = Math.max(1, daysBetween(today, targetDate));
  const receitasProj = previstasReceber.filter((c) => c.data <= targetDate).reduce((s, c) => s + Number(c.valor || 0), 0);
  const despesasProj = previstasPagar.filter((c) => c.data <= targetDate).reduce((s, c) => s + Number(c.valor || 0), 0);
  const saldoDisponivel = Number(state.saldoAtual || 0) + receitasProj - despesasProj;
  const folegoDiario = saldoDisponivel / daysRemaining;
  const tenso = folegoDiario < 0;
  const pct = Math.max(6, Math.min(100, (daysRemaining / 60) * 100));

  const totalInvestido = state.investimentos.reduce((s, i) => s + Number(i.valor || 0), 0);
  const totalGuardado = state.guardado.reduce((s, i) => s + Number(i.valor || 0), 0);

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: '#EAE6DC', color: '#20241F', padding: '20px', maxWidth: '940px', margin: '0 auto' }}>
      <style>{`
        body { margin: 0; }
        * { box-sizing: border-box; }
        .ff-hero { background: #20241F; color: #EAE6DC; border-radius: 8px; padding: '22px 24px 18px'; margin-bottom: 16px; }
        .ff-hero-figure { font-size: 44px; font-weight: 600; color: ${tenso ? '#E3A47E' : '#CFE3D6'}; }
        .ff-tabs { display: flex; gap: 4px; border-bottom: 1px solid #C9C2AE; margin-bottom: 16px; flex-wrap: wrap; }
        .ff-tab { padding: 8px 12px; font-size: 13px; background: none; border: none; color: #4B5049; cursor: pointer; border-bottom: 2px solid transparent; }
        .ff-tab.active { color: #3E6259; border-bottom-color: #3E6259; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>Fôlego Financeiro</h1>
        <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5049' }}>
          <LogOut size={18} /> Sair
        </button>
      </div>

      {/* Hero */}
      <div className="ff-hero" style={{ '--pct': `${pct}%` }}>
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#A9C4B8' }}>Fôlego financeiro</div>
          <div className="ff-hero-figure" style={{ fontFamily: "'IBM Plex Mono'" }}>{brl(folegoDiario)} / dia</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,.08)', height: '34px', borderRadius: '999px', overflow: 'hidden', marginTop: '16px' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, #3E6259, ${tenso ? '#8A3D22' : '#5B8A7A'})`, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#A9C4B8' }}>
          <span>hoje · {toDateBR(today)}</span>
          <span>{daysRemaining} dias de fôlego</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="ff-tabs">
        {[['pagar', 'Contas a pagar'], ['receber', 'Contas a receber'], ['investimento', 'Investimentos'], ['guardado', 'Dinheiro guardado']].map(([key, label]) => (
          <button key={key} className={`ff-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'pagar' && <ContaTab tipo="pagar" items={state.contasPagar} categorias={state.categoriasDespesa} update={update} />}
      {tab === 'receber' && <ContaTab tipo="receber" items={state.contasReceber} categorias={state.categoriasReceita} update={update} />}
      {tab === 'investimento' && <SimpleList items={state.investimentos} label="Investimentos" update={update} />}
      {tab === 'guardado' && <SimpleList items={state.guardado} label="Dinheiro Guardado" update={update} />}
    </div>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        await supabase.auth.signUp({ email, password });
      } else {
        await supabase.auth.signInWithPassword({ email, password });
      }
    } catch (e) {
      alert('Erro: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EAE6DC', fontFamily: "'IBM Plex Sans'" }}>
      <form onSubmit={handleAuth} style={{ background: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: '300px', width: '100%' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Fôlego Financeiro</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '5px' }}
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '5px' }}
          required
        />
        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '10px', background: '#3E6259', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          {loading ? 'Carregando...' : isSignUp ? 'Criar Conta' : 'Entrar'}
        </button>
        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          style={{ width: '100%', marginTop: '10px', background: 'none', border: '1px solid #ccc', padding: '10px', borderRadius: '5px', cursor: 'pointer' }}
        >
          {isSignUp ? 'Já tem conta? Entrar' : 'Criar nova conta'}
        </button>
      </form>
    </div>
  );
}

function ContaTab({ tipo, items, categorias, update }) {
  const previstas = items.filter((c) => c.status === 'prevista').sort((a, b) => a.data.localeCompare(b.data));
  const efetivadas = items.filter((c) => c.status === 'efetivada').sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#4B5049', fontWeight: '600', margin: '14px 0 6px' }}>
        Previsão · pendente
      </div>
      <div style={{ border: '1px solid #C9C2AE', borderRadius: '6px', overflow: 'hidden' }}>
        {previstas.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#4B5049' }}>nenhuma conta prevista</div>
        ) : (
          previstas.map((c) => (
            <div key={c.id} style={{ background: '#fff', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #C9C2AE', fontSize: '13.5px' }}>
              <span style={{ flex: 1 }}>{c.nome}</span>
              <span style={{ fontSize: '12px', color: '#4B5049', width: '70px' }}>{toDateBR(c.data)}</span>
              <span style={{ width: '96px', textAlign: 'right' }}>{brl(c.valor)}</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5049' }}>×</button>
            </div>
          ))
        )}
      </div>

      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#4B5049', fontWeight: '600', margin: '14px 0 6px' }}>
        Já {tipo === 'pagar' ? 'paguei' : 'recebi'}
      </div>
      <div style={{ border: '1px solid #C9C2AE', borderRadius: '6px', overflow: 'hidden' }}>
        {efetivadas.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#4B5049' }}>nada efetivado</div>
        ) : (
          efetivadas.map((c) => (
            <div key={c.id} style={{ background: '#fff', padding: '9px 12px', opacity: 0.55, display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #C9C2AE' }}>
              <span style={{ flex: 1 }}>{c.nome}</span>
              <span style={{ fontSize: '12px', color: '#4B5049', width: '70px' }}>{toDateBR(c.data)}</span>
              <span style={{ width: '96px', textAlign: 'right' }}>{brl(c.valor)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SimpleList({ items, label, update }) {
  return (
    <div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#4B5049', fontWeight: '600', margin: '14px 0 6px' }}>
        {label}
      </div>
      <div style={{ border: '1px solid #C9C2AE', borderRadius: '6px', overflow: 'hidden' }}>
        {items.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#4B5049' }}>nada cadastrado</div>
        ) : (
          items.map((i) => (
            <div key={i.id} style={{ background: '#fff', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #C9C2AE' }}>
              <span style={{ flex: 1 }}>{i.nome}</span>
              <span style={{ width: '96px', textAlign: 'right' }}>{brl(i.valor)}</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5049' }}>×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
