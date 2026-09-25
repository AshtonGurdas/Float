-- Let a keyword such as a card name return the whole match list, not the first page of names.
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
  order by
    (case when p.name ilike '%' || coalesce(p_tokens[1], '') || '%' then 0 else 1 end),
    p.name
  limit least(coalesce(p_limit, 80), 200);
$$;

revoke all on function public.search_catalog(text, text[], boolean, integer) from public, anon, authenticated;
grant execute on function public.search_catalog(text, text[], boolean, integer) to service_role;
