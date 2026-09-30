-- Datos de la empresa para la proforma (spec §6.2): una sola fila, con los permisos del catálogo.
-- Empieza vacía: la cuenta autorizada la completa en la pantalla «Empresa». Los límites de las
-- listas mantienen el documento legible; el formato de cada elemento lo valida la Server Action.
create table public.company_profile (
  id boolean primary key default true check (id),
  legal_name text check (btrim(legal_name) <> '' and char_length(legal_name) <= 200),
  trade_name text check (btrim(trade_name) <> '' and char_length(trade_name) <= 120),
  ruc text check (ruc ~ '^(10|15|17|20)[0-9]{9}$'),
  address text check (btrim(address) <> '' and char_length(address) <= 300),
  phones text[] not null default '{}' check (cardinality(phones) <= 4),
  email text check (char_length(email) <= 254),
  payment_terms text check (char_length(payment_terms) <= 500),
  return_policy text check (char_length(return_policy) <= 500),
  default_validity_days integer not null default 7
    check (default_validity_days between 1 and 365),
  bank_accounts jsonb not null default '[]' check (
    case when jsonb_typeof(bank_accounts) = 'array'
      then jsonb_array_length(bank_accounts) <= 6 else false end
  ),
  wallets jsonb not null default '[]' check (
    case when jsonb_typeof(wallets) = 'array'
      then jsonb_array_length(wallets) <= 4 else false end
  ),
  updated_at timestamptz not null default now()
);

create trigger company_profile_set_updated_at
before update on public.company_profile
for each row execute function public.set_updated_at();

alter table public.company_profile enable row level security;

-- Sin insert ni delete: la fila la crea esta migración y la app solo la lee y la actualiza.
revoke all on table public.company_profile from anon, authenticated;
grant select, update on table public.company_profile to authenticated;

create policy "owner reads company profile" on public.company_profile
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner updates company profile" on public.company_profile
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

insert into public.company_profile default values;
