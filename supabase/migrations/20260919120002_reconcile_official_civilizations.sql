-- Canonical reconciliation for official civilization metadata.  The earlier
-- 20260901034328 historical backfill is preserved unchanged; this migration
-- records the current official values without relying on internal UUIDs.
begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('official-civilizations-reconciliation-20260919', 0)
);

create temporary table official_civilization_source (
  name text primary key,
  civilizations text[] not null
) on commit drop;

insert into official_civilization_source (name, civilizations) values
  ('龍素記号Si サインサイクリカ / ザーディアン・サイン', array['light', 'darkness']::text[]),
  ('新世界王の思想', array['water', 'fire', 'nature']::text[]),
  ('新世界王の闘気', array['light', 'darkness', 'nature']::text[]),
  ('新世界王の権威', array['light', 'darkness', 'fire']::text[]),
  ('堕魔 グリデリア / 堕呪 フンズヴァイ', array['darkness']::text[]),
  ('天体妖精エスメル / 「お茶はいかがですか？」', array['nature']::text[]),
  ('アクア・スペルブルー / インビンシブル・オーラ', array['water']::text[]),
  ('轟く覚醒 レッドゾーン・バスター', array['light', 'water', 'darkness']::text[]),
  ('呪烏竜 ACE-Curase / 繁栄の鏡', array['water', 'darkness']::text[]),
  ('覚醒竜機ボルバルザークJr.', array['fire', 'nature', 'water']::text[]),
  ('イッコダス・ケイジ/種デスティニー', array['nature']::text[]),
  ('マザー・エイリアン＜よろこんで＞', array['light', 'water', 'darkness', 'fire']::text[]);

do $$
declare
  multiple_targets text;
  locked_conflicts text;
begin
  select string_agg(name, ', ' order by name)
    into multiple_targets
  from (
    select source.name
    from official_civilization_source source
    join public.tcg_games game on game.slug = 'duel-masters'
    left join public.canonical_cards cards
      on cards.game_id = game.id
     and cards.name = source.name
     and cards.deleted_at is null
    group by source.name
    having count(cards.id) > 1
  ) duplicates;

  if multiple_targets is not null then
    raise exception 'Official civilization reconciliation found multiple active canonical cards: %', multiple_targets;
  end if;

  select string_agg(source.name, ', ' order by source.name)
    into locked_conflicts
  from official_civilization_source source
  join public.tcg_games game on game.slug = 'duel-masters'
  join public.canonical_cards cards
    on cards.game_id = game.id
   and cards.name = source.name
   and cards.deleted_at is null
  where cards.manually_locked
    and cards.civilizations is distinct from source.civilizations;

  if locked_conflicts is not null then
    raise exception 'Official civilization reconciliation would overwrite manually locked cards: %', locked_conflicts;
  end if;
end $$;

-- A missing target is intentionally a no-op: lean fresh catalogs may not yet
-- contain every official print.  Multiple or manually locked mismatches stop.
update public.canonical_cards cards
set civilizations = source.civilizations,
    updated_at = pg_catalog.now()
from official_civilization_source source
join public.tcg_games game on game.slug = 'duel-masters'
where cards.game_id = game.id
  and cards.name = source.name
  and cards.deleted_at is null
  and not cards.manually_locked
  and cards.civilizations is distinct from source.civilizations;

commit;
