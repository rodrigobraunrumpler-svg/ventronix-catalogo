-- Carga masiva (spec del Excel §6 y §9.1, fase 2). Las filas llegan ya leídas y validadas por el
-- servidor. product_import_plan decide, con la misma lógica para la vista previa y para la
-- importación, qué pasa con cada una: se crea, se actualiza (solo en las columnas presentes) o no
-- cambia. Todo por conjuntos: una consulta por paso, también con 5 000 filas. Sin índices nuevos.

create function public.product_import_plan(rows jsonb, columns text[])
returns table (
  line integer,
  code text,
  product_id uuid,
  name text,
  description text,
  category text,
  category_id uuid,
  category_name text,
  price numeric,
  current_name text,
  current_description text,
  current_category text,
  current_price numeric,
  name_changed boolean,
  description_changed boolean,
  category_changed boolean,
  price_changed boolean,
  name_taken_by text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select r.line, r.code, r.name, r.description, r.category, r.price
    from jsonb_to_recordset(rows) as r(
      line integer, code text, name text, description text, category text, price numeric
    )
  ),
  -- Nombres del catálogo sin mayúsculas ni espacios, para avisar de un nombre que ya usa otro
  -- código sin recorrer la tabla por cada fila.
  names as (
    select lower(btrim(p.name)) as key, array_agg(p.code order by p.code) as codes
    from public.products p
    group by 1
  )
  select
    i.line,
    i.code,
    p.id,
    i.name,
    i.description,
    i.category,
    c.id,
    coalesce(c.name, btrim(i.category)),
    i.price,
    p.name,
    p.description,
    pc.name,
    p.unit_price,
    p.id is not null and 'name' = any(columns) and p.name is distinct from i.name,
    p.id is not null and 'description' = any(columns) and p.description is distinct from i.description,
    p.id is not null and 'category' = any(columns) and p.category_id is distinct from c.id,
    p.id is not null and 'price' = any(columns) and p.unit_price is distinct from i.price,
    (select other from unnest(n.codes) as other where other <> i.code limit 1)
  from input i
  left join public.products p on p.code = i.code
  left join public.categories pc on pc.id = p.category_id
  -- Misma regla que el índice único de categorías: sin mayúsculas ni espacios en los extremos.
  left join public.categories c on lower(btrim(c.name)) = lower(btrim(i.category))
  left join names n on n.key = lower(btrim(i.name))
$$;

-- Vista previa: el plan de cada fila, con los precios en texto (nunca pasan por coma flotante).
create function public.preview_product_import(rows jsonb, columns text[])
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'line', plan.line,
        'exists', plan.product_id is not null,
        'category_exists', plan.category_id is not null,
        'current_name', plan.current_name,
        'current_description', plan.current_description,
        'current_category', plan.current_category,
        'current_price', plan.current_price::text,
        'name_changed', plan.name_changed,
        'description_changed', plan.description_changed,
        'category_changed', plan.category_changed,
        'price_changed', plan.price_changed,
        'name_taken_by', plan.name_taken_by
      )
      order by plan.line
    ),
    '[]'::json
  )
  from public.product_import_plan(rows, columns) plan
$$;

