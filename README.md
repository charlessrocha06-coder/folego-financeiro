# Fôlego Financeiro

Controle financeiro pessoal online com sincronização em tempo real.

**Status:** ✅ Pronto para deploy

## 🚀 Quick Start

### Desenvolvimento Local

```bash
npm install
npm run dev
```

Abre em `http://localhost:3000`

### Deploy (3 passos)

Ver [`DEPLOY.md`](./DEPLOY.md) para instruções de deploy no Vercel.

## 📋 Requisitos

- Node.js 16+
- npm ou yarn
- Conta no GitHub
- Conta no Vercel (grátis)
- Projeto Supabase criado

## 🔧 Setup

1. **SQL Schema:** Cole o conteúdo de `schema.sql` no SQL Editor do Supabase
2. **Variáveis de Ambiente:** Crie `.env.local` com suas credenciais Supabase
3. **Instale dependências:** `npm install`
4. **Rode localmente:** `npm run dev`

## 📁 Estrutura

```
├── App.jsx          # App principal com Supabase integration
├── main.jsx         # Entry point React
├── index.html       # HTML base
├── package.json     # Dependências
├── vite.config.js   # Configuração Vite
├── schema.sql       # Schema Supabase
├── DEPLOY.md        # Instruções de deploy
└── .env.example     # Template de variáveis
```

## 🔑 Variáveis de Ambiente

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
```

## 📱 Features

- ✅ Login com Supabase Auth
- ✅ Fôlego financeiro (quanto você pode gastar/dia)
- ✅ Contas a pagar e receber
- ✅ Investimentos e dinheiro guardado
- ✅ Sincronização em tempo real
- ✅ Mobile-friendly

## 🛠️ Tech Stack

- **Frontend:** React + Vite
- **Backend:** Supabase (PostgreSQL)
- **UI:** Recharts + Lucide icons
- **Deployment:** Vercel

## 📞 Suporte

Ver `DEPLOY.md` para troubleshooting comum.

---

Made with ❤️ by Charles Rocha
