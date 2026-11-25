-- Esquema para la app de ferretería. Pégalo completo en Supabase > SQL Editor > Run.
-- ANTES de correrlo, cambia TU_CORREO@ejemplo.com por el correo con el que vas a entrar como administrador.

create table if not exists public.docs (
  path        text primary key,
  collection  text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists docs_collection_idx on public.docs (collection);

create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;  -- sin políticas: nadie la lee directo

insert into public.admins (email) values (lower('TU_CORREO@ejemplo.com')) on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.docs enable row level security;

-- Permisos de tabla (Supabase ya no los da por defecto). Las políticas de abajo limitan qué filas se ven o cambian.
grant usage on schema public to anon, authenticated;
grant select on public.docs to anon, authenticated;
grant insert, update, delete on public.docs to authenticated;

drop policy if exists docs_read on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;

-- Cualquiera lee el catálogo; solo el administrador lee lo privado (costos, ventas, pedidos).
create policy docs_read   on public.docs for select to anon, authenticated
  using (path not like 'private/%' or public.is_admin());
-- Solo el administrador escribe.
create policy docs_insert on public.docs for insert to authenticated with check (public.is_admin());
create policy docs_update on public.docs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy docs_delete on public.docs for delete to authenticated using (public.is_admin());

-- Actualizaciones en vivo
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- Fotos de productos: carpeta pública para ver, solo el administrador sube o borra.
insert into storage.buckets (id, name, public) values ('product-photos', 'product-photos', true)
on conflict (id) do update set public = true;

drop policy if exists fotos_lectura on storage.objects;
drop policy if exists fotos_insert on storage.objects;
drop policy if exists fotos_update on storage.objects;
drop policy if exists fotos_delete on storage.objects;

create policy fotos_lectura on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-photos');
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_admin());
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());
