-- Historial de proformas (spec de productos libres, historial y fotos §3, §5 y §7): una fila por
-- número, para siempre. «Corregir» actualiza la misma fila. `document` es la copia con la que se
-- vuelve a armar el PDF: lo que se envió al generarla y los datos de la empresa de ese día. Las
-- demás columnas son las que se listan, se buscan y van al Excel.
create table public.proformas (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  issued_at timestamptz not null,
  valid_until date not null,
  client_name text not null
    check (btrim(client_name) <> '' and char_length(client_name) <= 200),
  client_document text not null default ''
    check (client_document ~ '^([0-9]{8}|[0-9]{11})?$'),
  client_phone text not null default '' check (char_length(client_phone) <= 11),
  item_count integer not null check (item_count between 1 and 300),
  total numeric(12, 2) not null check (total > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Por fecha (el filtro y «este mes») y por documento (la búsqueda y completar el cliente). El
-- número ya tiene el índice de su unique.
create index proformas_issued_at_idx on public.proformas (issued_at);
create index proformas_client_document_idx on public.proformas (client_document, number desc);

create trigger proformas_set_updated_at
before update on public.proformas
for each row execute function public.set_updated_at();

alter table public.proformas enable row level security;

-- Sin delete: las proformas no se borran (spec §3).
revoke all on table public.proformas from anon, authenticated;
grant select, insert, update on table public.proformas to authenticated;

create policy "owner reads proformas" on public.proformas
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner creates proformas" on public.proformas
  for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner updates proformas" on public.proformas
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

-- Búsqueda (nombre sin tildes ni mayúsculas, RUC, DNI, celular o N° de proforma) y días de Lima,
-- como filter_products: la lista y el Excel leen de aquí, así que nunca dan resultados distintos.
-- Los caracteres especiales de LIKE se buscan como texto. Con un número, esa proforma va primero.
-- Sin la copia (`document`): ni la lista ni el Excel la necesitan.
create function public.filter_proformas(
  search text default '',
  date_from date default null,
  date_to date default null
)
returns table (
  id uuid,
  number integer,
  issued_at timestamptz,
  valid_until date,
  client_name text,
  client_document text,
  client_phone text,
  item_count integer,
  total numeric,
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
      (date_to + 1)::timestamp at time zone 'America/Lima' as to_instant,
      -- «0042» y «42» son la proforma 42.
      ltrim(btrim(coalesce(search, '')), '0') as number_search
  )
  select
    p.id, p.number, p.issued_at, p.valid_until, p.client_name, p.client_document,
    p.client_phone, p.item_count, p.total,
    row_number() over (
      order by (p.number::text = params.number_search) desc, p.number desc
    ) as sort_position
  from public.proformas p
  cross join params
  where (
      extensions.unaccent('extensions.unaccent', p.client_name) ilike params.pattern
      or p.client_document like params.pattern
      -- El celular sin espacios («987 654» encuentra 987 654 321) y el número con sus ceros.
      or replace(p.client_phone, ' ', '') like replace(params.pattern, ' ', '')
      or lpad(p.number::text, 4, '0') like params.pattern
    )
    and (params.from_instant is null or p.issued_at >= params.from_instant)
    and (params.to_instant is null or p.issued_at < params.to_instant)
$$;

-- Una página (20 en la app, spec §4.2) con el total y la suma de lo filtrado, y las cifras de la
-- cabecera: todas las proformas y las de este mes, en Lima.
create function public.search_proformas(
  search text default '',
  date_from date default null,
  date_to date default null,
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
    -- bigint: una página enorme pedida a mano no desborda la multiplicación.
    select
      least(greatest(page_size, 1), 100)::bigint as size,
      greatest(page, 1)::bigint as current_page,
      (now() at time zone 'America/Lima')::date as today
  ),
  filtered as (
    select * from public.filter_proformas(search, date_from, date_to)
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'sum', (select coalesce(sum(f.total), 0)::text from filtered f),
    'all', (select count(*) from public.proformas),
    'this_month', (
      select count(*)
      from public.proformas p
      cross join params
      where p.issued_at >=
        (params.today - (extract(day from params.today)::integer - 1))::timestamp
          at time zone 'America/Lima'
    ),
    'items', coalesce(
      (
        select json_agg(
          json_build_object(
            'id', f.id, 'number', f.number, 'issued_at', f.issued_at,
            'valid_until', f.valid_until, 'client_name', f.client_name,
            'client_document', f.client_document, 'client_phone', f.client_phone,
            'item_count', f.item_count, 'total', f.total::text
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

-- Todo lo filtrado para el Excel, con el tope de Productos. Quien llama pide una de más para saber
-- si hubo recorte.
create function public.export_proformas(
  search text default '',
  date_from date default null,
  date_to date default null,
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
        'id', f.id, 'number', f.number, 'issued_at', f.issued_at,
        'valid_until', f.valid_until, 'client_name', f.client_name,
        'client_document', f.client_document, 'client_phone', f.client_phone,
        'item_count', f.item_count, 'total', f.total::text
      )
      order by f.sort_position
    ),
    '[]'::json
  )
  from public.filter_proformas(search, date_from, date_to) f
  where f.sort_position <= least(greatest(max_rows, 1), 20001)
$$;

-- Solo cuentas con sesión; las políticas RLS deciden qué filas ve cada una.
revoke execute on function public.filter_proformas(text, date, date) from public, anon;
grant execute on function public.filter_proformas(text, date, date) to authenticated;
revoke execute on function public.search_proformas(text, date, date, integer, integer)
  from public, anon;
grant execute on function public.search_proformas(text, date, date, integer, integer)
  to authenticated;
revoke execute on function public.export_proformas(text, date, date, integer) from public, anon;
grant execute on function public.export_proformas(text, date, date, integer) to authenticated;
