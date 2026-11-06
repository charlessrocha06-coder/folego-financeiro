# Fôlego Financeiro

Controle financeiro pessoal: fôlego diário, contas a pagar e a receber, recorrências, parcelas, cartão, análise e backup. Login e dados sincronizados via Supabase; hospedado no Vercel.

## Estrutura
- `App.jsx` — login (Supabase Auth) e carregamento do app
- `FolegoApp.jsx` — o app (salva tudo em `dados_financeiros`, um JSON por usuário)
- `api/mcp/[secret].js` — conector MCP para o Claude ler e editar os dados (`/api/mcp/<chave-secreta>`)
- `sql/` — tabelas e funções do Supabase (rodar no SQL Editor)

## Variáveis no Vercel
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública). Nenhum segredo fica no código: a chave do conector só existe no link e o banco guarda apenas o hash dela.

## Desenvolvimento
```
npm install
npm run dev
```
