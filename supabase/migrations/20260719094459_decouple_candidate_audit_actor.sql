-- reviewed_by is immutable audit metadata written from auth.uid() by the
-- review RPC. It must remain available even if an Auth user is later removed.
alter table public.shop_candidates
  drop constraint shop_candidates_reviewed_by_fkey;
