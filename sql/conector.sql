-- Fôlego Financeiro: acesso do conector do Claude (rode UMA vez no SQL Editor)
-- O banco guarda só o HASH da chave secreta; a chave em si fica apenas no link do conector.

create table if not exists public.folego_api_keys (
  key_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.folego_api_keys enable row level security;
-- sem policies: ninguém lê esta tabela pela API; só as funções abaixo.

create or replace function public.folego_api_uid(p_secret text)
returns uuid language sql security definer stable set search_path = public, extensions as $$
  select user_id from public.folego_api_keys
  where key_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
$$;

create or replace function public.folego_api_check(p_secret text)
returns boolean language sql security definer stable set search_path = public, extensions as $$
  select public.folego_api_uid(p_secret) is not null;
$$;

create or replace function public.folego_api_get(p_secret text)
returns jsonb language plpgsql security definer stable set search_path = public, extensions as $$
declare
  uid uuid := public.folego_api_uid(p_secret);
  r record;
begin
  if uid is null then raise exception 'acesso negado'; end if;
  select dados, updated_at into r from public.dados_financeiros where user_id = uid;
  return jsonb_build_object('dados', coalesce(r.dados, '{}'::jsonb), 'updated_at', r.updated_at);
end $$;

create or replace function public.folego_api_put(p_secret text, p_dados jsonb, p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := public.folego_api_uid(p_secret);
  novo timestamptz;
begin
  if uid is null then raise exception 'acesso negado'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'dados inválidos'; end if;
  if p_expected is null then
    insert into public.dados_financeiros (user_id, dados, updated_at) values (uid, p_dados, now())
    on conflict (user_id) do nothing returning updated_at into novo;
  else
    update public.dados_financeiros set dados = p_dados, updated_at = now()
    where user_id = uid and updated_at = p_expected returning updated_at into novo;
  end if;
  if novo is null then raise exception 'conflito: os dados mudaram, tente de novo'; end if;
  return jsonb_build_object('updated_at', novo);
end $$;

revoke all on function public.folego_api_uid(text) from public, anon, authenticated;
revoke all on function public.folego_api_check(text) from public;
revoke all on function public.folego_api_get(text) from public;
revoke all on function public.folego_api_put(text, jsonb, timestamptz) from public;
grant execute on function public.folego_api_check(text) to anon, authenticated;
grant execute on function public.folego_api_get(text) to anon, authenticated;
grant execute on function public.folego_api_put(text, jsonb, timestamptz) to anon, authenticated;
