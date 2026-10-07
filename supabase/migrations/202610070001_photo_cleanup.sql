-- Fotos que ya no usa nadie (pedido del 07/10/2026): la app borra la foto que se quita o se cambia
-- antes de guardarla, la que reemplaza un producto y la de un producto libre que sale de la
-- proforma. La base solo deja borrar una foto, y su miniatura, si ningún producto ni ninguna
-- proforma guardada la usa: el historial nunca pierde fotos. Sigue sin poder reemplazarse.

-- ¿Usa la foto (products/<uuid>.jpg o lines/<uuid>.jpg) algún producto o alguna proforma guardada?
-- ponytail: recorre el historial con @>; con muchos miles de proformas, un índice GIN sobre
-- document -> 'input' -> 'lines'.
create function public.photo_in_use(path text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.products p where p.image_path = path)
    or exists (
      select 1
      from public.proformas f
      where f.document -> 'input' -> 'lines' @> jsonb_build_array(jsonb_build_object('imagePath', path))
    )
$$;

revoke execute on function public.photo_in_use(text) from public, anon;
grant execute on function public.photo_in_use(text) to authenticated;

-- La miniatura (<uuid>.thumb.jpg) sigue a su foto (<uuid>.jpg).
create policy "owner deletes unused images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner'
    and not public.photo_in_use(replace(name, '.thumb.jpg', '.jpg'))
  );
