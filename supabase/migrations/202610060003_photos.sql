-- Fotos opcionales de los productos y de los productos libres (spec de proformas libres, historial
-- y fotos §3, §5 y §8). Bucket privado: solo la cuenta dueña lee y sube, solo en sus dos carpetas y
-- con nombre <uuid>.jpg (600 px) o <uuid>.thumb.jpg (la miniatura de 200 px). Sin políticas para
-- borrar ni para reemplazar: una proforma guardada puede usar la foto.
-- Solo id, name y public: los límites de tamaño y de tipo son columnas del servicio de Storage, que
-- pueden faltar al recrear la base local. El navegador ya sube JPEG reducidos (plan, decisión 15).
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

create policy "owner reads images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner'
  );

create policy "owner uploads images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner'
    and name ~ '^(products|lines)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.thumb)?\.jpg$'
  );

-- Nula: sin foto. Cambiarla es subir otro archivo; las proformas anteriores conservan la suya.
alter table public.products
  add column image_path text check (
    image_path ~ '^products/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );

-- La lista y los Excel devuelven también la foto: al añadir un producto a la proforma se copia
-- (plan, decisión 14). La tabla de salida de filter_products cambia, así que se vuelve a crear; las
-- otras dos conservan su firma.
drop function public.filter_products(text, uuid, text, date, date, text);

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
  image_path text,
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
      p.created_at, p.updated_at, c.name as category_name, p.image_path,
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
    m.created_at, m.updated_at, m.category_name, m.image_path,
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

create or replace function public.search_products(
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
            'category_name', f.category_name, 'image_path', f.image_path
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

create or replace function public.export_products(
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
        'category_name', f.category_name, 'image_path', f.image_path
      )
      order by f.sort_position
    ),
    '[]'::json
  )
  from public.filter_products(search, category, date_by, date_from, date_to, sort) f
  where f.sort_position <= least(greatest(max_rows, 1), 20001)
$$;

-- Al borrarla, filter_products perdió sus permisos: los mismos de antes.
revoke execute on function public.filter_products(text, uuid, text, date, date, text)
  from public, anon;
grant execute on function public.filter_products(text, uuid, text, date, date, text)
  to authenticated;
