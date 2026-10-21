-- People you sold to, and an optional link from a sale.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  notes text,
  regular boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_user_idx
  on public.customers (user_id, name);

alter table public.entries
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

create or replace function public.same_user_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if new.customer_id is null then
    return new;
  end if;
  select user_id into owner from public.customers where id = new.customer_id;
  if owner is null or owner <> new.user_id then
    raise exception 'That customer is not yours.';
  end if;
  return new;
end;
$$;

drop trigger if exists entries_same_user_customer on public.entries;
create trigger entries_same_user_customer
  before insert or update on public.entries
  for each row execute function public.same_user_customer();

alter table public.customers enable row level security;

revoke all on table public.customers from anon;
grant select, insert, update, delete on public.customers to authenticated;

drop policy if exists customers_own on public.customers;
create policy customers_own on public.customers
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
