-- Lista de productos con fecha y orden, Excel de salida e indicadores (spec del Excel §3, §4, §5.4
-- y §9.1). filter_products concentra búsqueda, filtros y orden: la lista y los Excel leen de ella,
-- así que nunca dan resultados distintos. Los empates se resuelven por nombre y, al final, por id:
-- la paginación es estable.
-- Los días son de Lima (UTC−5): un día empieza en dia::timestamp at time zone 'America/Lima'.
-- Sin índices nuevos: la búsqueda ya recorre la tabla y, con miles de productos, filtrar y ordenar
-- tarda milisegundos (spec §9.1).

create function public.filter_products(
  search text default '',
  category uuid default null,
  date_by text default 'created',
  date_from date default null,
  date_to date default null,
  sort text default 'name'
)
returns table (
  id uuid,
  code text,
  name text,
  description text,
  category_id uuid,
  unit_price numeric,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  sort_position bigint
)
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
      date_from::timestamp at time zone 'America/Lima' as from_instant,
      (date_to + 1)::timestamp at time zone 'America/Lima' as to_instant
  ),
  matching as (
    select
      p.id, p.code, p.name, p.description, p.category_id, p.unit_price,
      p.created_at, p.updated_at, c.name as category_name,
      case when date_by = 'updated' then p.updated_at else p.created_at end as filter_date
    from public.products p
    join public.categories c on c.id = p.category_id
    cross join params
    where (category is null or p.category_id = category)
      and (
        extensions.unaccent('extensions.unaccent', p.name) ilike params.pattern
        or extensions.unaccent('extensions.unaccent', p.code) ilike params.pattern
      )
  )
  select
    m.id, m.code, m.name, m.description, m.category_id, m.unit_price,
    m.created_at, m.updated_at, m.category_name,
    row_number() over (
      order by
        case when sort = 'newest' then m.created_at end desc,
        case when sort = 'updated' then m.updated_at end desc,
        case when sort = 'price-asc' then m.unit_price end asc,
        case when sort = 'price-desc' then m.unit_price end desc,
        m.name, m.id
    ) as sort_position
  from matching m
  cross join params
  where (params.from_instant is null or m.filter_date >= params.from_instant)
    and (params.to_instant is null or m.filter_date < params.to_instant)
$$;

-- La versión anterior tenía cuatro parámetros. La nueva acepta los mismos y, además, fecha y orden
-- con valores por defecto: el código publicado la sigue llamando igual.
drop function public.search_products(text, uuid, integer, integer);

create function public.search_products(
  search text default '',
  category uuid default null,
  page integer default 1,
  page_size integer default 20,
  date_by text default 'created',
  date_from date default null,
  date_to date default null,
  sort text default 'name'
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    -- bigint: una página enorme pedida a mano no desborda la multiplicación.
    select
      least(greatest(page_size, 1), 100)::bigint as size,
      greatest(page, 1)::bigint as current_page
  ),
  filtered as (
    select * from public.filter_products(search, category, date_by, date_from, date_to, sort)
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce(
      (
        select json_agg(
          json_build_object(
            'id', f.id, 'code', f.code, 'name', f.name, 'description', f.description,
            'category_id', f.category_id, 'unit_price', f.unit_price::text,
            'created_at', f.created_at, 'updated_at', f.updated_at,
            'category_name', f.category_name
          )
          order by f.sort_position
        )
        from filtered f
        cross join params
        where f.sort_position > (params.current_page - 1) * params.size
          and f.sort_position <= params.current_page * params.size
      ),
      '[]'::json
    )
  )
$$;

-- Todas las filas filtradas para los Excel. Quien llama pide una de más para saber si hubo recorte.
create function public.export_products(
  search text default '',
  category uuid default null,
  date_by text default 'created',
  date_from date default null,
  date_to date default null,
  sort text default 'name',
  max_rows integer default 10001
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', f.id, 'code', f.code, 'name', f.name, 'description', f.description,
        'category_id', f.category_id, 'unit_price', f.unit_price::text,
        'created_at', f.created_at, 'updated_at', f.updated_at,
        'category_name', f.category_name
      )
      order by f.sort_position
    ),
    '[]'::json
  )
  from public.filter_products(search, category, date_by, date_from, date_to, sort) f
  where f.sort_position <= least(greatest(max_rows, 1), 20001)
$$;

-- Indicadores de la cabecera (spec §4.1). «Modificados» incluye los creados: la cifra coincide con
-- la lista que abre el indicador (dateBy=updated&date=7d).
create function public.catalog_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with lima as (
    select (now() at time zone 'America/Lima')::date as today
  )
  select json_build_object(
    'products', count(p.id),
    'created_this_month', count(p.id) filter (
      where p.created_at >=
        (lima.today - (extract(day from lima.today)::integer - 1))::timestamp
          at time zone 'America/Lima'
    ),
    'updated_last_7_days', count(p.id) filter (
      where p.updated_at >= (lima.today - 6)::timestamp at time zone 'America/Lima'
    )
  )
  from lima
  left join public.products p on true
  group by lima.today
$$;

-- Los mismos permisos que tenía search_products: solo cuentas con sesión. Las políticas RLS deciden
-- qué filas ve cada una.
revoke execute on function public.filter_products(text, uuid, text, date, date, text)
  from public, anon;
grant execute on function public.filter_products(text, uuid, text, date, date, text)
  to authenticated;
revoke execute on function
  public.search_products(text, uuid, integer, integer, text, date, date, text) from public, anon;
grant execute on function
  public.search_products(text, uuid, integer, integer, text, date, date, text) to authenticated;
revoke execute on function public.export_products(text, uuid, text, date, date, text, integer)
  from public, anon;
grant execute on function public.export_products(text, uuid, text, date, date, text, integer)
  to authenticated;
revoke execute on function public.catalog_stats() from public, anon;
grant execute on function public.catalog_stats() to authenticated;
