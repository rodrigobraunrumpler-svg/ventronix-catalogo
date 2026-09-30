-- Búsqueda sin tildes (spec §8): «impresion» encuentra «Impresión» y «LASER», «láser».
-- unaccent vive en el esquema extensions; con search_path vacío se llama con su diccionario
-- calificado. Sigue escapando % _ \ como la versión anterior y conserva sus permisos.
create extension if not exists unaccent with schema extensions;

create or replace function public.search_products(
  search text default '',
  category uuid default null,
  page integer default 1,
  page_size integer default 20
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      '%' || replace(replace(replace(
        extensions.unaccent('extensions.unaccent', coalesce(search, '')),
        '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
      least(greatest(page_size, 1), 100) as size,
      greatest(page, 1) as current_page
  ),
  filtered as (
    select
      p.id, p.code, p.name, p.description, p.category_id,
      p.unit_price::text as unit_price, p.created_at, p.updated_at,
      c.name as category_name
    from public.products p
    join public.categories c on c.id = p.category_id
    cross join params
    where (category is null or p.category_id = category)
      and (
        extensions.unaccent('extensions.unaccent', p.name) ilike params.pattern
        or extensions.unaccent('extensions.unaccent', p.code) ilike params.pattern
      )
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce(
      (
        select json_agg(row_to_json(page_rows) order by page_rows.name, page_rows.id)
        from (
          select filtered.*
          from filtered, params
          order by filtered.name, filtered.id
          limit (select size from params)
          offset ((select current_page from params) - 1) * (select size from params)
        ) page_rows
      ),
      '[]'::json
    )
  )
$$;