-- Importación en una sola transacción: o se guarda todo o nada. Crea solo las categorías que usan
-- las filas que de verdad se crean o actualizan, inserta los nuevos, actualiza solo las columnas
-- presentes de los que cambian (los demás no se tocan: su updated_at sigue igual) y devuelve los
-- valores anteriores para el comprobante. El modo se aplica aquí, con el catálogo de este momento.
create function public.import_products(rows jsonb, columns text[], mode text default 'all')
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_categories text[];
  result json;
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'catalog_access'), '') <> 'owner' then
    raise exception 'Solo la cuenta dueña puede importar productos.' using errcode = '42501';
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) > 5000 then
    raise exception 'Como máximo 5000 filas por importación.' using errcode = '22023';
  end if;
  if mode is null or mode not in ('all', 'create', 'update') then
    raise exception 'Modo de importación no válido.' using errcode = '22023';
  end if;

  with plan as (
    select * from public.product_import_plan(rows, columns)
  ),
  acting as (
    select * from plan
    where (plan.product_id is null and mode in ('all', 'create'))
      or (
        plan.product_id is not null and mode in ('all', 'update')
        and (plan.name_changed or plan.description_changed or plan.category_changed or plan.price_changed)
      )
  ),
  wanted as (
    select distinct on (lower(btrim(acting.category))) btrim(acting.category) as name
    from acting
    where 'category' = any(columns) and acting.category_id is null
      and nullif(btrim(acting.category), '') is not null
    order by lower(btrim(acting.category)), acting.line
  ),
  inserted as (
    insert into public.categories (name)
    select wanted.name from wanted
    on conflict ((lower(btrim(name)))) do nothing
    returning categories.name
  )
  select coalesce(array_agg(inserted.name order by inserted.name), '{}') into created_categories
  from inserted;

  -- El plan otra vez, ya con todas las categorías: lo leen todas las partes de esta consulta con la
  -- misma foto del catálogo, así que guarda los valores de antes para el comprobante.
  with plan as materialized (
    select * from public.product_import_plan(rows, columns)
  ),
  to_create as (
    select * from plan where plan.product_id is null and mode in ('all', 'create')
  ),
  to_update as (
    select * from plan
    where plan.product_id is not null and mode in ('all', 'update')
      and (plan.name_changed or plan.description_changed or plan.category_changed or plan.price_changed)
  ),
  created as (
    insert into public.products (code, name, description, category_id, unit_price)
    select to_create.code, to_create.name, to_create.description, to_create.category_id, to_create.price
    from to_create
    returning products.code
  ),
  updated as (
    update public.products p set
      name = case when 'name' = any(columns) then u.name else p.name end,
      description = case when 'description' = any(columns) then u.description else p.description end,
      category_id = case when 'category' = any(columns) then u.category_id else p.category_id end,
      unit_price = case when 'price' = any(columns) then u.price else p.unit_price end
    from to_update u
    where p.id = u.product_id
    returning p.code
  ),
  changes as (
    select to_create.code, to_create.name as product, 'created' as action, null::text as field,
      null::text as before, null::text as after, 0 as position
    from to_create
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'name', u.current_name, u.name, 1
    from to_update u where u.name_changed
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'description',
      u.current_description, u.description, 2
    from to_update u where u.description_changed
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'category',
      u.current_category, u.category_name, 3
    from to_update u where u.category_changed
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'price',
      u.current_price::text, u.price::text, 4
    from to_update u where u.price_changed
  )
  select json_build_object(
    'created', (select count(*) from created),
    'updated', (select count(*) from updated),
    'unchanged', (
      select count(*) from plan
      where plan.product_id is not null and mode in ('all', 'update')
    ) - (select count(*) from to_update),
    'skipped', (
      select count(*) from plan
      where (plan.product_id is null and mode = 'update')
        or (plan.product_id is not null and mode = 'create')
    ),
    'categories_created', to_json(created_categories),
    'changes', coalesce(
      (
        select json_agg(
          json_build_object(
            'code', changes.code, 'product', changes.product, 'action', changes.action,
            'field', changes.field, 'before', changes.before, 'after', changes.after
          )
          order by changes.code, changes.position
        )
        from changes
      ),
      '[]'::json
    ),
    'previous', coalesce(
      (
        select json_agg(
          json_build_object(
            'code', u.code, 'name', u.current_name, 'description', u.current_description,
            'category', u.current_category, 'price', u.current_price::text
          )
          order by u.code
        )
        from to_update u
      ),
      '[]'::json
    )
  ) into result;

  return result;
end;
$$;

-- Como las demás funciones del catálogo: solo cuentas con sesión; RLS decide qué ve cada una.
revoke execute on function public.product_import_plan(jsonb, text[]) from public, anon;
grant execute on function public.product_import_plan(jsonb, text[]) to authenticated;
revoke execute on function public.preview_product_import(jsonb, text[]) from public, anon;
grant execute on function public.preview_product_import(jsonb, text[]) to authenticated;
revoke execute on function public.import_products(jsonb, text[], text) from public, anon;
grant execute on function public.import_products(jsonb, text[], text) to authenticated;
