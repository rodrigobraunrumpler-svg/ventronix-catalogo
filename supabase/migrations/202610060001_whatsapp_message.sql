-- Mensaje que acompaña al PDF por WhatsApp (spec de proformas libres, historial y fotos §3 y §4.6).
-- Nulo: el mensaje original. Los datos entre llaves ({cliente}, {numero}…) los pone la app al enviar.
-- Los permisos y las políticas de la tabla ya cubren la columna nueva.
alter table public.company_profile
  add column whatsapp_message text check (char_length(whatsapp_message) <= 500);
