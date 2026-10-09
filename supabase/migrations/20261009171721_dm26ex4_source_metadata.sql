-- Source ownership is explicit for fields used by existing search/deck RPCs.
-- Full source records retain each face and distinguish unavailable/not applicable.
alter table public.canonical_cards
  add column metadata_provenance jsonb not null default '{}'::jsonb,
  add constraint canonical_cards_metadata_provenance_object check(jsonb_typeof(metadata_provenance)='object');
alter table public.card_prints
  add column metadata_provenance jsonb not null default '{}'::jsonb,
  add column source_metadata jsonb not null default '{}'::jsonb,
  add constraint card_prints_metadata_provenance_object check(jsonb_typeof(metadata_provenance)='object'),
  add constraint card_prints_source_metadata_object check(jsonb_typeof(source_metadata)='object');
comment on column public.canonical_cards.metadata_provenance is
  'Per-field source, URL, verification state and imported value. An empty entry does not assert a source; existing official/manual values are preserved.';
comment on column public.card_prints.source_metadata is
  'Source-separated observations including all faces and field availability. DMwiki observations remain unverified; no official absence is inferred.';
comment on column public.card_prints.metadata_provenance is
  'Per-field ownership, including checked official preview image identity and content hash. Preview artwork does not assert an official catalog ID.';
comment on column public.canonical_cards.cost_is_infinite is
  'Printed cost infinity flag; consult metadata_provenance for provisional sources. Cost remains null.';
comment on column public.canonical_cards.power_text is
  'Printed base power text, including special notation; consult metadata_provenance for provisional sources.';
comment on column public.canonical_cards.power_value is
  'Safe numeric interpretation of printed base power; consult metadata_provenance for provisional sources.';
notify pgrst, 'reload schema';
