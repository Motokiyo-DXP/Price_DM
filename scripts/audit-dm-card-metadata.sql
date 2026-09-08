with dm as (
  select cc.*
  from public.canonical_cards cc
  join public.tcg_games tg on tg.id = cc.game_id
  where tg.slug = 'duel-masters'
)
select jsonb_build_object(
  'active_cards', (select count(*) from dm),
  'synced_cards', (select count(*) from dm where metadata_synced_at is not null),
  'unsynced_cards', (select count(*) from dm where metadata_synced_at is null),
  'missing_card_types', (select count(*) from dm where card_types is null or cardinality(card_types)=0),
  'invalid_civilizations', (select count(*) from dm where exists (select 1 from unnest(coalesce(civilizations,'{}'::text[])) c where c <> all(array['light','water','darkness','fire','nature','zero']))),
  'empty_civilizations', (select count(*) from dm where civilizations is not null and cardinality(civilizations)=0),
  'null_civilizations', (select count(*) from dm where civilizations is null),
  'null_cost', (select count(*) from dm where cost is null)
) as audit;

select name, cost, civilizations, card_types, metadata_synced_at
from public.canonical_cards
where name in ('ヨビニオン・マルル','天災 デドダム','邪新年 ～ENTER THE DRAGON～','DECKY THE HALL','Katta''s Crew is Coming to Town')
order by name;
