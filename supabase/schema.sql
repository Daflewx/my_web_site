-- Выполните в Supabase SQL Editor от владельца проекта.
-- Создайте администратора в Authentication → Users, затем добавьте его UUID в admins.
begin;

create table if not exists public.portfolio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.portfolio_admins enable row level security;
revoke all on public.portfolio_admins from anon, authenticated;

-- Пользователь не может назначить себе роль; функцию создаёт владелец БД.
create or replace function public.is_portfolio_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.portfolio_admins where user_id = (select auth.uid())); $$;
revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to anon, authenticated;

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null check (category in ('portraits', 'reportage', 'video')),
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null unique,
  thumbnail_path text,
  width integer not null check (width > 0 and width <= 50000),
  height integer not null check (height > 0 and height <= 50000),
  created_at timestamptz not null default now(),
  check ((category = 'video') = (media_type = 'video')),
  check (storage_path like owner_id::text || '/%'),
  check (thumbnail_path is null or thumbnail_path like owner_id::text || '/%')
);
create index if not exists works_created_at_idx on public.works (created_at desc);
alter table public.works enable row level security;
revoke all on public.works from anon, authenticated;
grant select on public.works to anon, authenticated;
grant insert, update, delete on public.works to authenticated;

drop policy if exists "Public can view works" on public.works;
create policy "Public can view works" on public.works for select to anon, authenticated using (true);
drop policy if exists "Admins can insert own works" on public.works;
create policy "Admins can insert own works" on public.works for insert to authenticated
with check ((select public.is_portfolio_admin()) and owner_id = (select auth.uid()));
drop policy if exists "Admins can update own works" on public.works;
create policy "Admins can update own works" on public.works for update to authenticated
using ((select public.is_portfolio_admin()) and owner_id = (select auth.uid()))
with check ((select public.is_portfolio_admin()) and owner_id = (select auth.uid()));
drop policy if exists "Admins can delete own works" on public.works;
create policy "Admins can delete own works" on public.works for delete to authenticated
using ((select public.is_portfolio_admin()) and owner_id = (select auth.uid()));

-- Публичный бакет предназначен только для опубликованных работ, не для приватных исходников.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio', 'portfolio', true, 52428800, array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Portfolio admin storage insert" on storage.objects;
create policy "Portfolio admin storage insert" on storage.objects for insert to authenticated
with check (bucket_id = 'portfolio' and (select public.is_portfolio_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Portfolio admin storage select" on storage.objects;
create policy "Portfolio admin storage select" on storage.objects for select to authenticated
using (bucket_id = 'portfolio' and (select public.is_portfolio_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Portfolio admin storage delete" on storage.objects;
create policy "Portfolio admin storage delete" on storage.objects for delete to authenticated
using (bucket_id = 'portfolio' and (select public.is_portfolio_admin()) and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;

-- После создания пользователя раскомментируйте и выполните отдельно, подставив настоящий UUID:
-- insert into public.portfolio_admins (user_id) values ('UUID-ИЗ-AUTH-USERS') on conflict do nothing;
