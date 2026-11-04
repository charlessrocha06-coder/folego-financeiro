-- Fôlego Financeiro - Schema Supabase
-- Execute isso no SQL Editor do Supabase

create extension if not exists "uuid-ossp";

-- Tabela de usuários (configuração)
create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  saldo_atual numeric(12,2) default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Categorias de despesa
create table if not exists public.categorias_despesa (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  created_at timestamp with time zone default now(),
  unique(usuario_id, nome)
);

-- Categorias de receita
create table if not exists public.categorias_receita (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  created_at timestamp with time zone default now(),
  unique(usuario_id, nome)
);

-- Contas a Pagar
create table if not exists public.contas_pagar (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  categoria text not null,
  valor numeric(12,2) not null,
  data date not null,
  status text not null check (status in ('prevista', 'efetivada')) default 'prevista',
  grande boolean default false,
  grupo_id uuid,
  parcela integer,
  total_parcelas integer,
  origem_recorrencia_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Contas a Receber
create table if not exists public.contas_receber (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  categoria text not null,
  valor numeric(12,2) not null,
  data date not null,
  status text not null check (status in ('prevista', 'efetivada')) default 'prevista',
  grupo_id uuid,
  parcela integer,
  total_parcelas integer,
  origem_recorrencia_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Recorrências Fixas
create table if not exists public.recorrencias_fixas (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('pagar', 'receber')),
  categoria text not null,
  valor numeric(12,2) not null,
  freq text not null check (freq in ('mensal', 'quinzenal', 'semanal')),
  data_inicio date not null,
  ativa boolean default true,
  gerado_ate date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Reajustes de Recorrências
create table if not exists public.reajustes_recorrencia (
  id uuid primary key default uuid_generate_v4(),
  recorrencia_id uuid not null references public.recorrencias_fixas(id) on delete cascade,
  data_vigencia date not null,
  valor numeric(12,2) not null,
  created_at timestamp with time zone default now()
);

-- Investimentos
create table if not exists public.investimentos (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  valor numeric(12,2) not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Dinheiro Guardado
create table if not exists public.guardado (
  id uuid primary key default uuid_generate_v4(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome text not null,
  valor numeric(12,2) not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Row Level Security (RLS)
alter table public.usuarios enable row level security;
alter table public.categorias_despesa enable row level security;
alter table public.categorias_receita enable row level security;
alter table public.contas_pagar enable row level security;
alter table public.contas_receber enable row level security;
alter table public.recorrencias_fixas enable row level security;
alter table public.reajustes_recorrencia enable row level security;
alter table public.investimentos enable row level security;
alter table public.guardado enable row level security;

-- Policies
create policy "usuarios_own_data" on public.usuarios for all using (auth.uid() = id);
create policy "usuarios_insert" on public.usuarios for insert with check (auth.uid() = id);

create policy "categorias_despesa_own_data" on public.categorias_despesa for all using (auth.uid() = usuario_id);
create policy "categorias_receita_own_data" on public.categorias_receita for all using (auth.uid() = usuario_id);

create policy "contas_pagar_own_data" on public.contas_pagar for all using (auth.uid() = usuario_id);
create policy "contas_receber_own_data" on public.contas_receber for all using (auth.uid() = usuario_id);

create policy "recorrencias_fixas_own_data" on public.recorrencias_fixas for all using (auth.uid() = usuario_id);
create policy "reajustes_recorrencia_own_data" on public.reajustes_recorrencia for all
  using (recorrencia_id in (select id from public.recorrencias_fixas where usuario_id = auth.uid()));

create policy "investimentos_own_data" on public.investimentos for all using (auth.uid() = usuario_id);
create policy "guardado_own_data" on public.guardado for all using (auth.uid() = usuario_id);

-- Indexes
create index idx_contas_pagar_usuario_data on public.contas_pagar(usuario_id, data);
create index idx_contas_receber_usuario_data on public.contas_receber(usuario_id, data);
create index idx_recorrencias_usuario on public.recorrencias_fixas(usuario_id);
create index idx_investimentos_usuario on public.investimentos(usuario_id);
create index idx_guardado_usuario on public.guardado(usuario_id);
