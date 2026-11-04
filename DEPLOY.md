# Deploy Fôlego Financeiro no Vercel — 3 Passos

## Passo 1: Setup Supabase (1 min)

1. Abra https://supabase.com/dashboard
2. Selecione seu projeto **obhryklyreerphumyfjqp**
3. Vá em **SQL Editor**
4. Cole todo o conteúdo de `schema.sql` e execute (clique em "Run")
5. Pronto ✅ Banco de dados criado

---

## Passo 2: Push no GitHub (1 min)

Terminal (na pasta do projeto):

```bash
git init
git add .
git commit -m "Initial commit: Fôlego Financeiro"
git branch -M main
git remote add origin https://github.com/CharlessRocha/folego-financeiro.git
git push -u origin main
```

---

## Passo 3: Deploy no Vercel (1 min)

1. Acesse https://vercel.com
2. Clique em **"New Project"**
3. Selecione **"Import Git Repository"**
4. Cole: `https://github.com/CharlessRocha/folego-financeiro`
5. Clique em **"Import"**
6. Na tela de configuração:
   - **Framework Preset:** Vite
   - **Environment Variables:** Deixe em branco (já está no `.env`)
7. Clique em **"Deploy"**

**Pronto! 🚀 Em 2 minutos seu app está online:**

```
https://folego-financeiro.vercel.app
```

---

## Depois do Deploy

1. **Primeira vez:** Você será redirecionado para login
2. **Criar conta:** Use qualquer email/senha
3. **Usar o app:** Sincroniza em tempo real com Supabase ✅

---

## Se der erro no Deploy

**"VITE_SUPABASE_URL não encontrada"**

→ Vercel → Settings → Environment Variables → Adicione:
- `VITE_SUPABASE_URL`: `https://obhryklyreerphumyfjqp.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: (sua chave anon do Supabase)

Depois: **Redeploy** (botão no Vercel)

---

## Done! 🎉

Você tem:
- ✅ App online em tempo real
- ✅ Login seguro (Supabase Auth)
- ✅ Dados sincronizados
- ✅ Acesso do celular

Se precisar, volta em Vercel → seu projeto → Deployments para redeploar a qualquer hora.
