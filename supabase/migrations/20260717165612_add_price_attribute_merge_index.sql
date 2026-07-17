create index if not exists price_attributes_merged_into_id_idx
  on public.price_attributes (merged_into_id)
  where merged_into_id is not null;

