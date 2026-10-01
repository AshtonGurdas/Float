alter table public.entries
  add column if not exists order_id uuid;

create index if not exists entries_order_idx
  on public.entries (user_id, order_id);
