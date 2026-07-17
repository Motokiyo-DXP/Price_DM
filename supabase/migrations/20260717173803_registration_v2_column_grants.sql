-- The v2 registration executor reads only the columns used for identity and
-- approval checks. It does not receive unrestricted table access.
grant select (id, game_id, deleted_at)
  on public.canonical_cards to price_registration_executor;
grant select (id, canonical_card_id, legacy_card_id, deleted_at)
  on public.card_prints to price_registration_executor;
grant select (id, slug, deleted_at, approval_status)
  on public.price_attributes to price_registration_executor;

