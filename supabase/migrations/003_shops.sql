-- Stores the user has bought from, and an optional link from a purchase.
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  where_from text,
  shipping text not null default 'waiting' check (shipping in ('fast', 'ok', 'slow', 'waiting')),
  quality text not null default 'unchecked' check (quality in ('great', 'ok', 'poor', 'unchecked')),
  legit text not null default 'unsure' check (legit in ('yes', 'unsure', 'no')),
  again text not null default 'maybe' check (again in ('yes', 'maybe', 'no')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shops_user_idx
  on public.shops (user_id, name);

alter table public.entries
  add column if not exists shop_id uuid references public.shops (id) on delete set null;

create or replace function public.same_user_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if new.shop_id is null then
    return new;
  end if;
  select user_id into owner from public.shops where id = new.shop_id;
  if owner is null or owner <> new.user_id then
    raise exception 'That store is not yours.';
  end if;
  return new;
end;
$$;

drop trigger if exists entries_same_user_shop on public.entries;
create trigger entries_same_user_shop
  before insert or update on public.entries
  for each row execute function public.same_user_shop();

alter table public.shops enable row level security;

revoke all on table public.shops from anon;
grant select, insert, update, delete on public.shops to authenticated;

drop policy if exists shops_own on public.shops;
create policy shops_own on public.shops
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
