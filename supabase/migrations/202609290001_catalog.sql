-- Catálogo: categorías y productos con las columnas exactas del contexto (PROJECT_CONTEXT §4, spec §6).
-- La base de datos protege las invariantes aunque se omita la interfaz.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nombre único ignorando mayúsculas y espacios exteriores (sin equiparar tildes).
create unique index categories_name_normalized_key on public.categories (lower(btrim(name)));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (btrim(code) <> '' and char_length(code) <= 64 and code = upper(btrim(code))),
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  -- Vacío se guarda como null.
  description text check (btrim(description) <> '' and char_length(description) <= 2000),
  category_id uuid not null references public.categories (id) on delete restrict,
  -- numeric sin escala: no redondea en silencio; el check rechaza más de dos decimales.
  unit_price numeric not null
    check (unit_price > 0 and unit_price < 10000000000 and unit_price = round(unit_price, 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_id_idx on public.products (category_id);
-- Orden estable del listado paginado: nombre y luego ID.
create index products_name_id_idx on public.products (name, id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- Sin políticas todavía: la API no da acceso a nadie hasta la migración de acceso (tarea 3).
alter table public.categories enable row level security;
alter table public.products enable row level security;
