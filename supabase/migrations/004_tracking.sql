alter table public.entries
  add column if not exists tracking_number text,
  add column if not exists tracking_carrier text;

alter table public.entries
  drop constraint if exists entries_tracking_carrier_check;

alter table public.entries
  add constraint entries_tracking_carrier_check
  check (
    tracking_carrier is null
    or tracking_carrier in ('canada-post', 'ups', 'fedex', 'usps', 'purolator', 'dhl', 'other')
  );
