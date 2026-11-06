-- Fôlego Financeiro: tabela dos dados (rode UMA vez no SQL Editor do Supabase)
create table if not exists public.dados_financeiros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dados jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dados_financeiros enable row level security;

drop policy if exists "dados_proprios_select" on public.dados_financeiros;
drop policy if exists "dados_proprios_insert" on public.dados_financeiros;
drop policy if exists "dados_proprios_update" on public.dados_financeiros;
drop policy if exists "dados_proprios_delete" on public.dados_financeiros;

create policy "dados_proprios_select" on public.dados_financeiros for select using (auth.uid() = user_id);
create policy "dados_proprios_insert" on public.dados_financeiros for insert with check (auth.uid() = user_id);
create policy "dados_proprios_update" on public.dados_financeiros for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dados_proprios_delete" on public.dados_financeiros for delete using (auth.uid() = user_id);
