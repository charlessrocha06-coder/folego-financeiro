import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import FolegoFinanceiro from "./FolegoApp.jsx";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const traduzErro = (msg = "") => {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Você ainda não confirmou seu e-mail. Abra o e-mail enviado pelo Supabase e clique no link de confirmação.";
  if (msg.includes("already registered")) return 'Este e-mail já tem conta. Clique em "Já tenho conta".';
  if (msg.includes("at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("rate limit")) return "Muitas tentativas de e-mail. Aguarde alguns minutos e tente de novo.";
  return msg;
};

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) return <div style={{ padding: 20 }}>Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Vercel.</div>;
  if (session === undefined) return <div style={{ padding: 20, textAlign: "center", fontFamily: "sans-serif" }}>Carregando…</div>;
  if (!session) return <Login />;
  return <FolegoFinanceiro key={session.user.id} userId={session.user.id} supabase={supabase} onSignOut={() => supabase.auth.signOut()} />;
}

function Login() {
  const [criar, setCriar] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErro(""); setInfo(""); setLoading(true);
    if (criar) {
      const { data, error } = await supabase.auth.signUp({ email, password: senha });
      if (error) setErro(traduzErro(error.message));
      else if (data.user && data.user.identities && data.user.identities.length === 0) setErro('Este e-mail já tem conta. Clique em "Já tenho conta".');
      else if (!data.session) { setInfo("Conta criada! Confirme pelo e-mail que enviamos e depois volte aqui para entrar."); setCriar(false); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setErro(traduzErro(error.message));
    }
    setLoading(false);
  };

  const box = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #CBD2D9", borderRadius: 6, fontSize: 15, marginBottom: 10, fontFamily: "inherit" };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F6F8", padding: 16, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <form onSubmit={submit} style={{ background: "#fff", padding: 28, borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.08)", width: "100%", maxWidth: 340 }}>
        <h2 style={{ margin: "0 0 18px", textAlign: "center" }}>Fôlego Financeiro</h2>
        <input style={box} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={box} type="password" placeholder="Senha (mín. 6 caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} />
        {erro && <div style={{ color: "#B42318", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
        {info && <div style={{ color: "#0F6D66", fontSize: 13, marginBottom: 10 }}>{info}</div>}
        <button type="submit" disabled={loading} style={{ ...box, background: "#0F6D66", color: "#fff", border: "none", cursor: "pointer", marginBottom: 8 }}>
          {loading ? "Aguarde…" : criar ? "Criar conta" : "Entrar"}
        </button>
        <button type="button" onClick={() => { setCriar(!criar); setErro(""); setInfo(""); }} style={{ ...box, background: "none", cursor: "pointer", marginBottom: 0 }}>
          {criar ? "Já tenho conta" : "Criar nova conta"}
        </button>
      </form>
    </div>
  );
}
