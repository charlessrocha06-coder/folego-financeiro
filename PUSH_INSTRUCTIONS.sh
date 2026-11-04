#!/bin/bash
# Script para fazer push do Fôlego Financeiro para GitHub

echo "🚀 Iniciando push para GitHub..."

# Navegar para o diretório
cd "$(dirname "$0")"

# Configurar git (se necessário)
git config user.email "charles.rocha@pensaredu.com.br" || true
git config user.name "Charles Rocha" || true

# Verificar status
echo "📋 Status atual do repositório:"
git status

# Tentar fazer push
echo ""
echo "📤 Tentando fazer push para GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo "✅ Push bem-sucedido!"
    echo ""
    echo "📌 Próximos passos:"
    echo "1. Acesse https://vercel.com/new"
    echo "2. Cole a URL: https://github.com/charlessrocha06-coder/folego-financeiro"
    echo "3. Configure as variáveis de ambiente:"
    echo "   - VITE_SUPABASE_URL=https://sfpplswyiecvmghpskna.supabase.co"
    echo "   - VITE_SUPABASE_ANON_KEY=<sua chave do Supabase>"
    echo "4. Clique em Deploy"
else
    echo "❌ Erro ao fazer push. Possíveis soluções:"
    echo ""
    echo "Opção 1: Use seu token pessoal do GitHub:"
    echo "git remote set-url origin https://<seu_username>:<seu_token>@github.com/charlessrocha06-coder/folego-financeiro.git"
    echo "git push -u origin main"
    echo ""
    echo "Opção 2: Configure SSH:"
    echo "ssh-keygen -t ed25519 -C 'charles.rocha@pensaredu.com.br'"
    echo "git remote set-url origin git@github.com:charlessrocha06-coder/folego-financeiro.git"
    echo "git push -u origin main"
    echo ""
    echo "Opção 3: Criar arquivo README via GitHub web:"
    echo "1. Vá para https://github.com/charlessrocha06-coder/folego-financeiro"
    echo "2. Clique em 'Add file' → 'Create new file'"
    echo "3. Nome: README.md"
    echo "4. Conteúdo: # Fôlego Financeiro"
    echo "5. Clique em 'Commit changes' (isso cria o primeiro commit)"
    echo "6. Depois vá para Vercel e importe o repositório"
fi
