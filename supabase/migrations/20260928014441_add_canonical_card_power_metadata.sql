alter table public.canonical_cards
  add column cost_is_infinite boolean not null default false,
  add column power_text text,
  add column power_value integer,
  add constraint canonical_cards_infinite_cost_null_check
    check (not cost_is_infinite or cost is null);

comment on column public.canonical_cards.cost_is_infinite is
  'True when the official printed card cost is infinity; cost remains null.';
comment on column public.canonical_cards.power_text is
  'Officially printed base power text, preserving special notation.';
comment on column public.canonical_cards.power_value is
  'Numeric interpretation of printed base power when it is safe to interpret.';
