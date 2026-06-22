-- Custom providers metadata + agent preferences no banco.
-- Substitui localStorage forge:custom-providers e forge:agent-preferences.

-- 1. Tabela de metadados de providers customizados
create table if not exists public.custom_providers (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  provider_id text not null,
  label       text not null,
  base_url    text,
  icon        text not null default 'globe',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, provider_id)
);

alter table public.custom_providers enable row level security;

create policy "custom_providers_select"
  on public.custom_providers for select
  to authenticated
  using (owner_id = auth.uid());

create policy "custom_providers_insert"
  on public.custom_providers for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "custom_providers_update"
  on public.custom_providers for update
  to authenticated
  using (owner_id = auth.uid());

create policy "custom_providers_delete"
  on public.custom_providers for delete
  to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.custom_providers to authenticated;
grant all on public.custom_providers to service_role;

-- 2. Coluna agent_preferences em profiles
alter table public.profiles
  add column if not exists agent_preferences jsonb not null default '{}'::jsonb;

-- Garantir que integration_prefs também existe (criado em migration anterior)
alter table public.profiles
  add column if not exists integration_prefs jsonb not null default '{"github": "forge", "supabase": "forge", "vercel": "forge", "cloudflare": "own", "e2b": "forge"}'::jsonb;
