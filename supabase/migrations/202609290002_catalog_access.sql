-- Acceso privado (spec §5): solo la cuenta marcada por administración con
-- app_metadata.catalog_access = 'owner'. user_metadata lo edita el propio usuario: no concede nada.

revoke all on table public.categories, public.products from anon;
revoke all on table public.categories, public.products from authenticated;
grant select, insert, update, delete on table public.categories, public.products to authenticated;

create policy "owner reads categories" on public.categories
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner creates categories" on public.categories
  for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner updates categories" on public.categories
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner deletes categories" on public.categories
  for delete to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner reads products" on public.products
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner creates products" on public.products
  for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner updates products" on public.products
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner deletes products" on public.products
  for delete to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');
