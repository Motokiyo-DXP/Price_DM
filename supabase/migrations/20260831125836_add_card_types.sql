alter table public.canonical_cards
  add column card_types text[] not null default '{}'::text[],
  add constraint canonical_cards_card_types_check
    check (
      cardinality(card_types) <= 8
      and array_position(card_types, '') is null
    );

create index canonical_cards_card_types_gin_idx
  on public.canonical_cards using gin (card_types)
  where deleted_at is null;

comment on column public.canonical_cards.card_types is
  'Official Japanese values from カードの種類. Multiple entries preserve multi-face cards such as twin-pacts.';
