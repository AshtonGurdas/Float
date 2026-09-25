-- Float: shop books, watchlist, and a TCGplayer catalog cache.
-- Catalog tables are written by the server. Books and the watchlist belong to the signed-in user.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.catalog_groups (
  category_id integer not null,
  group_id integer not null,
  game_key text not null,
  name text not null,
  abbreviation text,
  published_on text,
  is_supplemental boolean not null default false,
  fetched_at timestamptz not null default now(),
  primary key (category_id, group_id)
);

create table if not exists public.catalog_products (
  product_id integer primary key,
  category_id integer not null,
  group_id integer not null,
  game_key text not null,
  name text not null,
  set_name text,
  image_url text,
  tcg_url text,
  number text,
  rarity text,
  sealed boolean not null default false,
  search_text text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists catalog_products_game_idx
  on public.catalog_products (game_key, sealed);

create index if not exists catalog_products_group_idx
  on public.catalog_products (category_id, group_id);

create index if not exists catalog_products_search_trgm
  on public.catalog_products using gin (search_text extensions.gin_trgm_ops);

create table if not exists public.catalog_prices (
  product_id integer not null references public.catalog_products (product_id) on delete cascade,
  subtype text not null,
  market_price numeric,
  low_price numeric,
  mid_price numeric,
  high_price numeric,
  direct_low numeric,
  updated_on date not null,
  primary key (product_id, subtype)
);

create table if not exists public.price_history (
  product_id integer not null,
  subtype text not null,
  captured_on date not null,
  market_price numeric,
  low_price numeric,
  mid_price numeric,
  primary key (product_id, subtype, captured_on)
);

create index if not exists price_history_product_idx
  on public.price_history (product_id, captured_on);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  direction text not null check (direction in ('out', 'in')),
  item_kind text not null check (item_kind in ('card', 'box', 'case', 'sealed', 'fee', 'other')),
  title text not null check (char_length(trim(title)) between 1 and 180),
  detail text,
  quantity numeric not null default 1 check (quantity > 0 and quantity <= 100000),
  unit_amount numeric not null check (unit_amount >= 0 and unit_amount < 100000000),
  fees numeric not null default 0 check (fees >= 0 and fees < 100000000),
  occurred_on date not null,
  notes text,
  product_id integer,
  subtype text,
  boxes_per_case integer check (boxes_per_case is null or (boxes_per_case > 0 and boxes_per_case <= 48)),
  lot_id uuid references public.entries (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists entries_user_date_idx
  on public.entries (user_id, occurred_on desc);

create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id integer not null,
  subtype text not null,
  name text not null,
  set_name text,
  image_url text,
  sealed boolean not null default false,
  game_key text,
  tcg_url text,
  created_at timestamptz not null default now(),
  unique (user_id, product_id, subtype)
);

create index if not exists watchlist_user_idx
  on public.watchlist (user_id, created_at desc);

-- A sale can only close a purchase that belongs to the same person.
create or replace function public.same_user_lot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  lot_direction text;
begin
  if new.lot_id is null then
    return new;
  end if;
  if new.lot_id = new.id then
    raise exception 'A line cannot point at itself.';
  end if;
  select user_id, direction into owner, lot_direction
  from public.entries
  where id = new.lot_id;
  if owner is null then
    raise exception 'That purchase was not found.';
  end if;
  if owner <> new.user_id then
    raise exception 'That purchase is not yours.';
  end if;
  if lot_direction <> 'out' then
    raise exception 'A sale has to point at a purchase.';
  end if;
  return new;
end;
$$;

drop trigger if exists entries_same_user_lot on public.entries;
create trigger entries_same_user_lot
  before insert or update on public.entries
  for each row execute function public.same_user_lot();

create or replace function public.search_catalog(
  p_game text,
  p_tokens text[],
  p_sealed boolean,
  p_limit integer
)
returns setof public.catalog_products
language sql
stable
as $$
  select p.*
  from public.catalog_products p
  where p.game_key = p_game
    and (p_sealed is null or p.sealed = p_sealed)
    and (
      coalesce(cardinality(p_tokens), 0) = 0
      or not exists (
        select 1
        from unnest(p_tokens) as tok
        where p.search_text not like '%' || tok || '%'
      )
    )
  order by p.name
  limit least(coalesce(p_limit, 40), 80);
$$;

alter table public.catalog_groups enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_prices enable row level security;
alter table public.price_history enable row level security;
alter table public.entries enable row level security;
alter table public.watchlist enable row level security;

revoke all on table public.catalog_groups from anon, authenticated;
revoke all on table public.catalog_products from anon, authenticated;
revoke all on table public.catalog_prices from anon, authenticated;
revoke all on table public.price_history from anon, authenticated;
revoke all on table public.entries from anon;
revoke all on table public.watchlist from anon;

grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.watchlist to authenticated;

drop policy if exists entries_own on public.entries;
create policy entries_own on public.entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists watchlist_own on public.watchlist;
create policy watchlist_own on public.watchlist
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on function public.search_catalog(text, text[], boolean, integer) from public, anon, authenticated;
grant execute on function public.search_catalog(text, text[], boolean, integer) to service_role;

notify pgrst, 'reload schema';
