alter table public.canonical_cards
  add column races text[] not null default '{}'::text[];

alter table public.card_prints
  add column card_texts text[] not null default '{}'::text[];

comment on column public.canonical_cards.races is
  'Unique official race names collected across all faces and prints of the canonical card. Empty when no race is present.';

comment on column public.card_prints.card_texts is
  'Official special-ability rules text for each face in display order. Entries are newline-separated abilities; empty entries preserve faces without rules text. Flavor text is excluded.';
