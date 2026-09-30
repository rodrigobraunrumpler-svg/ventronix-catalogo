-- Sesión de WhatsApp de la empresa para enviar las proformas (spec de WhatsApp §3): una sola fila,
-- solo para la cuenta autorizada. El estado de Baileys llega cifrado con una clave que solo tiene el
-- servidor, así que la fila no sirve de nada fuera de él. Empieza sin vincular.
create table public.whatsapp_session (
  id boolean primary key default true check (id),
  -- Celular vinculado, sin el 51 delante.
  phone text check (phone ~ '^9[0-9]{8}$'),
  state text check (char_length(state) <= 4000000),
  linked_at timestamptz,
  -- Una operación a la vez (enviar o vincular): dos conexiones con la misma sesión la estropean.
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  -- Vinculada (número, estado y fecha) o sin vincular (nada).
  check ((phone is null) = (state is null) and (phone is null) = (linked_at is null))
);

create trigger whatsapp_session_set_updated_at
before update on public.whatsapp_session
for each row execute function public.set_updated_at();

alter table public.whatsapp_session enable row level security;

-- Sin insert ni delete: la fila la crea esta migración y la app solo la lee y la actualiza.
revoke all on table public.whatsapp_session from anon, authenticated;
grant select, update on table public.whatsapp_session to authenticated;

create policy "owner reads whatsapp session" on public.whatsapp_session
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner updates whatsapp session" on public.whatsapp_session
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

insert into public.whatsapp_session default values;
