-- PostgreSQL 17's Unicode normalization keeps direct RPC callers as tolerant
-- as the Next.js client, including full-width Latin letters and hyphens.
create or replace function public.normalize_shop_search(p_value text)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  v_value text := pg_catalog.lower(normalize(coalesce(p_value, ''), NFKC));
begin
  v_value := pg_catalog.replace(v_value, 'flat', 'ふらっと');
  v_value := pg_catalog.replace(v_value, '秋葉原', 'あきはばら');
  v_value := pg_catalog.replace(v_value, '秘密基地', 'ひみつきち');
  v_value := pg_catalog.replace(v_value, 'ラジオ会館', 'らじおかいかん');
  v_value := pg_catalog.replace(v_value, '会館', 'かいかん');
  v_value := pg_catalog.replace(v_value, '買取センター', 'かいとりせんたー');
  v_value := pg_catalog.replace(v_value, '駅前', 'えきまえ');
  v_value := pg_catalog.replace(v_value, '本店', 'ほんてん');
  v_value := pg_catalog.replace(v_value, '別館', 'べっかん');
  v_value := pg_catalog.replace(v_value, '工房', 'こうぼう');
  v_value := pg_catalog.replace(v_value, '福福', 'ふくふく');
  v_value := pg_catalog.replace(v_value, '商会', 'しょうかい');
  v_value := pg_catalog.replace(v_value, '遊亜王', 'ゆうあおう');
  v_value := pg_catalog.replace(v_value, '竜星', 'りゅうせい');
  v_value := pg_catalog.replace(v_value, '無線', 'むせん');
  v_value := pg_catalog.replace(v_value, '晴れる屋', 'はれるや');
  v_value := pg_catalog.replace(v_value, '東京', 'とうきょう');
  v_value := pg_catalog.replace(v_value, '宮殿', 'きゅうでん');
  v_value := pg_catalog.replace(v_value, '大明神', 'だいみょうじん');
  v_value := pg_catalog.replace(v_value, '買賊王', 'かいぞくおう');
  v_value := pg_catalog.replace(v_value, '梟', 'ふくろう');
  v_value := pg_catalog.replace(v_value, '書庫', 'しょこ');
  v_value := pg_catalog.replace(v_value, '買取', 'かいとり');
  v_value := pg_catalog.replace(v_value, '号', 'ごう');
  v_value := pg_catalog.replace(v_value, '番', 'ばん');
  v_value := pg_catalog.replace(v_value, '店', 'てん');
  v_value := pg_catalog.replace(v_value, '館', 'かん');

  v_value := pg_catalog.translate(
    v_value,
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶヽヾ',
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖゝゞ'
  );

  return pg_catalog.regexp_replace(
    v_value,
    '[[:space:]・･·‐‑‒–—―−－ーｰ-]',
    '',
    'g'
  );
end;
$$;
