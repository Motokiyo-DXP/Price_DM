alter table public.canonical_cards
  add column if not exists metadata_synced_at timestamptz;

comment on column public.canonical_cards.civilizations is
  'Stable civilization slugs: light, water, darkness, fire, nature, and zero. Empty is valid when the official civilization field is blank.';

comment on column public.canonical_cards.metadata_synced_at is
  'Last successful synchronization of cost and civilization data from the official card catalog. NULL means not yet synchronized.';
