-- Treat spacing and dash variants as presentation-only separators in card
-- searches. Keep the Japanese prolonged sound mark (ー), which is a letter
-- component rather than a separator.
create or replace function public.normalize_card_search(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        coalesce(p_value, ''),
        'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶヽヾ',
        'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖゝゞ'
      ),
      '[[:space:]・･·‐‑‒–—―−－-]',
      '',
      'g'
    )
  );
$$;

comment on function public.normalize_card_search(text) is
  'Folds katakana to hiragana and removes search-only separators including spaces, middle dots, and dash variants.';

reindex index public.cards_normalized_name_trgm_idx;
reindex index public.cards_normalized_name_kana_trgm_idx;

delete from public.card_search_terms as duplicate
using public.card_search_terms as retained
where duplicate.canonical_card_id = retained.canonical_card_id
  and duplicate.term_kind = retained.term_kind
  and public.normalize_card_search(duplicate.normalized_term)
      = public.normalize_card_search(retained.normalized_term)
  and (
    duplicate.verified < retained.verified
    or (duplicate.verified = retained.verified and duplicate.priority > retained.priority)
    or (duplicate.verified = retained.verified and duplicate.priority = retained.priority and duplicate.id > retained.id)
  );

update public.card_search_terms
set normalized_term = public.normalize_card_search(term),
    updated_at = pg_catalog.now()
where normalized_term is distinct from public.normalize_card_search(term);

update public.canonical_cards
set aliases_kana = array(
      select distinct alias_value
      from pg_catalog.unnest(aliases_kana || array['ほしふぇるき']) as alias_value
    ),
    updated_at = pg_catalog.now()
where name = '星増樹'
   or name like '星増樹＜%';

insert into public.card_search_terms(
  canonical_card_id, term, normalized_term, term_kind, source, verified, priority
)
select
  cards.id,
  'ほしふぇるき',
  public.normalize_card_search('ほしふぇるき'),
  'alias_reading',
  'curated',
  true,
  20
from public.canonical_cards as cards
where cards.name = '星増樹'
   or cards.name like '星増樹＜%'
on conflict (canonical_card_id, normalized_term, term_kind) do update
set term = excluded.term,
    source = excluded.source,
    verified = excluded.verified,
    priority = excluded.priority,
    updated_at = pg_catalog.now();

update public.cards
set aliases_kana = array(
  select distinct alias_value
  from pg_catalog.unnest(aliases_kana || array['ほしふぇるき']) as alias_value
)
where name = '星増樹'
   or name like '星増樹＜%';
