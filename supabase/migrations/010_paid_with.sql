-- Debit cash counts in the purchase month. Credit cash counts on the next month's bill.
alter table public.entries
  add column if not exists paid_with text not null default 'debit'
  check (paid_with in ('debit', 'credit'));
