alter table public.canonical_cards
  add column cost smallint,
  add column civilizations text[] not null default '{}'::text[],
  add constraint canonical_cards_cost_check
    check (cost is null or cost between 0 and 99),
  add constraint canonical_cards_civilizations_check
    check (
      civilizations <@ array[
        'light', 'water', 'darkness', 'fire', 'nature', 'zero'
      ]::text[]
      and cardinality(civilizations) <= 6
    );

create index canonical_cards_cost_idx
  on public.canonical_cards(cost)
  where deleted_at is null and cost is not null;

create index canonical_cards_civilizations_gin_idx
  on public.canonical_cards using gin (civilizations)
  where deleted_at is null;

comment on column public.canonical_cards.cost is
  'Printed mana cost of the canonical card. NULL means not yet registered or not applicable.';

comment on column public.canonical_cards.civilizations is
  'Stable civilization slugs: light, water, darkness, fire, nature, and zero. Empty means not yet registered.';
