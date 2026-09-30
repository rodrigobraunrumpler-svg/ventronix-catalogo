-- Numeración correlativa de proformas (spec §6.3). Las proformas no se guardan: solo el último
-- número usado. SECURITY DEFINER para usar la secuencia sin dar permisos sobre ella; la propia
-- función comprueba la marca de la cuenta autorizada.
create sequence public.proforma_number_seq;

create function public.next_proforma_number()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'catalog_access') is distinct from 'owner' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return nextval('public.proforma_number_seq');
end;
$$;

revoke all on sequence public.proforma_number_seq from public, anon, authenticated;
revoke execute on function public.next_proforma_number() from public, anon;
grant execute on function public.next_proforma_number() to authenticated;
