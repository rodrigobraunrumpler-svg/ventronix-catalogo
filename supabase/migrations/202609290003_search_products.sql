-- Listado del catálogo en la base de datos (plan, tarea 6): búsqueda literal por código o nombre,
-- filtro por categoría, orden estable nombre/ID y páginas con el total.
--
-- Función con parámetros en vez de un filtro `or` de PostgREST: el texto del usuario nunca entra en
-- la gramática de filtros (comas, paréntesis, comillas) y los comodines % _ \ se escapan aquí.
-- SECURITY INVOKER: se ejecuta con los permisos de quien llama, así que RLS sigue aplicando.
create function public.search_products(
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
      '%' || replace(replace(replace(coalesce(search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        as pattern,
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
      and (p.name ilike params.pattern or p.code ilike params.pattern)
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

revoke execute on function public.search_products(text, uuid, integer, integer) from public, anon;
grant execute on function public.search_products(text, uuid, integer, integer) to authenticated;
