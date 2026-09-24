begin;
do $$
begin
  if (
    select count(*)
    from public.canonical_cards as cards
    join public.tcg_games as games on games.id = cards.game_id
    where cards.id = 43753
      and games.slug = 'duel-masters'
      and cards.deleted_at is null
      and cards.name in (
        '鉄初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク',
        '銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク'
      )
  ) <> 1 then
    raise exception 'DM26-RP3 card-name correction target mismatch';
  end if;
end;
$$;
update public.canonical_cards
set name = '銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク',
    source_name = '銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク',
    updated_at = pg_catalog.now()
where id = 43753
  and name = '鉄初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク';

insert into public.card_search_terms as terms(
  canonical_card_id, term, normalized_term, term_kind, source, verified, priority
)
values (
  43753,
  '銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク',
  public.normalize_card_search('銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク'),
  'official_name',
  'official',
  true,
  0
)
on conflict (canonical_card_id, normalized_term, term_kind) do update
set term = excluded.term,
    source = excluded.source,
    verified = excluded.verified,
    priority = excluded.priority,
    updated_at = pg_catalog.now()
where (terms.term, terms.source, terms.verified, terms.priority)
  is distinct from (excluded.term, excluded.source, excluded.verified, excluded.priority);

delete from public.card_search_terms as stale_name
where stale_name.canonical_card_id = 43753
  and stale_name.term_kind = 'official_name'
  and stale_name.term = '鉄初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク'
  and stale_name.normalized_term = public.normalize_card_search(
    '鉄初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク'
  )
  and exists (
    select 1
    from public.card_search_terms as corrected_name
    where corrected_name.canonical_card_id = 43753
      and corrected_name.term_kind = 'official_name'
      and corrected_name.normalized_term = public.normalize_card_search(
        '銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク'
      )
  );
