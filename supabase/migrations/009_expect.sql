-- A price the user types for the unsold ballpark. Null means use the market price.
alter table public.entries
  add column if not exists expect_each numeric
  check (expect_each is null or (expect_each >= 0 and expect_each < 100000000));
