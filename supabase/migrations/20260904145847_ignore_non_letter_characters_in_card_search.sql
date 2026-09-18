create or replace function public.normalize_card_search(p_value text)
returns text language sql immutable parallel safe set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.lower(
      pg_catalog.translate(
        pg_catalog.translate(coalesce(p_value, ''),
          'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'),
        'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶヽヾ',
        'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖゝゞ')
    ),
    '[^a-zぁ-ゖ一-鿿㐀-䶿豈-﫿]', '', 'g'
  );
$$;
comment on function public.normalize_card_search(text) is
  'Folds full-width Latin and katakana, lowercases Latin, and removes every character except Latin letters, hiragana, katakana, and kanji.';
delete from public.card_search_terms as duplicate
using public.card_search_terms as retained
where duplicate.canonical_card_id = retained.canonical_card_id
  and duplicate.term_kind = retained.term_kind
  and public.normalize_card_search(duplicate.term) = public.normalize_card_search(retained.term)
  and (duplicate.verified < retained.verified
    or (duplicate.verified = retained.verified and duplicate.priority > retained.priority)
    or (duplicate.verified = retained.verified and duplicate.priority = retained.priority and duplicate.id > retained.id));
update public.card_search_terms
set normalized_term = public.normalize_card_search(term), updated_at = pg_catalog.now()
where normalized_term is distinct from public.normalize_card_search(term);
reindex index public.cards_normalized_name_trgm_idx;
reindex index public.cards_normalized_name_kana_trgm_idx;
reindex index public.card_search_terms_normalized_trgm_idx;
