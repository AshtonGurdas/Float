alter table public.catalog_prices
  add column if not exists last_sold numeric,
  add column if not exists last_sold_condition text,
  add column if not exists last_sold_at timestamptz,
  add column if not exists last_sold_checked_at timestamptz;
