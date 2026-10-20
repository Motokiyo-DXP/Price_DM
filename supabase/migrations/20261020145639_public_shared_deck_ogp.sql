-- OGP must not reuse the token-only private-deck viewing permission.
create function public.get_public_shared_deck(p_share_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.get_shared_deck(d.share_token)
  from public.decks d
  where d.share_token = p_share_token and d.visibility = 'public';
$$;
revoke all on function public.get_public_shared_deck(uuid) from public, anon, authenticated;
grant execute on function public.get_public_shared_deck(uuid) to anon, authenticated;