create temporary table original01_reading_source(
  card_name text not null,
  reading text not null,
  source_url text not null
) on commit drop;
insert into original01_reading_source(card_name, reading, source_url) values
  ('同期の妖精 / ド浮きの動悸', 'シンクロ・フェアリー', 'https://dmwiki.net/%E3%80%8A%E5%90%8C%E6%9C%9F%E3%81%AE%E5%A6%96%E7%B2%BE%EF%BC%8F%E3%83%89%E6%B5%AE%E3%81%8D%E3%81%AE%E5%8B%95%E6%82%B8%E3%80%8B'),
  ('同期の妖精 / ド浮きの動悸', 'ドキドキ・スパイラル', 'https://dmwiki.net/%E3%80%8A%E5%90%8C%E6%9C%9F%E3%81%AE%E5%A6%96%E7%B2%BE%EF%BC%8F%E3%83%89%E6%B5%AE%E3%81%8D%E3%81%AE%E5%8B%95%E6%82%B8%E3%80%8B'),
  ('同期の妖精 / ド浮きの動悸', 'シンクロ・フェアリー／ドキドキ・スパイラル', 'https://dmwiki.net/%E3%80%8A%E5%90%8C%E6%9C%9F%E3%81%AE%E5%A6%96%E7%B2%BE%EF%BC%8F%E3%83%89%E6%B5%AE%E3%81%8D%E3%81%AE%E5%8B%95%E6%82%B8%E3%80%8B'),
  ('∞龍 ゲンムエンペラー', 'むげんりゅう', 'https://dmwiki.net/%E3%80%8A%E2%88%9E%E9%BE%8D%20%E3%82%B2%E3%83%B3%E3%83%A0%E3%82%A8%E3%83%B3%E3%83%9A%E3%83%A9%E3%83%BC%E3%80%8B'),
  ('∞龍 ゲンムエンペラー', 'むげんりゅう ゲンムエンペラー', 'https://dmwiki.net/%E3%80%8A%E2%88%9E%E9%BE%8D%20%E3%82%B2%E3%83%B3%E3%83%A0%E3%82%A8%E3%83%B3%E3%83%9A%E3%83%A9%E3%83%BC%E3%80%8B'),
  ('王道の弾丸 ジョリー・ザ・ジョニー', 'おうどう', 'https://dmwiki.net/%E3%80%8A%E7%8E%8B%E9%81%93%E3%81%AE%E5%BC%BE%E4%B8%B8%20%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%82%B8%E3%83%A7%E3%83%8B%E3%83%BC%E3%80%8B'),
  ('王道の弾丸 ジョリー・ザ・ジョニー', 'だんがん', 'https://dmwiki.net/%E3%80%8A%E7%8E%8B%E9%81%93%E3%81%AE%E5%BC%BE%E4%B8%B8%20%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%82%B8%E3%83%A7%E3%83%8B%E3%83%BC%E3%80%8B'),
  ('王道の弾丸 ジョリー・ザ・ジョニー', 'おうどうのだんがん ジョリー・ザ・ジョニー', 'https://dmwiki.net/%E3%80%8A%E7%8E%8B%E9%81%93%E3%81%AE%E5%BC%BE%E4%B8%B8%20%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%82%B8%E3%83%A7%E3%83%8B%E3%83%BC%E3%80%8B'),
  ('偽りの希望 鬼丸「終斗」', 'コードミラクル', 'https://dmwiki.net/%E3%80%8A%E5%81%BD%E3%82%8A%E3%81%AE%E5%B8%8C%E6%9C%9B%20%E9%AC%BC%E4%B8%B8%E3%80%8C%E7%B5%82%E6%96%97%E3%80%8D%E3%80%8B'),
  ('偽りの希望 鬼丸「終斗」', 'おにまる', 'https://dmwiki.net/%E3%80%8A%E5%81%BD%E3%82%8A%E3%81%AE%E5%B8%8C%E6%9C%9B%20%E9%AC%BC%E4%B8%B8%E3%80%8C%E7%B5%82%E6%96%97%E3%80%8D%E3%80%8B'),
  ('偽りの希望 鬼丸「終斗」', 'ピリオド', 'https://dmwiki.net/%E3%80%8A%E5%81%BD%E3%82%8A%E3%81%AE%E5%B8%8C%E6%9C%9B%20%E9%AC%BC%E4%B8%B8%E3%80%8C%E7%B5%82%E6%96%97%E3%80%8D%E3%80%8B'),
  ('偽りの希望 鬼丸「終斗」', 'コードミラクル おにまる「ピリオド」', 'https://dmwiki.net/%E3%80%8A%E5%81%BD%E3%82%8A%E3%81%AE%E5%B8%8C%E6%9C%9B%20%E9%AC%BC%E4%B8%B8%E3%80%8C%E7%B5%82%E6%96%97%E3%80%8D%E3%80%8B'),
  ('王道ダチ キャンベロ', 'オド', 'https://dmwiki.net/%E3%80%8A%E7%8E%8B%E9%81%93%E3%83%80%E3%83%81%20%E3%82%AD%E3%83%A3%E3%83%B3%E3%83%99%E3%83%AD%E3%80%8B'),
  ('王道ダチ キャンベロ', 'オドダチ キャンベロ', 'https://dmwiki.net/%E3%80%8A%E7%8E%8B%E9%81%93%E3%83%80%E3%83%81%20%E3%82%AD%E3%83%A3%E3%83%B3%E3%83%99%E3%83%AD%E3%80%8B'),
  ('一王二命三眼槍', 'バラド・ヴィ・ナ・シューラ', 'https://dmwiki.net/%E3%80%8A%E4%B8%80%E7%8E%8B%E4%BA%8C%E5%91%BD%E4%B8%89%E7%9C%BC%E6%A7%8D%E3%80%8B'),
  ('水上第九院 シャコガイル', 'すいじょうだいきゅういん', 'https://dmwiki.net/%E3%80%8A%E6%B0%B4%E4%B8%8A%E7%AC%AC%E4%B9%9D%E9%99%A2%20%E3%82%B7%E3%83%A3%E3%82%B3%E3%82%AC%E3%82%A4%E3%83%AB%E3%80%8B'),
  ('水上第九院 シャコガイル', 'すいじょうだいきゅういん シャコガイル', 'https://dmwiki.net/%E3%80%8A%E6%B0%B4%E4%B8%8A%E7%AC%AC%E4%B9%9D%E9%99%A2%20%E3%82%B7%E3%83%A3%E3%82%B3%E3%82%AC%E3%82%A4%E3%83%AB%E3%80%8B'),
  ('地封龍 ギャイア', 'ちふうりゅう', 'https://dmwiki.net/%E3%80%8A%E5%9C%B0%E5%B0%81%E9%BE%8D%20%E3%82%AE%E3%83%A3%E3%82%A4%E3%82%A2%E3%80%8B'),
  ('地封龍 ギャイア', 'ちふうりゅう ギャイア', 'https://dmwiki.net/%E3%80%8A%E5%9C%B0%E5%B0%81%E9%BE%8D%20%E3%82%AE%E3%83%A3%E3%82%A4%E3%82%A2%E3%80%8B'),
  ('大樹王 ギガンディダノス', 'だいじゅおう', 'https://dmwiki.net/%E3%80%8A%E5%A4%A7%E6%A8%B9%E7%8E%8B%20%E3%82%AE%E3%82%AC%E3%83%B3%E3%83%87%E3%82%A3%E3%83%80%E3%83%8E%E3%82%B9%E3%80%8B'),
  ('大樹王 ギガンディダノス', 'だいじゅおう ギガンディダノス', 'https://dmwiki.net/%E3%80%8A%E5%A4%A7%E6%A8%B9%E7%8E%8B%20%E3%82%AE%E3%82%AC%E3%83%B3%E3%83%87%E3%82%A3%E3%83%80%E3%83%8E%E3%82%B9%E3%80%8B'),
  ('勝利龍装 クラッシュ“覇道”', 'しょうりりゅうそう', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E5%88%A9%E9%BE%8D%E8%A3%85%20%E3%82%AF%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E2%80%9C%E8%A6%87%E9%81%93%E2%80%9D%E3%80%8B'),
  ('勝利龍装 クラッシュ“覇道”', 'ヘッド', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E5%88%A9%E9%BE%8D%E8%A3%85%20%E3%82%AF%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E2%80%9C%E8%A6%87%E9%81%93%E2%80%9D%E3%80%8B'),
  ('勝利龍装 クラッシュ“覇道”', 'しょうりりゅうそう クラッシュ“ヘッド”', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E5%88%A9%E9%BE%8D%E8%A3%85%20%E3%82%AF%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E2%80%9C%E8%A6%87%E9%81%93%E2%80%9D%E3%80%8B'),
  ('理想と平和の決断', 'パーフェクト・アルカディア', 'https://dmwiki.net/%E3%80%8A%E7%90%86%E6%83%B3%E3%81%A8%E5%B9%B3%E5%92%8C%E3%81%AE%E6%B1%BA%E6%96%AD%E3%80%8B'),
  ('～邪眼帝 PARTⅡ～', 'エンドレス・ジャスティス・ロマノフ・バイブル', 'https://dmwiki.net/%E3%80%8A%EF%BD%9E%E9%82%AA%E7%9C%BC%E5%B8%9D%20PART%E2%85%A1%EF%BD%9E%E3%80%8B'),
  ('～邪眼帝 PARTⅡ～', '～エンドレス・ジャスティス・ロマノフ・バイブル～', 'https://dmwiki.net/%E3%80%8A%EF%BD%9E%E9%82%AA%E7%9C%BC%E5%B8%9D%20PART%E2%85%A1%EF%BD%9E%E3%80%8B'),
  ('天災 デドダム', 'ディザスター', 'https://dmwiki.net/%E3%80%8A%E5%A4%A9%E7%81%BD%20%E3%83%87%E3%83%89%E3%83%80%E3%83%A0%E3%80%8B'),
  ('天災 デドダム', 'ディザスター デドダム', 'https://dmwiki.net/%E3%80%8A%E5%A4%A9%E7%81%BD%20%E3%83%87%E3%83%89%E3%83%80%E3%83%A0%E3%80%8B'),
  ('ベイビーポンの助', 'すけ', 'https://dmwiki.net/%E3%80%8A%E3%83%99%E3%82%A4%E3%83%93%E3%83%BC%E3%83%9D%E3%83%B3%E3%81%AE%E5%8A%A9%E3%80%8B'),
  ('ベイビーポンの助', 'ベイビーポンのすけ', 'https://dmwiki.net/%E3%80%8A%E3%83%99%E3%82%A4%E3%83%93%E3%83%BC%E3%83%9D%E3%83%B3%E3%81%AE%E5%8A%A9%E3%80%8B'),
  ('料理猫のプワソン', 'りょうりねこ', 'https://dmwiki.net/%E3%80%8A%E6%96%99%E7%90%86%E7%8C%AB%E3%81%AE%E3%83%97%E3%83%AF%E3%82%BD%E3%83%B3%E3%80%8B'),
  ('料理猫のプワソン', 'りょうりねこのプワソン', 'https://dmwiki.net/%E3%80%8A%E6%96%99%E7%90%86%E7%8C%AB%E3%81%AE%E3%83%97%E3%83%AF%E3%82%BD%E3%83%B3%E3%80%8B'),
  ('コンダマ / 魂フエミドロ', 'たま', 'https://dmwiki.net/%E3%80%8A%E3%82%B3%E3%83%B3%E3%83%80%E3%83%9E%EF%BC%8F%E9%AD%82%E3%83%95%E3%82%A8%E3%83%9F%E3%83%89%E3%83%AD%E3%80%8B'),
  ('コンダマ / 魂フエミドロ', 'コンダマ／たまフエミドロ', 'https://dmwiki.net/%E3%80%8A%E3%82%B3%E3%83%B3%E3%83%80%E3%83%9E%EF%BC%8F%E9%AD%82%E3%83%95%E3%82%A8%E3%83%9F%E3%83%89%E3%83%AD%E3%80%8B'),
  ('影世界のシクミ', 'かげせかい', 'https://dmwiki.net/%E3%80%8A%E5%BD%B1%E4%B8%96%E7%95%8C%E3%81%AE%E3%82%B7%E3%82%AF%E3%83%9F%E3%80%8B'),
  ('影世界のシクミ', 'かげせかいのシクミ', 'https://dmwiki.net/%E3%80%8A%E5%BD%B1%E4%B8%96%E7%95%8C%E3%81%AE%E3%82%B7%E3%82%AF%E3%83%9F%E3%80%8B'),
  ('アストラルの海幻', 'ビジョン', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%82%B9%E3%83%88%E3%83%A9%E3%83%AB%E3%81%AE%E6%B5%B7%E5%B9%BB%E3%80%8B'),
  ('アストラルの海幻', 'アストラルのビジョン', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%82%B9%E3%83%88%E3%83%A9%E3%83%AB%E3%81%AE%E6%B5%B7%E5%B9%BB%E3%80%8B'),
  ('冥王の牙', 'バビロン・ゲルグ', 'https://dmwiki.net/%E3%80%8A%E5%86%A5%E7%8E%8B%E3%81%AE%E7%89%99%E3%80%8B'),
  ('「正義全帝」', 'ジャスティス・アンド・エブリシングエルス', 'https://dmwiki.net/%E3%80%8A%E3%80%8C%E6%AD%A3%E7%BE%A9%E5%85%A8%E5%B8%9D%E3%80%8D%E3%80%8B'),
  ('「正義全帝」', '「ジャスティス・アンド・エブリシングエルス」', 'https://dmwiki.net/%E3%80%8A%E3%80%8C%E6%AD%A3%E7%BE%A9%E5%85%A8%E5%B8%9D%E3%80%8D%E3%80%8B'),
  ('戒王の封', 'スカルベント・ガデス', 'https://dmwiki.net/%E3%80%8A%E6%88%92%E7%8E%8B%E3%81%AE%E5%B0%81%E3%80%8B'),
  ('自然の四君子 ガイアハザード', 'しぜん', 'https://dmwiki.net/%E3%80%8A%E8%87%AA%E7%84%B6%E3%81%AE%E5%9B%9B%E5%90%9B%E5%AD%90%20%E3%82%AC%E3%82%A4%E3%82%A2%E3%83%8F%E3%82%B6%E3%83%BC%E3%83%89%E3%80%8B'),
  ('自然の四君子 ガイアハザード', 'しくんし', 'https://dmwiki.net/%E3%80%8A%E8%87%AA%E7%84%B6%E3%81%AE%E5%9B%9B%E5%90%9B%E5%AD%90%20%E3%82%AC%E3%82%A4%E3%82%A2%E3%83%8F%E3%82%B6%E3%83%BC%E3%83%89%E3%80%8B'),
  ('自然の四君子 ガイアハザード', 'しぜんのしくんし ガイアハザード', 'https://dmwiki.net/%E3%80%8A%E8%87%AA%E7%84%B6%E3%81%AE%E5%9B%9B%E5%90%9B%E5%AD%90%20%E3%82%AC%E3%82%A4%E3%82%A2%E3%83%8F%E3%82%B6%E3%83%BC%E3%83%89%E3%80%8B'),
  ('「正義と正義と正義と正義」', '「イフフェイト・アロウズ・ウィーウィル・ミートアゲイン」「メイ・ザ・ムーンズブレッシング・ビーアポンアス」', 'https://dmwiki.net/%E3%80%8A%E3%80%8C%E6%AD%A3%E7%BE%A9%E3%81%A8%E6%AD%A3%E7%BE%A9%E3%81%A8%E6%AD%A3%E7%BE%A9%E3%81%A8%E6%AD%A3%E7%BE%A9%E3%80%8D%E3%80%8B'),
  ('アアルカイトの電影', 'スクショ', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%82%A2%E3%83%AB%E3%82%AB%E3%82%A4%E3%83%88%E3%81%AE%E9%9B%BB%E5%BD%B1%E3%80%8B'),
  ('アアルカイトの電影', 'アアルカイトのスクショ', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%82%A2%E3%83%AB%E3%82%AB%E3%82%A4%E3%83%88%E3%81%AE%E9%9B%BB%E5%BD%B1%E3%80%8B'),
  ('アイシャセー神', 'しん', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%82%A4%E3%82%B7%E3%83%A3%E3%82%BB%E3%83%BC%E7%A5%9E%E3%80%8B'),
  ('アイシャセー神', 'アイシャセーしん', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%82%A4%E3%82%B7%E3%83%A3%E3%82%BB%E3%83%BC%E7%A5%9E%E3%80%8B'),
  ('クリスタの輝影 / シディアン・ニーラム', 'メタショ', 'https://dmwiki.net/%E3%80%8A%E3%82%AF%E3%83%AA%E3%82%B9%E3%82%BF%E3%81%AE%E8%BC%9D%E5%BD%B1%EF%BC%8F%E3%82%B7%E3%83%87%E3%82%A3%E3%82%A2%E3%83%B3%E3%83%BB%E3%83%8B%E3%83%BC%E3%83%A9%E3%83%A0%E3%80%8B'),
  ('クリスタの輝影 / シディアン・ニーラム', 'クリスタのメタショ／シディアン・ニーラム', 'https://dmwiki.net/%E3%80%8A%E3%82%AF%E3%83%AA%E3%82%B9%E3%82%BF%E3%81%AE%E8%BC%9D%E5%BD%B1%EF%BC%8F%E3%82%B7%E3%83%87%E3%82%A3%E3%82%A2%E3%83%B3%E3%83%BB%E3%83%8B%E3%83%BC%E3%83%A9%E3%83%A0%E3%80%8B'),
  ('ゲラッチョ重役 / 「ミーのチョーおすすめゲラ！」', 'じゅうやく', 'https://dmwiki.net/%E3%80%8A%E3%82%B2%E3%83%A9%E3%83%83%E3%83%81%E3%83%A7%E9%87%8D%E5%BD%B9%EF%BC%8F%E3%80%8C%E3%83%9F%E3%83%BC%E3%81%AE%E3%83%81%E3%83%A7%E3%83%BC%E3%81%8A%E3%81%99%E3%81%99%E3%82%81%E3%82%B2%E3%83%A9%EF%BC%81%E3%80%8D%E3%80%8B'),
  ('ゲラッチョ重役 / 「ミーのチョーおすすめゲラ！」', 'ゲラッチョじゅうやく／「ミーのチョーおすすめゲラ！」', 'https://dmwiki.net/%E3%80%8A%E3%82%B2%E3%83%A9%E3%83%83%E3%83%81%E3%83%A7%E9%87%8D%E5%BD%B9%EF%BC%8F%E3%80%8C%E3%83%9F%E3%83%BC%E3%81%AE%E3%83%81%E3%83%A7%E3%83%BC%E3%81%8A%E3%81%99%E3%81%99%E3%82%81%E3%82%B2%E3%83%A9%EF%BC%81%E3%80%8D%E3%80%8B'),
  ('ジョット・首魁・ジョラゴン', 'ギャング', 'https://dmwiki.net/%E3%80%8A%E3%82%B8%E3%83%A7%E3%83%83%E3%83%88%E3%83%BB%E9%A6%96%E9%AD%81%E3%83%BB%E3%82%B8%E3%83%A7%E3%83%A9%E3%82%B4%E3%83%B3%E3%80%8B'),
  ('ジョット・首魁・ジョラゴン', 'ジョット・ギャング・ジョラゴン', 'https://dmwiki.net/%E3%80%8A%E3%82%B8%E3%83%A7%E3%83%83%E3%83%88%E3%83%BB%E9%A6%96%E9%AD%81%E3%83%BB%E3%82%B8%E3%83%A7%E3%83%A9%E3%82%B4%E3%83%B3%E3%80%8B'),
  ('チュチュリスの爆影 / “無我怒”駆乱襲', 'ビトショ', 'https://dmwiki.net/%E3%80%8A%E3%83%81%E3%83%A5%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%E3%81%AE%E7%88%86%E5%BD%B1%EF%BC%8F%E2%80%9C%E7%84%A1%E6%88%91%E6%80%92%E2%80%9D%E9%A7%86%E4%B9%B1%E8%A5%B2%E3%80%8B'),
  ('チュチュリスの爆影 / “無我怒”駆乱襲', 'メガトン', 'https://dmwiki.net/%E3%80%8A%E3%83%81%E3%83%A5%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%E3%81%AE%E7%88%86%E5%BD%B1%EF%BC%8F%E2%80%9C%E7%84%A1%E6%88%91%E6%80%92%E2%80%9D%E9%A7%86%E4%B9%B1%E8%A5%B2%E3%80%8B'),
  ('チュチュリスの爆影 / “無我怒”駆乱襲', 'クラッシュ', 'https://dmwiki.net/%E3%80%8A%E3%83%81%E3%83%A5%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%E3%81%AE%E7%88%86%E5%BD%B1%EF%BC%8F%E2%80%9C%E7%84%A1%E6%88%91%E6%80%92%E2%80%9D%E9%A7%86%E4%B9%B1%E8%A5%B2%E3%80%8B'),
  ('チュチュリスの爆影 / “無我怒”駆乱襲', 'チュチュリスのビトショ／“メガトン”クラッシュ', 'https://dmwiki.net/%E3%80%8A%E3%83%81%E3%83%A5%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%E3%81%AE%E7%88%86%E5%BD%B1%EF%BC%8F%E2%80%9C%E7%84%A1%E6%88%91%E6%80%92%E2%80%9D%E9%A7%86%E4%B9%B1%E8%A5%B2%E3%80%8B'),
  ('ドドンガ轟キャイエス', 'ごう', 'https://dmwiki.net/%E3%80%8A%E3%83%89%E3%83%89%E3%83%B3%E3%82%AC%E8%BD%9F%E3%82%AD%E3%83%A3%E3%82%A4%E3%82%A8%E3%82%B9%E3%80%8B'),
  ('ドドンガ轟キャイエス', 'ドドンガごうキャイエス', 'https://dmwiki.net/%E3%80%8A%E3%83%89%E3%83%89%E3%83%B3%E3%82%AC%E8%BD%9F%E3%82%AD%E3%83%A3%E3%82%A4%E3%82%A8%E3%82%B9%E3%80%8B'),
  ('ドラマチック息子', 'むすこ', 'https://dmwiki.net/%E3%80%8A%E3%83%89%E3%83%A9%E3%83%9E%E3%83%81%E3%83%83%E3%82%AF%E6%81%AF%E5%AD%90%E3%80%8B'),
  ('ドラマチック息子', 'ドラマチックむすこ', 'https://dmwiki.net/%E3%80%8A%E3%83%89%E3%83%A9%E3%83%9E%E3%83%81%E3%83%83%E3%82%AF%E6%81%AF%E5%AD%90%E3%80%8B'),
  ('バギンの闇影 / 卑劣な裏切り', 'マフショ', 'https://dmwiki.net/%E3%80%8A%E3%83%90%E3%82%AE%E3%83%B3%E3%81%AE%E9%97%87%E5%BD%B1%EF%BC%8F%E5%8D%91%E5%8A%A3%E3%81%AA%E8%A3%8F%E5%88%87%E3%82%8A%E3%80%8B'),
  ('バギンの闇影 / 卑劣な裏切り', 'ギリギリ・ビトレイヤル', 'https://dmwiki.net/%E3%80%8A%E3%83%90%E3%82%AE%E3%83%B3%E3%81%AE%E9%97%87%E5%BD%B1%EF%BC%8F%E5%8D%91%E5%8A%A3%E3%81%AA%E8%A3%8F%E5%88%87%E3%82%8A%E3%80%8B'),
  ('バギンの闇影 / 卑劣な裏切り', 'バギンのマフショ／ギリギリ・ビトレイヤル', 'https://dmwiki.net/%E3%80%8A%E3%83%90%E3%82%AE%E3%83%B3%E3%81%AE%E9%97%87%E5%BD%B1%EF%BC%8F%E5%8D%91%E5%8A%A3%E3%81%AA%E8%A3%8F%E5%88%87%E3%82%8A%E3%80%8B'),
  ('ルグンドドの大影 / マメ・ウィズ・ア・ミッション', 'グラショ', 'https://dmwiki.net/%E3%80%8A%E3%83%AB%E3%82%B0%E3%83%B3%E3%83%89%E3%83%89%E3%81%AE%E5%A4%A7%E5%BD%B1%EF%BC%8F%E3%83%9E%E3%83%A1%E3%83%BB%E3%82%A6%E3%82%A3%E3%82%BA%E3%83%BB%E3%82%A2%E3%83%BB%E3%83%9F%E3%83%83%E3%82%B7%E3%83%A7%E3%83%B3%E3%80%8B'),
  ('ルグンドドの大影 / マメ・ウィズ・ア・ミッション', 'ルグンドドのグラショ／マメ・ウィズ・ア・ミッション', 'https://dmwiki.net/%E3%80%8A%E3%83%AB%E3%82%B0%E3%83%B3%E3%83%89%E3%83%89%E3%81%AE%E5%A4%A7%E5%BD%B1%EF%BC%8F%E3%83%9E%E3%83%A1%E3%83%BB%E3%82%A6%E3%82%A3%E3%82%BA%E3%83%BB%E3%82%A2%E3%83%BB%E3%83%9F%E3%83%83%E3%82%B7%E3%83%A7%E3%83%B3%E3%80%8B'),
  ('ワーク騎士', 'ナイッ', 'https://dmwiki.net/%E3%80%8A%E3%83%AF%E3%83%BC%E3%82%AF%E9%A8%8E%E5%A3%AB%E3%80%8B'),
  ('ワーク騎士', 'ワークナイッ', 'https://dmwiki.net/%E3%80%8A%E3%83%AF%E3%83%BC%E3%82%AF%E9%A8%8E%E5%A3%AB%E3%80%8B'),
  ('七王を統べる者 魔王ザダン', 'セブンズ・ゲート', 'https://dmwiki.net/%E3%80%8A%E4%B8%83%E7%8E%8B%E3%82%92%E7%B5%B1%E3%81%B9%E3%82%8B%E8%80%85%20%E9%AD%94%E7%8E%8B%E3%82%B6%E3%83%80%E3%83%B3%E3%80%8B'),
  ('七王を統べる者 魔王ザダン', 'まおう', 'https://dmwiki.net/%E3%80%8A%E4%B8%83%E7%8E%8B%E3%82%92%E7%B5%B1%E3%81%B9%E3%82%8B%E8%80%85%20%E9%AD%94%E7%8E%8B%E3%82%B6%E3%83%80%E3%83%B3%E3%80%8B'),
  ('七王を統べる者 魔王ザダン', 'セブンズ・ゲート まおうザダン', 'https://dmwiki.net/%E3%80%8A%E4%B8%83%E7%8E%8B%E3%82%92%E7%B5%B1%E3%81%B9%E3%82%8B%E8%80%85%20%E9%AD%94%E7%8E%8B%E3%82%B6%E3%83%80%E3%83%B3%E3%80%8B'),
  ('光る！流れる!!ベンザマン!!!', 'ひか', 'https://dmwiki.net/%E3%80%8A%E5%85%89%E3%82%8B%EF%BC%81%E6%B5%81%E3%82%8C%E3%82%8B!!%E3%83%99%E3%83%B3%E3%82%B6%E3%83%9E%E3%83%B3!!!%E3%80%8B'),
  ('光る！流れる!!ベンザマン!!!', 'なが', 'https://dmwiki.net/%E3%80%8A%E5%85%89%E3%82%8B%EF%BC%81%E6%B5%81%E3%82%8C%E3%82%8B!!%E3%83%99%E3%83%B3%E3%82%B6%E3%83%9E%E3%83%B3!!!%E3%80%8B'),
  ('光る！流れる!!ベンザマン!!!', 'ひかる！ながれる!!ベンザマン!!!', 'https://dmwiki.net/%E3%80%8A%E5%85%89%E3%82%8B%EF%BC%81%E6%B5%81%E3%82%8C%E3%82%8B!!%E3%83%99%E3%83%B3%E3%82%B6%E3%83%9E%E3%83%B3!!!%E3%80%8B'),
  ('冥王の顎', 'バビウス・ウエルグ', 'https://dmwiki.net/%E3%80%8A%E5%86%A5%E7%8E%8B%E3%81%AE%E9%A1%8E%E3%80%8B'),
  ('冥運逆夢 ハミデスナスカ', 'めいうんさかむ', 'https://dmwiki.net/%E3%80%8A%E5%86%A5%E9%81%8B%E9%80%86%E5%A4%A2%20%E3%83%8F%E3%83%9F%E3%83%87%E3%82%B9%E3%83%8A%E3%82%B9%E3%82%AB%E3%80%8B'),
  ('冥運逆夢 ハミデスナスカ', 'めいうんさかむ ハミデスナスカ', 'https://dmwiki.net/%E3%80%8A%E5%86%A5%E9%81%8B%E9%80%86%E5%A4%A2%20%E3%83%8F%E3%83%9F%E3%83%87%E3%82%B9%E3%83%8A%E3%82%B9%E3%82%AB%E3%80%8B'),
  ('凄虫逆夢 ボイノ・ブサント', 'せいちゅうさかむ', 'https://dmwiki.net/%E3%80%8A%E5%87%84%E8%99%AB%E9%80%86%E5%A4%A2%20%E3%83%9C%E3%82%A4%E3%83%8E%E3%83%BB%E3%83%96%E3%82%B5%E3%83%B3%E3%83%88%E3%80%8B'),
  ('凄虫逆夢 ボイノ・ブサント', 'せいちゅうさかむ ボイノ・ブサント', 'https://dmwiki.net/%E3%80%8A%E5%87%84%E8%99%AB%E9%80%86%E5%A4%A2%20%E3%83%9C%E3%82%A4%E3%83%8E%E3%83%BB%E3%83%96%E3%82%B5%E3%83%B3%E3%83%88%E3%80%8B'),
  ('勝敵逆夢王 モウジャキンガ', 'ジョーデキ', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E6%95%B5%E9%80%86%E5%A4%A2%E7%8E%8B%20%E3%83%A2%E3%82%A6%E3%82%B8%E3%83%A3%E3%82%AD%E3%83%B3%E3%82%AC%E3%80%8B'),
  ('勝敵逆夢王 モウジャキンガ', 'さかむおう', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E6%95%B5%E9%80%86%E5%A4%A2%E7%8E%8B%20%E3%83%A2%E3%82%A6%E3%82%B8%E3%83%A3%E3%82%AD%E3%83%B3%E3%82%AC%E3%80%8B'),
  ('勝敵逆夢王 モウジャキンガ', 'ジョーデキさかむおう モウジャキンガ', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E6%95%B5%E9%80%86%E5%A4%A2%E7%8E%8B%20%E3%83%A2%E3%82%A6%E3%82%B8%E3%83%A3%E3%82%AD%E3%83%B3%E3%82%AC%E3%80%8B'),
  ('勝次逆夢 スコラッシュ“覇嵐”', 'しょうじさかむ', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E6%AC%A1%E9%80%86%E5%A4%A2%20%E3%82%B9%E3%82%B3%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E2%80%9C%E8%A6%87%E5%B5%90%E2%80%9D%E3%80%8B'),
  ('勝次逆夢 スコラッシュ“覇嵐”', 'ヘーラー', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E6%AC%A1%E9%80%86%E5%A4%A2%20%E3%82%B9%E3%82%B3%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E2%80%9C%E8%A6%87%E5%B5%90%E2%80%9D%E3%80%8B'),
  ('勝次逆夢 スコラッシュ“覇嵐”', 'しょうじさかむ スコラッシュ“ヘーラー”', 'https://dmwiki.net/%E3%80%8A%E5%8B%9D%E6%AC%A1%E9%80%86%E5%A4%A2%20%E3%82%B9%E3%82%B3%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E2%80%9C%E8%A6%87%E5%B5%90%E2%80%9D%E3%80%8B'),
  ('天地命動 バラギアラ / 輪廻虹災', 'てんちめいどう', 'https://dmwiki.net/%E3%80%8A%E5%A4%A9%E5%9C%B0%E5%91%BD%E5%8B%95%20%E3%83%90%E3%83%A9%E3%82%AE%E3%82%A2%E3%83%A9%EF%BC%8F%E8%BC%AA%E5%BB%BB%E8%99%B9%E7%81%BD%E3%80%8B'),
  ('天地命動 バラギアラ / 輪廻虹災', 'りんねこうさい', 'https://dmwiki.net/%E3%80%8A%E5%A4%A9%E5%9C%B0%E5%91%BD%E5%8B%95%20%E3%83%90%E3%83%A9%E3%82%AE%E3%82%A2%E3%83%A9%EF%BC%8F%E8%BC%AA%E5%BB%BB%E8%99%B9%E7%81%BD%E3%80%8B'),
  ('天地命動 バラギアラ / 輪廻虹災', 'てんちめいどう バラギアラ／りんねこうさい', 'https://dmwiki.net/%E3%80%8A%E5%A4%A9%E5%9C%B0%E5%91%BD%E5%8B%95%20%E3%83%90%E3%83%A9%E3%82%AE%E3%82%A2%E3%83%A9%EF%BC%8F%E8%BC%AA%E5%BB%BB%E8%99%B9%E7%81%BD%E3%80%8B'),
  ('昆怪逆夢 アンダステリオン', 'こんかいさかむ', 'https://dmwiki.net/%E3%80%8A%E6%98%86%E6%80%AA%E9%80%86%E5%A4%A2%20%E3%82%A2%E3%83%B3%E3%83%80%E3%82%B9%E3%83%86%E3%83%AA%E3%82%AA%E3%83%B3%E3%80%8B'),
  ('昆怪逆夢 アンダステリオン', 'こんかいさかむ アンダステリオン', 'https://dmwiki.net/%E3%80%8A%E6%98%86%E6%80%AA%E9%80%86%E5%A4%A2%20%E3%82%A2%E3%83%B3%E3%83%80%E3%82%B9%E3%83%86%E3%83%AA%E3%82%AA%E3%83%B3%E3%80%8B'),
  ('激アツポンの助', 'げき', 'https://dmwiki.net/%E3%80%8A%E6%BF%80%E3%82%A2%E3%83%84%E3%83%9D%E3%83%B3%E3%81%AE%E5%8A%A9%E3%80%8B'),
  ('激アツポンの助', 'すけ', 'https://dmwiki.net/%E3%80%8A%E6%BF%80%E3%82%A2%E3%83%84%E3%83%9D%E3%83%B3%E3%81%AE%E5%8A%A9%E3%80%8B'),
  ('激アツポンの助', 'げきアツポンのすけ', 'https://dmwiki.net/%E3%80%8A%E6%BF%80%E3%82%A2%E3%83%84%E3%83%9D%E3%83%B3%E3%81%AE%E5%8A%A9%E3%80%8B'),
  ('煌風逆夢 サヴェスヴァーク', 'こうふうさかむ', 'https://dmwiki.net/%E3%80%8A%E7%85%8C%E9%A2%A8%E9%80%86%E5%A4%A2%20%E3%82%B5%E3%83%B4%E3%82%A7%E3%82%B9%E3%83%B4%E3%82%A1%E3%83%BC%E3%82%AF%E3%80%8B'),
  ('煌風逆夢 サヴェスヴァーク', 'こうふうさかむ サヴェスヴァーク', 'https://dmwiki.net/%E3%80%8A%E7%85%8C%E9%A2%A8%E9%80%86%E5%A4%A2%20%E3%82%B5%E3%83%B4%E3%82%A7%E3%82%B9%E3%83%B4%E3%82%A1%E3%83%BC%E3%82%AF%E3%80%8B'),
  ('蒸光逆夢 リリオクパング', 'じょうこうさかむ', 'https://dmwiki.net/%E3%80%8A%E8%92%B8%E5%85%89%E9%80%86%E5%A4%A2%20%E3%83%AA%E3%83%AA%E3%82%AA%E3%82%AF%E3%83%91%E3%83%B3%E3%82%B0%E3%80%8B'),
  ('蒸光逆夢 リリオクパング', 'じょうこうさかむ リリオクパング', 'https://dmwiki.net/%E3%80%8A%E8%92%B8%E5%85%89%E9%80%86%E5%A4%A2%20%E3%83%AA%E3%83%AA%E3%82%AA%E3%82%AF%E3%83%91%E3%83%B3%E3%82%B0%E3%80%8B'),
  ('爆龍羅王 ゴリナボルト', 'ばりらおう', 'https://dmwiki.net/%E3%80%8A%E7%88%86%E9%BE%8D%E7%BE%85%E7%8E%8B%20%E3%82%B4%E3%83%AA%E3%83%8A%E3%83%9C%E3%83%AB%E3%83%88%E3%80%8B'),
  ('爆龍羅王 ゴリナボルト', 'ばりらおう ゴリナボルト', 'https://dmwiki.net/%E3%80%8A%E7%88%86%E9%BE%8D%E7%BE%85%E7%8E%8B%20%E3%82%B4%E3%83%AA%E3%83%8A%E3%83%9C%E3%83%AB%E3%83%88%E3%80%8B'),
  ('祝え！冥帝王 ダイジュ・ディダノス', 'いわ', 'https://dmwiki.net/%E3%80%8A%E7%A5%9D%E3%81%88%EF%BC%81%E5%86%A5%E5%B8%9D%E7%8E%8B%20%E3%83%80%E3%82%A4%E3%82%B8%E3%83%A5%E3%83%BB%E3%83%87%E3%82%A3%E3%83%80%E3%83%8E%E3%82%B9%E3%80%8B'),
  ('祝え！冥帝王 ダイジュ・ディダノス', 'メテヲ', 'https://dmwiki.net/%E3%80%8A%E7%A5%9D%E3%81%88%EF%BC%81%E5%86%A5%E5%B8%9D%E7%8E%8B%20%E3%83%80%E3%82%A4%E3%82%B8%E3%83%A5%E3%83%BB%E3%83%87%E3%82%A3%E3%83%80%E3%83%8E%E3%82%B9%E3%80%8B'),
  ('祝え！冥帝王 ダイジュ・ディダノス', 'いわえ！メテヲ ダイジュ・ディダノス', 'https://dmwiki.net/%E3%80%8A%E7%A5%9D%E3%81%88%EF%BC%81%E5%86%A5%E5%B8%9D%E7%8E%8B%20%E3%83%80%E3%82%A4%E3%82%B8%E3%83%A5%E3%83%BB%E3%83%87%E3%82%A3%E3%83%80%E3%83%8E%E3%82%B9%E3%80%8B'),
  ('罰空逆夢 ブラゴチャーンド', 'ばっくうさかむ', 'https://dmwiki.net/%E3%80%8A%E7%BD%B0%E7%A9%BA%E9%80%86%E5%A4%A2%20%E3%83%96%E3%83%A9%E3%82%B4%E3%83%81%E3%83%A3%E3%83%BC%E3%83%B3%E3%83%89%E3%80%8B'),
  ('罰空逆夢 ブラゴチャーンド', 'ばっくうさかむ ブラゴチャーンド', 'https://dmwiki.net/%E3%80%8A%E7%BD%B0%E7%A9%BA%E9%80%86%E5%A4%A2%20%E3%83%96%E3%83%A9%E3%82%B4%E3%83%81%E3%83%A3%E3%83%BC%E3%83%B3%E3%83%89%E3%80%8B'),
  ('羅明逆夢 アシュノムカメイ', 'らめいさかむ', 'https://dmwiki.net/%E3%80%8A%E7%BE%85%E6%98%8E%E9%80%86%E5%A4%A2%20%E3%82%A2%E3%82%B7%E3%83%A5%E3%83%8E%E3%83%A0%E3%82%AB%E3%83%A1%E3%82%A4%E3%80%8B'),
  ('羅明逆夢 アシュノムカメイ', 'らめいさかむ アシュノムカメイ', 'https://dmwiki.net/%E3%80%8A%E7%BE%85%E6%98%8E%E9%80%86%E5%A4%A2%20%E3%82%A2%E3%82%B7%E3%83%A5%E3%83%8E%E3%83%A0%E3%82%AB%E3%83%A1%E3%82%A4%E3%80%8B'),
  ('覇王になる男 ググッピー', 'はおう', 'https://dmwiki.net/%E3%80%8A%E8%A6%87%E7%8E%8B%E3%81%AB%E3%81%AA%E3%82%8B%E7%94%B7%20%E3%82%B0%E3%82%B0%E3%83%83%E3%83%94%E3%83%BC%E3%80%8B'),
  ('覇王になる男 ググッピー', 'おとこ', 'https://dmwiki.net/%E3%80%8A%E8%A6%87%E7%8E%8B%E3%81%AB%E3%81%AA%E3%82%8B%E7%94%B7%20%E3%82%B0%E3%82%B0%E3%83%83%E3%83%94%E3%83%BC%E3%80%8B'),
  ('覇王になる男 ググッピー', 'はおうになるおとこ ググッピー', 'https://dmwiki.net/%E3%80%8A%E8%A6%87%E7%8E%8B%E3%81%AB%E3%81%AA%E3%82%8B%E7%94%B7%20%E3%82%B0%E3%82%B0%E3%83%83%E3%83%94%E3%83%BC%E3%80%8B'),
  ('鉄禍逆夢 アイングダン・オウマ武斗ン', 'てっかさかむ', 'https://dmwiki.net/%E3%80%8A%E9%89%84%E7%A6%8D%E9%80%86%E5%A4%A2%20%E3%82%A2%E3%82%A4%E3%83%B3%E3%82%B0%E3%83%80%E3%83%B3%E3%83%BB%E3%82%AA%E3%82%A6%E3%83%9E%E6%AD%A6%E6%96%97%E3%83%B3%E3%80%8B'),
  ('鉄禍逆夢 アイングダン・オウマ武斗ン', 'ぶと', 'https://dmwiki.net/%E3%80%8A%E9%89%84%E7%A6%8D%E9%80%86%E5%A4%A2%20%E3%82%A2%E3%82%A4%E3%83%B3%E3%82%B0%E3%83%80%E3%83%B3%E3%83%BB%E3%82%AA%E3%82%A6%E3%83%9E%E6%AD%A6%E6%96%97%E3%83%B3%E3%80%8B'),
  ('鉄禍逆夢 アイングダン・オウマ武斗ン', 'てっかさかむ アイングダン・オウマぶとン', 'https://dmwiki.net/%E3%80%8A%E9%89%84%E7%A6%8D%E9%80%86%E5%A4%A2%20%E3%82%A2%E3%82%A4%E3%83%B3%E3%82%B0%E3%83%80%E3%83%B3%E3%83%BB%E3%82%AA%E3%82%A6%E3%83%9E%E6%AD%A6%E6%96%97%E3%83%B3%E3%80%8B'),
  ('銃毒逆夢 ザ・ゲオニー / ジョリー・ザ・ハンド', 'じゅうどくさかむ', 'https://dmwiki.net/%E3%80%8A%E9%8A%83%E6%AF%92%E9%80%86%E5%A4%A2%20%E3%82%B6%E3%83%BB%E3%82%B2%E3%82%AA%E3%83%8B%E3%83%BC%EF%BC%8F%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%83%8F%E3%83%B3%E3%83%89%E3%80%8B'),
  ('銃毒逆夢 ザ・ゲオニー / ジョリー・ザ・ハンド', 'じゅうどくさかむ ザ・ゲオニー／ジョリー・ザ・ハンド', 'https://dmwiki.net/%E3%80%8A%E9%8A%83%E6%AF%92%E9%80%86%E5%A4%A2%20%E3%82%B6%E3%83%BB%E3%82%B2%E3%82%AA%E3%83%8B%E3%83%BC%EF%BC%8F%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%83%8F%E3%83%B3%E3%83%89%E3%80%8B'),
  ('銃蝸逆夢 ザ・デンニー / ジョリー・ザ・トラップ', 'じゅうかさかむ', 'https://dmwiki.net/%E3%80%8A%E9%8A%83%E8%9D%B8%E9%80%86%E5%A4%A2%20%E3%82%B6%E3%83%BB%E3%83%87%E3%83%B3%E3%83%8B%E3%83%BC%EF%BC%8F%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%83%88%E3%83%A9%E3%83%83%E3%83%97%E3%80%8B'),
  ('銃蝸逆夢 ザ・デンニー / ジョリー・ザ・トラップ', 'じゅうかさかむ ザ・デンニー／ジョリー・ザ・トラップ', 'https://dmwiki.net/%E3%80%8A%E9%8A%83%E8%9D%B8%E9%80%86%E5%A4%A2%20%E3%82%B6%E3%83%BB%E3%83%87%E3%83%B3%E3%83%8B%E3%83%BC%EF%BC%8F%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%83%88%E3%83%A9%E3%83%83%E3%83%97%E3%80%8B'),
  ('銃車逆夢 ザ・マグニー / ジョリー・ザ・スクラッパー', 'じゅうしゃさかむ', 'https://dmwiki.net/%E3%80%8A%E9%8A%83%E8%BB%8A%E9%80%86%E5%A4%A2%20%E3%82%B6%E3%83%BB%E3%83%9E%E3%82%B0%E3%83%8B%E3%83%BC%EF%BC%8F%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%82%B9%E3%82%AF%E3%83%A9%E3%83%83%E3%83%91%E3%83%BC%E3%80%8B'),
  ('銃車逆夢 ザ・マグニー / ジョリー・ザ・スクラッパー', 'じゅうしゃさかむ ザ・マグニー／ジョリー・ザ・スクラッパー', 'https://dmwiki.net/%E3%80%8A%E9%8A%83%E8%BB%8A%E9%80%86%E5%A4%A2%20%E3%82%B6%E3%83%BB%E3%83%9E%E3%82%B0%E3%83%8B%E3%83%BC%EF%BC%8F%E3%82%B8%E3%83%A7%E3%83%AA%E3%83%BC%E3%83%BB%E3%82%B6%E3%83%BB%E3%82%B9%E3%82%AF%E3%83%A9%E3%83%83%E3%83%91%E3%83%BC%E3%80%8B'),
  ('雷星逆夢 ヴァリ-我-ラウザス', 'らいせいさかむ', 'https://dmwiki.net/%E3%80%8A%E9%9B%B7%E6%98%9F%E9%80%86%E5%A4%A2%20%E3%83%B4%E3%82%A1%E3%83%AA-%E6%88%91-%E3%83%A9%E3%82%A6%E3%82%B6%E3%82%B9%E3%80%8B'),
  ('雷星逆夢 ヴァリ-我-ラウザス', 'ガ', 'https://dmwiki.net/%E3%80%8A%E9%9B%B7%E6%98%9F%E9%80%86%E5%A4%A2%20%E3%83%B4%E3%82%A1%E3%83%AA-%E6%88%91-%E3%83%A9%E3%82%A6%E3%82%B6%E3%82%B9%E3%80%8B'),
  ('雷星逆夢 ヴァリ-我-ラウザス', 'らいせいさかむ ヴァリ-ガ-ラウザス', 'https://dmwiki.net/%E3%80%8A%E9%9B%B7%E6%98%9F%E9%80%86%E5%A4%A2%20%E3%83%B4%E3%82%A1%E3%83%AA-%E6%88%91-%E3%83%A9%E3%82%A6%E3%82%B6%E3%82%B9%E3%80%8B'),
  ('黎悪銃と邪煉哀の決断', 'パーフェクト・ロマンス', 'https://dmwiki.net/%E3%80%8A%E9%BB%8E%E6%82%AA%E9%8A%83%E3%81%A8%E9%82%AA%E7%85%89%E5%93%80%E3%81%AE%E6%B1%BA%E6%96%AD%E3%80%8B'),
  ('Q字工事', 'キューじこうじ', 'https://dmwiki.net/%E3%80%8AQ%E5%AD%97%E5%B7%A5%E4%BA%8B%E3%80%8B'),
  ('ア・ストラ・ゼーレの電影', 'スクショ', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%83%BB%E3%82%B9%E3%83%88%E3%83%A9%E3%83%BB%E3%82%BC%E3%83%BC%E3%83%AC%E3%81%AE%E9%9B%BB%E5%BD%B1%E3%80%8B'),
  ('ア・ストラ・ゼーレの電影', 'ア・ストラ・ゼーレのスクショ', 'https://dmwiki.net/%E3%80%8A%E3%82%A2%E3%83%BB%E3%82%B9%E3%83%88%E3%83%A9%E3%83%BB%E3%82%BC%E3%83%BC%E3%83%AC%E3%81%AE%E9%9B%BB%E5%BD%B1%E3%80%8B'),
  ('歓扉逆夢 バイギャラドスツ', 'かんひさかむ', 'https://dmwiki.net/%E3%80%8A%E6%AD%93%E6%89%89%E9%80%86%E5%A4%A2%20%E3%83%90%E3%82%A4%E3%82%AE%E3%83%A3%E3%83%A9%E3%83%89%E3%82%B9%E3%83%84%E3%80%8B'),
  ('歓扉逆夢 バイギャラドスツ', 'かんひさかむ バイギャラドスツ', 'https://dmwiki.net/%E3%80%8A%E6%AD%93%E6%89%89%E9%80%86%E5%A4%A2%20%E3%83%90%E3%82%A4%E3%82%AE%E3%83%A3%E3%83%A9%E3%83%89%E3%82%B9%E3%83%84%E3%80%8B'),
  ('真・メシアカリバー', 'シン', 'https://dmwiki.net/%E3%80%8A%E7%9C%9F%E3%83%BB%E3%83%A1%E3%82%B7%E3%82%A2%E3%82%AB%E3%83%AA%E3%83%90%E3%83%BC%E3%80%8B'),
  ('真・メシアカリバー', 'シン・メシアカリバー', 'https://dmwiki.net/%E3%80%8A%E7%9C%9F%E3%83%BB%E3%83%A1%E3%82%B7%E3%82%A2%E3%82%AB%E3%83%AA%E3%83%90%E3%83%BC%E3%80%8B'),
  ('祝の瞬き 流終', 'いわい', 'https://dmwiki.net/%E3%80%8A%E7%A5%9D%E3%81%AE%E7%9E%AC%E3%81%8D%20%E6%B5%81%E7%B5%82%E3%80%8B'),
  ('祝の瞬き 流終', 'またた', 'https://dmwiki.net/%E3%80%8A%E7%A5%9D%E3%81%AE%E7%9E%AC%E3%81%8D%20%E6%B5%81%E7%B5%82%E3%80%8B'),
  ('祝の瞬き 流終', 'るゔぉわ', 'https://dmwiki.net/%E3%80%8A%E7%A5%9D%E3%81%AE%E7%9E%AC%E3%81%8D%20%E6%B5%81%E7%B5%82%E3%80%8B'),
  ('祝の瞬き 流終', 'いわいのまたたき るゔぉわ', 'https://dmwiki.net/%E3%80%8A%E7%A5%9D%E3%81%AE%E7%9E%AC%E3%81%8D%20%E6%B5%81%E7%B5%82%E3%80%8B'),
  ('緑王双命三速斧', 'バラシュ・ハ・ラ・ハマーラー', 'https://dmwiki.net/%E3%80%8A%E7%B7%91%E7%8E%8B%E5%8F%8C%E5%91%BD%E4%B8%89%E9%80%9F%E6%96%A7%E3%80%8B'),
  ('邪桃臨界怒刀脚', 'じゃ', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E6%A1%83%E8%87%A8%E7%95%8C%E6%80%92%E5%88%80%E8%84%9A%E3%80%8B'),
  ('邪桃臨界怒刀脚', 'とう', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E6%A1%83%E8%87%A8%E7%95%8C%E6%80%92%E5%88%80%E8%84%9A%E3%80%8B'),
  ('邪桃臨界怒刀脚', 'りん', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E6%A1%83%E8%87%A8%E7%95%8C%E6%80%92%E5%88%80%E8%84%9A%E3%80%8B'),
  ('邪桃臨界怒刀脚', 'かい', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E6%A1%83%E8%87%A8%E7%95%8C%E6%80%92%E5%88%80%E8%84%9A%E3%80%8B'),
  ('邪桃臨界怒刀脚', 'ど', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E6%A1%83%E8%87%A8%E7%95%8C%E6%80%92%E5%88%80%E8%84%9A%E3%80%8B'),
  ('邪桃臨界怒刀脚', 'きゃく', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E6%A1%83%E8%87%A8%E7%95%8C%E6%80%92%E5%88%80%E8%84%9A%E3%80%8B'),
  ('邪桃臨界怒刀脚', 'じゃとうりんかいどとうきゃく', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E6%A1%83%E8%87%A8%E7%95%8C%E6%80%92%E5%88%80%E8%84%9A%E3%80%8B'),
  ('闘帝合体 サンダイテイオー', 'ド', 'https://dmwiki.net/%E3%80%8A%E9%97%98%E5%B8%9D%E5%90%88%E4%BD%93%20%E3%82%B5%E3%83%B3%E3%83%80%E3%82%A4%E3%83%86%E3%82%A4%E3%82%AA%E3%83%BC%E3%80%8B'),
  ('闘帝合体 サンダイテイオー', 'デ', 'https://dmwiki.net/%E3%80%8A%E9%97%98%E5%B8%9D%E5%90%88%E4%BD%93%20%E3%82%B5%E3%83%B3%E3%83%80%E3%82%A4%E3%83%86%E3%82%A4%E3%82%AA%E3%83%BC%E3%80%8B'),
  ('闘帝合体 サンダイテイオー', 'ガッタイ', 'https://dmwiki.net/%E3%80%8A%E9%97%98%E5%B8%9D%E5%90%88%E4%BD%93%20%E3%82%B5%E3%83%B3%E3%83%80%E3%82%A4%E3%83%86%E3%82%A4%E3%82%AA%E3%83%BC%E3%80%8B'),
  ('闘帝合体 サンダイテイオー', 'ドデガッタイ サンダイテイオー', 'https://dmwiki.net/%E3%80%8A%E9%97%98%E5%B8%9D%E5%90%88%E4%BD%93%20%E3%82%B5%E3%83%B3%E3%83%80%E3%82%A4%E3%83%86%E3%82%A4%E3%82%AA%E3%83%BC%E3%80%8B'),
  ('龍装医 スティーツ', 'りゅうそうい', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E5%8C%BB%20%E3%82%B9%E3%83%86%E3%82%A3%E3%83%BC%E3%83%84%E3%80%8B'),
  ('龍装医 スティーツ', 'りゅうそうい スティーツ', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E5%8C%BB%20%E3%82%B9%E3%83%86%E3%82%A3%E3%83%BC%E3%83%84%E3%80%8B'),
  ('龍装者 クシュトル', 'りゅうそうしゃ', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%82%AF%E3%82%B7%E3%83%A5%E3%83%88%E3%83%AB%E3%80%8B'),
  ('龍装者 クシュトル', 'りゅうそうしゃ クシュトル', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%82%AF%E3%82%B7%E3%83%A5%E3%83%88%E3%83%AB%E3%80%8B'),
  ('龍装者 ドヘブン', 'りゅうそうしゃ', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%83%89%E3%83%98%E3%83%96%E3%83%B3%E3%80%8B'),
  ('龍装者 ドヘブン', 'りゅうそうしゃ ドヘブン', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%83%89%E3%83%98%E3%83%96%E3%83%B3%E3%80%8B'),
  ('龍装者 プロチュリス / 「主役を目指すッス！」', 'りゅうそうしゃ', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%83%97%E3%83%AD%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%EF%BC%8F%E3%80%8C%E4%B8%BB%E5%BD%B9%E3%82%92%E7%9B%AE%E6%8C%87%E3%81%99%E3%83%83%E3%82%B9%EF%BC%81%E3%80%8D%E3%80%8B'),
  ('龍装者 プロチュリス / 「主役を目指すッス！」', 'しゅやく', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%83%97%E3%83%AD%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%EF%BC%8F%E3%80%8C%E4%B8%BB%E5%BD%B9%E3%82%92%E7%9B%AE%E6%8C%87%E3%81%99%E3%83%83%E3%82%B9%EF%BC%81%E3%80%8D%E3%80%8B'),
  ('龍装者 プロチュリス / 「主役を目指すッス！」', 'めざ', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%83%97%E3%83%AD%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%EF%BC%8F%E3%80%8C%E4%B8%BB%E5%BD%B9%E3%82%92%E7%9B%AE%E6%8C%87%E3%81%99%E3%83%83%E3%82%B9%EF%BC%81%E3%80%8D%E3%80%8B'),
  ('龍装者 プロチュリス / 「主役を目指すッス！」', 'りゅうそうしゃ プロチュリス／「しゅやくをめざすッス！」', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%80%85%20%E3%83%97%E3%83%AD%E3%83%81%E3%83%A5%E3%83%AA%E3%82%B9%EF%BC%8F%E3%80%8C%E4%B8%BB%E5%BD%B9%E3%82%92%E7%9B%AE%E6%8C%87%E3%81%99%E3%83%83%E3%82%B9%EF%BC%81%E3%80%8D%E3%80%8B'),
  ('龍装車 ギギャイア', 'りゅうそうしゃ', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%BB%8A%20%E3%82%AE%E3%82%AE%E3%83%A3%E3%82%A4%E3%82%A2%E3%80%8B'),
  ('龍装車 ギギャイア', 'りゅうそうしゃ ギギャイア', 'https://dmwiki.net/%E3%80%8A%E9%BE%8D%E8%A3%85%E8%BB%8A%20%E3%82%AE%E3%82%AE%E3%83%A3%E3%82%A4%E3%82%A2%E3%80%8B');
create temporary table original01_investigation_reading_source (
  canonical_card_id bigint not null,
  card_name text not null,
  reading text not null,
  source_url text not null
) on commit drop;
insert into original01_investigation_reading_source(canonical_card_id, card_name, reading, source_url) values
  (155, '頂上混成 ガリュディアス・モモミーズ’22', 'ちょうじょうこんせい ガリュディアス・モモミーズトゥエンティツー', 'https://dmwiki.net/%E3%80%8A%E9%A0%82%E4%B8%8A%E6%B7%B7%E6%88%90%2B%E3%82%AC%E3%83%AA%E3%83%A5%E3%83%87%E3%82%A3%E3%82%A2%E3%82%B9%E3%83%BB%E3%83%A2%E3%83%A2%E3%83%9F%E3%83%BC%E3%82%BA%2722%E3%80%8B'),
  (483, '王来英雄 モモキングRX', 'オーライヒーロー モモキングレックス', 'https://dmwiki.net/%E3%80%8A%E7%8E%8B%E6%9D%A5%E8%8B%B1%E9%9B%84%20%E3%83%A2%E3%83%A2%E3%82%AD%E3%83%B3%E3%82%B0RX%E3%80%8B'),
  (804, 'BARUGA-雷座87', 'バルガ-ライザーエイトセブン', 'https://dmwiki.net/%E3%80%8ABARUGA-%E9%9B%B7%E5%BA%A787%E3%80%8B'),
  (835, 'ブランド ＜NEXT.Star＞', 'ブランド ＜ネクスト.スター＞', 'https://dmwiki.net/%E3%80%8A%E3%83%96%E3%83%A9%E3%83%B3%E3%83%89%20%EF%BC%9CNEXT.Star%EF%BC%9E%E3%80%8B'),
  (3128, 'クイーン&かぼちゃうちゃう', 'クイーンアンドかぼちゃうちゃう', 'https://dmwiki.net/%E3%80%8A%E3%82%AF%E3%82%A4%E3%83%BC%E3%83%B3%EF%BC%86%E3%81%8B%E3%81%BC%E3%81%A1%E3%82%83%E3%81%86%E3%81%A1%E3%82%83%E3%81%86%E3%80%8B'),
  (5006, '霊宝 ヒャクメ-４', 'れいほう ヒャクメ-フォー', 'https://dmwiki.net/%E3%80%8A%E9%9C%8A%E5%AE%9D%2B%E3%83%92%E3%83%A3%E3%82%AF%E3%83%A1-4%E3%80%8B'),
  (5175, 'ディスタス・ゲート', 'ディスタス・ゲート', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T006'),
  (6248, 'キング・マニフェスト', 'キング・マニフェスト', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TD002'),
  (7080, 'サッヴァークDG', 'サッヴァークディージー', 'https://dmwiki.net/%E3%80%8A%E3%82%B5%E3%83%83%E3%83%B4%E3%82%A1%E3%83%BC%E3%82%AFDG%E3%80%8B'),
  (7137, '禁時混成王 ドキンダンテXXII', 'きんじこんせいおう ドキンダンテトゥエンティツー', 'https://dmwiki.net/%E3%80%8A%E7%A6%81%E6%99%82%E6%B7%B7%E6%88%90%E7%8E%8B%20%E3%83%89%E3%82%AD%E3%83%B3%E3%83%80%E3%83%B3%E3%83%86XXII%E3%80%8B'),
  (7933, 'ダムダム・ジョーカーズ', 'ダムダム・ジョーカーズ', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T009'),
  (9592, 'ニクジール・ブッシャー', 'ニクジール・ブッシャー', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR009'),
  (43687, 'Dr.富士山ッピング', 'ドクター.フジヤマッピング', 'https://dmwiki.net/%E3%80%8ADr.%E5%AF%8C%E5%A3%AB%E5%B1%B1%E3%83%83%E3%83%94%E3%83%B3%E3%82%B0%E3%80%8B'),
  (43688, 'SUPREME-GUN・ザ・ジョニー', 'スプリガン・ザ・ジョニー', 'https://dmwiki.net/%E3%80%8ASUPREME-GUN%E3%83%BB%E3%82%B6%E3%83%BB%E3%82%B8%E3%83%A7%E3%83%8B%E3%83%BC%E3%80%8B'),
  (43689, '∑龍', 'ウィンロン', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC001'),
  (43696, 'ケツカッちん', 'ケツカッちん', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-041'),
  (43698, 'コクーン・ツェッペリン', 'コクーン・ツェッペリン', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-021'),
  (43699, 'ザエッサの海影 / 六奇怪の無 ～氾濫する覇王～', 'ザエッサのムーショ／ろくきかいのむ ～はんらんするはおう～', 'https://www.m.dmwiki.net/%E3%80%8A%E3%82%B6%E3%82%A8%E3%83%83%E3%82%B5%E3%81%AE%E6%B5%B7%E5%BD%B1%EF%BC%8F%E5%85%AD%E5%A5%87%E6%80%AA%E3%81%AE%E7%84%A1%2B%E3%80%9C%E6%B0%BE%E6%BF%AB%E3%81%99%E3%82%8B%E8%A6%87%E7%8E%8B%E3%80%9C%E3%80%8B'),
  (43701, 'スイドー・ド・デショー', 'スイドー・ド・デショー', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-033'),
  (43703, 'ツミタテンカーネン', 'ツミタテンカーネン', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-065'),
  (43707, 'にやにYAH', 'にやにヤー', 'https://dmwiki.net/%E3%80%8A%E3%81%AB%E3%82%84%E3%81%ABYAH%E3%80%8B'),
  (43708, 'ノヴァルチャ・ハレイズ', 'ノヴァルチャ・ハレイズ', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-014'),
  (43710, 'ヒトリダチ キャンベロ', 'ヒトリダチ キャンベロ', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-030'),
  (43711, 'ヒトリダチ ケントナーク', 'ヒトリダチ ケントナーク', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-001'),
  (43712, 'ヒトリダチ モンキッド', 'ヒトリダチ モンキッド', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-055'),
  (43713, 'ヒミッツキッチ・グローブ', 'ヒミッツキッチ・グローブ', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-052'),
  (43714, 'ホッタレマン', 'ホッタレマン', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-074'),
  (43715, 'ミノガミ&オウ禍武斗 / T.２.D.', 'ミノガミアンドオウカブト／トラップ.ツー.ダウン.', 'https://www.m.dmwiki.net/%E3%80%8A%E3%83%9F%E3%83%8E%E3%82%AC%E3%83%9F%EF%BC%86%E3%82%AA%E3%82%A6%E7%A6%8D%E6%AD%A6%E6%96%97%EF%BC%8FT.2.D.%E3%80%8B'),
  (43716, 'メモッタルド・デカスギオ / メモメモ・ジョーカーズ', 'メモッタルド・デカスギオ／メモメモ・ジョーカーズ', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-045'),
  (43728, '大地 コンダマ-2', 'だいち コンダマ-ツー', 'https://dmwiki.net/%E3%80%8A%E5%A4%A7%E5%9C%B0%20%E3%82%B3%E3%83%B3%E3%83%80%E3%83%9E-2%E3%80%8B'),
  (43729, '大地 ワタン-2', 'だいち ワタン-ツー', 'https://dmwiki.net/%E3%80%8A%E5%A4%A7%E5%9C%B0%20%E3%83%AF%E3%82%BF%E3%83%B3-2%E3%80%8B'),
  (43733, '妖精 キユリ-2', 'ようせい キユリ-ツー', 'https://dmwiki.net/%E3%80%8A%E5%A6%96%E7%B2%BE%20%E3%82%AD%E3%83%A6%E3%83%AA-2%E3%80%8B'),
  (43740, '爆衆 ランブル-2', 'ばくしゅう ランブル-ツー', 'https://dmwiki.net/%E3%80%8A%E7%88%86%E8%A1%86%20%E3%83%A9%E3%83%B3%E3%83%96%E3%83%AB-2%E3%80%8B'),
  (43747, '翔天 スケプ-3', 'しょうてん スケプ-スリー', 'https://dmwiki.net/%E3%80%8A%E7%BF%94%E5%A4%A9%20%E3%82%B9%E3%82%B1%E3%83%97-3%E3%80%8B'),
  (43750, '輝晶 エヴァ-3', 'きしょう エヴァ-スリー', 'https://dmwiki.net/%E3%80%8A%E8%BC%9D%E6%99%B6%20%E3%82%A8%E3%83%B4%E3%82%A1-3%E3%80%8B'),
  (43751, '邪鬼 コオニ-4', 'じゃき コオニ-フォー', 'https://dmwiki.net/%E3%80%8A%E9%82%AA%E9%AC%BC%20%E3%82%B3%E3%82%AA%E3%83%8B-4%E3%80%8B'),
  (43758, '闇影 ヘモグロ-2', 'あんえい ヘモグロ-ツー', 'https://dmwiki.net/%E3%80%8A%E9%97%87%E5%BD%B1%20%E3%83%98%E3%83%A2%E3%82%B0%E3%83%AD-2%E3%80%8B'),
  (43761, '魔具 ヴァイポイズ-4', 'まぐ ヴァイポイズ-フォー', 'https://dmwiki.net/%E3%80%8A%E9%AD%94%E5%85%B7%20%E3%83%B4%E3%82%A1%E3%82%A4%E3%83%9D%E3%82%A4%E3%82%BA-4%E3%80%8B'),
  (43866, '“↑↑”ブランド', 'アゲアゲ ブランド', 'https://dmwiki.net/%E3%80%8A%E2%80%9C%E2%86%91%E2%86%91%E2%80%9D%E3%83%96%E3%83%A9%E3%83%B3%E3%83%89%E3%80%8B'),
  (43867, '×マドギワ親父', 'バッテンマドギワおやじ', 'https://dmwiki.net/%E3%80%8A%C3%97%E3%83%9E%E3%83%89%E3%82%AE%E3%83%AF%E8%A6%AA%E7%88%B6%E3%80%8B'),
  (43869, 'SMANAGER', 'スマネージャー', 'https://dmwiki.net/%E3%80%8ASMANAGER%E3%80%8B'),
  (43870, 'The 淡口ラー漢 極', 'ザ うすくちラーメン きわみ', 'https://dmwiki.net/%E3%80%8AThe%20%E6%B7%A1%E5%8F%A3%E3%83%A9%E3%83%BC%E6%BC%A2%20%E6%A5%B5%E3%80%8B'),
  (43872, 'キング・ザ・ベスト', 'キング・ザ・ベスト', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-018'),
  (43873, 'ツーキンカイソッQ', 'ツーキンカイソッキュー', 'https://dmwiki.net/%E3%80%8A%E3%83%84%E3%83%BC%E3%82%AD%E3%83%B3%E3%82%AB%E3%82%A4%E3%82%BD%E3%83%83Q%E3%80%8B'),
  (43874, 'どうだいジンセー', 'どうだいジンセー', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-070'),
  (43875, 'バイナラベーター', 'バイナラベーター', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-062'),
  (43876, 'ビーチボーイズ・Ⅱ・メン', 'ビーチボーイズ・トゥ・メン', 'https://dmwiki.net/%E3%80%8A%E3%83%93%E3%83%BC%E3%83%81%E3%83%9C%E3%83%BC%E3%82%A4%E3%82%BA%E3%83%BBII%E3%83%BB%E3%83%A1%E3%83%B3%E3%80%8B'),
  (43878, '爆衆 マキシ-2', 'ばくしゅう マキシ-ツー', 'https://dmwiki.net/%E3%80%8A%E7%88%86%E8%A1%86%20%E3%83%9E%E3%82%AD%E3%82%B7-2%E3%80%8B'),
  (43882, '輝晶 シンプ-2', 'きしょう シンプ-ツー', 'https://dmwiki.net/%E3%80%8A%E8%BC%9D%E6%99%B6%20%E3%82%B7%E3%83%B3%E3%83%97-2%E3%80%8B'),
  (43883, '輝晶 マルハヴ-2', 'きしょう マルハヴ-ツー', 'https://dmwiki.net/%E3%80%8A%E8%BC%9D%E6%99%B6%20%E3%83%9E%E3%83%AB%E3%83%8F%E3%83%B4-2%E3%80%8B'),
  (43693, 'キング∞エンペラー', 'キングエンペラー', 'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S008'),
  (43753, '銃初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク', 'じゅうしょさかむ ザ・ウィニー／ジョリー・ザ・スパーク', 'https://dm.takaratomy.co.jp/wp-content/card/cardimage/dm26rp3-028a.jpg');
do $$
begin
  if (select count(*) from original01_investigation_reading_source) <> 52
    or (select count(distinct canonical_card_id) from original01_investigation_reading_source) <> 52
  then
    raise exception 'DM26-RP3 investigated reading source count mismatch';
  end if;
  if exists (
    select 1
    from original01_investigation_reading_source as source
    where not exists (
      select 1
      from public.canonical_cards as cards
      join public.tcg_games as games on games.id = cards.game_id
      where cards.id = source.canonical_card_id
        and cards.name = source.card_name
        and cards.deleted_at is null
        and games.slug = 'duel-masters'
    )
  ) then
    raise exception 'DM26-RP3 investigated reading canonical mapping mismatch';
  end if;
end;
$$;
insert into original01_reading_source(card_name, reading, source_url)
select card_name, reading, source_url
from original01_investigation_reading_source;
insert into public.card_search_terms(
  canonical_card_id, term, normalized_term, term_kind, source, verified, priority
)
select distinct on (cards.id, public.normalize_card_search(source.reading))
  cards.id,
  source.reading,
  public.normalize_card_search(source.reading),
  'alias_reading',
  'original01',
  false,
  20
from original01_reading_source as source
join public.tcg_games as games on games.slug = 'duel-masters'
join public.canonical_cards as cards
  on cards.game_id = games.id
 and cards.name = source.card_name
 and cards.deleted_at is null
where public.normalize_card_search(source.reading) <> ''
  and not exists (
    select 1
    from public.card_search_terms as existing
    where existing.canonical_card_id = cards.id
      and existing.normalized_term = public.normalize_card_search(source.reading)
  )
order by cards.id, public.normalize_card_search(source.reading), source.reading
on conflict (canonical_card_id, normalized_term, term_kind) do nothing;
-- Keep the user-confirmed reading explicit even though search normalization
-- also removes the infinity symbol from the official card-name term.
insert into public.card_search_terms(
  canonical_card_id, term, normalized_term, term_kind, source, verified, priority
)
select
  source.canonical_card_id,
  source.reading,
  public.normalize_card_search(source.reading),
  'alias_reading',
  'original01',
  false,
  20
from original01_investigation_reading_source as source
where source.canonical_card_id = 43693
  and not exists (
    select 1
    from public.card_search_terms as existing
    where existing.canonical_card_id = source.canonical_card_id
      and existing.term_kind = 'alias_reading'
      and existing.normalized_term = public.normalize_card_search(source.reading)
  )
on conflict (canonical_card_id, normalized_term, term_kind) do nothing;
commit;
