begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dm26rp3-official-sync-20260919', 0));
create temporary table official_source (
  official_card_id text primary key, name text not null, card_number text not null,
  cost smallint, civilizations text[] not null, card_types text[] not null, official_url text not null
) on commit drop;
insert into official_source values
('dm26rp3-001','ヒトリダチ ケントナーク','DM26RP3 1/77',4,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-001'),
('dm26rp3-002','七王を統べる者 魔王ザダン','DM26RP3 2/77',13,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-002'),
('dm26rp3-003','ドラマチック息子','DM26RP3 3/77',4,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-003'),
('dm26rp3-004','ミノガミ&オウ禍武斗 / T.２.D.','DM26RP3 4/77',9,array['nature']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-004'),
('dm26rp3-005','蒸光逆夢 リリオクパング','DM26RP3 5/77',8,array['light','water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-005'),
('dm26rp3-006','煌風逆夢 サヴェスヴァーク','DM26RP3 6/77',9,array['light','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-006'),
('dm26rp3-007','歓扉逆夢 バイギャラドスツ','DM26RP3 7/77',7,array['water','darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-007'),
('dm26rp3-008','勝次逆夢 スコラッシュ“覇嵐”','DM26RP3 8/77',11,array['water','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-008'),
('dm26rp3-009','羅明逆夢 アシュノムカメイ','DM26RP3 9/77',7,array['darkness','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-009'),
('dm26rp3-010','鉄禍逆夢 アイングダン・オウマ武斗ン','DM26RP3 10/77',8,array['fire','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-010'),
('dm26rp3-011','黎悪銃と邪煉哀の決断','DM26RP3 11/77',9,array['light','darkness','nature']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-011'),
('dm26rp3-012','激アツポンの助','DM26RP3 12/77',1,array['zero']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-012'),
('dm26rp3-013','にやにYAH','DM26RP3 13/77',6,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-013'),
('dm26rp3-014','ノヴァルチャ・ハレイズ','DM26RP3 14/77',4,array['light']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-014'),
('dm26rp3-015','裏魔導書グリモア-Ⅰ章','DM26RP3 15/77',4,array['water']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-015'),
('dm26rp3-016','ゲラッチョ重役 / 「ミーのチョーおすすめゲラ！」','DM26RP3 16/77',6,array['darkness']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-016'),
('dm26rp3-017','冥王の顎','DM26RP3 17/77',4,array['darkness']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-017'),
('dm26rp3-018','キング・ザ・ベスト','DM26RP3 18/77',7,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-018'),
('dm26rp3-019','ドドンガ轟キャイエス','DM26RP3 19/77',5,array['fire']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-019'),
('dm26rp3-020','大地 コンダマ-2','DM26RP3 20/77',3,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-020'),
('dm26rp3-021','コクーン・ツェッペリン','DM26RP3 21/77',3,array['nature']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-021'),
('dm26rp3-022','輝晶 エヴァ-3','DM26RP3 22/77',3,array['light','water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-022'),
('dm26rp3-023','冥運逆夢 ハミデスナスカ','DM26RP3 23/77',6,array['light','darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-023'),
('dm26rp3-024','雷星逆夢 ヴァリ-我-ラウザス','DM26RP3 24/77',6,array['light','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-024'),
('dm26rp3-025','魔具 ヴァイポイズ-4','DM26RP3 25/77',5,array['water','darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-025'),
('dm26rp3-026','昆怪逆夢 アンダステリオン','DM26RP3 26/77',7,array['darkness','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-026'),
('dm26rp3-027','罰空逆夢 ブラゴチャーンド','DM26RP3 27/77',7,array['fire','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-027'),
('dm26rp3-028','鉄初逆夢 ザ・ウィニー / ジョリー・ザ・スパーク','DM26RP3 28/77',5,array['light']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-028'),
('dm26rp3-029','輝晶 シンプ-2','DM26RP3 29/77',3,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-029'),
('dm26rp3-030','ヒトリダチ キャンベロ','DM26RP3 30/77',2,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-030'),
('dm26rp3-031','輝晶 マルハヴ-2','DM26RP3 31/77',2,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-031'),
('dm26rp3-032','銃宮逆夢 ザ・ネオニー / ジョリー・ザ・ブレイン','DM26RP3 32/77',5,array['water']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-032'),
('dm26rp3-033','スイドー・ド・デショー','DM26RP3 33/77',4,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-033'),
('dm26rp3-034','The 淡口ラー漢 極','DM26RP3 34/77',3,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-034'),
('dm26rp3-035','アアルカイトの電影','DM26RP3 35/77',3,array['water']::text[],array['タマシード']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-035'),
('dm26rp3-036','銃毒逆夢 ザ・ゲオニー / ジョリー・ザ・ハンド','DM26RP3 36/77',5,array['darkness']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-036'),
('dm26rp3-037','ワーク騎士','DM26RP3 37/77',4,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-037'),
('dm26rp3-038','×マドギワ親父','DM26RP3 38/77',3,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-038'),
('dm26rp3-039','闇影 ヘモグロ-2','DM26RP3 39/77',3,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-039'),
('dm26rp3-040','ア・ストラ・ゼーレの電影','DM26RP3 40/77',3,array['darkness']::text[],array['タマシード']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-040'),
('dm26rp3-041','ケツカッちん','DM26RP3 41/77',6,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-041'),
('dm26rp3-042','銃車逆夢 ザ・マグニー / ジョリー・ザ・スクラッパー','DM26RP3 42/77',5,array['fire']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-042'),
('dm26rp3-043','爆衆 ランブル-2','DM26RP3 43/77',3,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-043'),
('dm26rp3-044','爆衆 マキシ-2','DM26RP3 44/77',2,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-044'),
('dm26rp3-045','メモッタルド・デカスギオ / メモメモ・ジョーカーズ','DM26RP3 45/77',6,array['nature']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-045'),
('dm26rp3-046','銃蝸逆夢 ザ・デンニー / ジョリー・ザ・トラップ','DM26RP3 46/77',5,array['nature']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-046'),
('dm26rp3-047','Q字工事','DM26RP3 47/77',3,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-047'),
('dm26rp3-048','凄虫逆夢 ボイノ・ブサント','DM26RP3 48/77',5,array['light','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-048'),
('dm26rp3-049','翔天 スケプ-3','DM26RP3 49/77',4,array['water','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-049'),
('dm26rp3-050','妖精 キユリ-2','DM26RP3 50/77',3,array['water','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-050'),
('dm26rp3-051','邪鬼 コオニ-4','DM26RP3 51/77',2,array['darkness','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-051'),
('dm26rp3-052','ヒミッツキッチ・グローブ','DM26RP3 52/77',3,array['darkness','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-052'),
('dm26rp3-053','祝の瞬き 流終','DM26RP3 53/77',6,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-053'),
('dm26rp3-054','真・メシアカリバー','DM26RP3 54/77',5,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-054'),
('dm26rp3-055','ヒトリダチ モンキッド','DM26RP3 55/77',4,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-055'),
('dm26rp3-056','龍装者 クシュトル','DM26RP3 56/77',3,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-056'),
('dm26rp3-057','クリスタの輝影 / シディアン・ニーラム','DM26RP3 57/77',2,array['light']::text[],array['タマシード','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-057'),
('dm26rp3-058','龍装者 ドヘブン','DM26RP3 58/77',5,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-058'),
('dm26rp3-059','覇王になる男 ググッピー','DM26RP3 59/77',5,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-059'),
('dm26rp3-060','ビーチボーイズ・Ⅱ・メン','DM26RP3 60/77',2,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-060'),
('dm26rp3-061','ザエッサの海影 / 六奇怪の無 ～氾濫する覇王～','DM26RP3 61/77',2,array['water']::text[],array['タマシード','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-061'),
('dm26rp3-062','バイナラベーター','DM26RP3 62/77',6,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-062'),
('dm26rp3-063','龍装医 スティーツ','DM26RP3 63/77',4,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-063'),
('dm26rp3-064','ツーキンカイソッQ','DM26RP3 64/77',3,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-064'),
('dm26rp3-065','ツミタテンカーネン','DM26RP3 65/77',2,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-065'),
('dm26rp3-066','バギンの闇影 / 卑劣な裏切り','DM26RP3 66/77',2,array['darkness']::text[],array['タマシード','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-066'),
('dm26rp3-067','SMANAGER','DM26RP3 67/77',5,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-067'),
('dm26rp3-068','緑王双命三速斧','DM26RP3 68/77',4,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-068'),
('dm26rp3-069','龍装者 プロチュリス / 「主役を目指すッス！」','DM26RP3 69/77',3,array['fire']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-069'),
('dm26rp3-070','どうだいジンセー','DM26RP3 70/77',2,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-070'),
('dm26rp3-071','チュチュリスの爆影 / “無我怒”駆乱襲','DM26RP3 71/77',2,array['fire']::text[],array['タマシード','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-071'),
('dm26rp3-072','龍装車 ギギャイア','DM26RP3 72/77',8,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-072'),
('dm26rp3-073','大地 ワタン-2','DM26RP3 73/77',3,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-073'),
('dm26rp3-074','ホッタレマン','DM26RP3 74/77',1,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-074'),
('dm26rp3-075','ルグンドドの大影 / マメ・ウィズ・ア・ミッション','DM26RP3 75/77',2,array['nature']::text[],array['タマシード','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-075'),
('dm26rp3-076','邪桃臨界怒刀脚','DM26RP3 76/77',2,array['nature']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-076'),
('dm26rp3-077','光る！流れる!!ベンザマン!!!','DM26RP3 77/77',2,array['light','water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-077'),
('dm26rp3-dm001','勝敵逆夢王 モウジャキンガ','DM26RP3 DM1/DM1',8,array['water','darkness','fire']::text[],array['ドリーム・クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-DM001'),
('dm26rp3-dm001sec','勝敵逆夢王 モウジャキンガ','DM26RP3 DM1㊙/DM1',8,array['water','darkness','fire']::text[],array['ドリーム・クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-DM001SEC'),
('dm26rp3-or001','∑龍','DM26RP3 OR1/OR1',8,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-OR001'),
('dm26rp3-s001','SUPREME-GUN・ザ・ジョニー','DM26RP3 S1/S11',7,array['zero']::text[],array['S-MAX進化クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S001'),
('dm26rp3-s002','ジョット・首魁・ジョラゴン','DM26RP3 S2/S11',7,array['light']::text[],array['NEOクリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S002'),
('dm26rp3-s003','Dr.富士山ッピング','DM26RP3 S3/S11',5,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S003'),
('dm26rp3-s004','アイシャセー神','DM26RP3 S4/S11',4,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S004'),
('dm26rp3-s005','“↑↑”ブランド','DM26RP3 S5/S11',7,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S005'),
('dm26rp3-s006','闘帝合体 サンダイテイオー','DM26RP3 S6/S11',8,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S006'),
('dm26rp3-s007','「正義と正義と正義と正義」','DM26RP3 S7/S11',7,array['light','water','darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S007'),
('dm26rp3-s008','キング∞エンペラー','DM26RP3 S8/S11',8,array['light','water','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S008'),
('dm26rp3-s009','爆龍羅王 ゴリナボルト','DM26RP3 S9/S11',8,array['light','fire','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S009'),
('dm26rp3-s010','祝え！冥帝王 ダイジュ・ディダノス','DM26RP3 S10/S11',12,array['darkness','fire','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S010'),
('dm26rp3-s011','天地命動 バラギアラ / 輪廻虹災','DM26RP3 S11/S11',9,array['nature','light','water','darkness','fire']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-S011'),
('dm26rp3-sec001','∑龍','DM26RP3 ㊙1/㊙24',8,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC001'),
('dm26rp3-sec002','SUPREME-GUN・ザ・ジョニー','DM26RP3 ㊙2/㊙24',7,array['zero']::text[],array['S-MAX進化クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC002'),
('dm26rp3-sec003','ジョット・首魁・ジョラゴン','DM26RP3 ㊙3/㊙24',7,array['light']::text[],array['NEOクリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC003'),
('dm26rp3-sec004','Dr.富士山ッピング','DM26RP3 ㊙4/㊙24',5,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC004'),
('dm26rp3-sec005','アイシャセー神','DM26RP3 ㊙5/㊙24',4,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC005'),
('dm26rp3-sec006','“↑↑”ブランド','DM26RP3 ㊙6/㊙24',7,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC006'),
('dm26rp3-sec007','闘帝合体 サンダイテイオー','DM26RP3 ㊙7/㊙24',8,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC007'),
('dm26rp3-sec008','「正義と正義と正義と正義」','DM26RP3 ㊙8/㊙24',7,array['light','water','darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC008'),
('dm26rp3-sec009','キング∞エンペラー','DM26RP3 ㊙9/㊙24',8,array['light','water','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC009'),
('dm26rp3-sec010','爆龍羅王 ゴリナボルト','DM26RP3 ㊙10/㊙24',8,array['light','fire','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC010'),
('dm26rp3-sec011','祝え！冥帝王 ダイジュ・ディダノス','DM26RP3 ㊙11/㊙24',12,array['darkness','fire','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC011'),
('dm26rp3-sec012','天地命動 バラギアラ / 輪廻虹災','DM26RP3 ㊙12/㊙24',9,array['nature','light','water','darkness','fire']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC012'),
('dm26rp3-sec013','ミノガミ&オウ禍武斗 / T.２.D.','DM26RP3 ㊙13/㊙24',9,array['nature']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC013'),
('dm26rp3-sec014','羅明逆夢 アシュノムカメイ','DM26RP3 ㊙14/㊙24',7,array['darkness','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC014'),
('dm26rp3-sec015','黎悪銃と邪煉哀の決断','DM26RP3 ㊙15/㊙24',9,array['light','darkness','nature']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC015'),
('dm26rp3-sec016','裏魔導書グリモア-Ⅰ章','DM26RP3 ㊙16/㊙24',4,array['water']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC016'),
('dm26rp3-sec017','コクーン・ツェッペリン','DM26RP3 ㊙17/㊙24',3,array['nature']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC017'),
('dm26rp3-sec018','魔具 ヴァイポイズ-4','DM26RP3 ㊙18/㊙24',5,array['water','darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC018'),
('dm26rp3-sec019','アアルカイトの電影','DM26RP3 ㊙19/㊙24',3,array['water']::text[],array['タマシード']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC019'),
('dm26rp3-sec020','メモッタルド・デカスギオ / メモメモ・ジョーカーズ','DM26RP3 ㊙20/㊙24',6,array['nature']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC020'),
('dm26rp3-sec021','ヒミッツキッチ・グローブ','DM26RP3 ㊙21/㊙24',3,array['darkness','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC021'),
('dm26rp3-sec022','ヒトリダチ モンキッド','DM26RP3 ㊙22/㊙24',4,array['light']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC022'),
('dm26rp3-sec023','ツミタテンカーネン','DM26RP3 ㊙23/㊙24',2,array['darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC023'),
('dm26rp3-sec024','どうだいジンセー','DM26RP3 ㊙24/㊙24',2,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SEC024'),
('dm26rp3-sp001','理想と平和の決断','DM26RP3 SP1/SP5',4,array['light','water']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SP001'),
('dm26rp3-sp002','～邪眼帝 PARTⅡ～','DM26RP3 SP2/SP5',5,array['light','water','darkness']::text[],array['G-NEOクリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SP002'),
('dm26rp3-sp003','料理猫のプワソン','DM26RP3 SP3/SP5',8,array['light']::text[],array['進化クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SP003'),
('dm26rp3-sp004','天災 デドダム','DM26RP3 SP4/SP5',3,array['water','darkness','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SP004'),
('dm26rp3-sp005','クイーン&かぼちゃうちゃう','DM26RP3 SP5/SP5',2,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-SP005'),
('dm26rp3-std009','偽りの希望 鬼丸「終斗」','DM26RP3 STD9/',6,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STD009'),
('dm26rp3-std010','BARUGA-雷座87','DM26RP3 STD10/',5,array['nature']::text[],array['NEOクリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STD010'),
('dm26rp3-std011','ブランド ＜NEXT.Star＞','DM26RP3 STD11/',7,array['fire']::text[],array['スター進化クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STD011'),
('dm26rp3-std012','禁時混成王 ドキンダンテXXII','DM26RP3 STD12/',9,array['light','water','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STD012'),
('dm26rp3-stdchosec009','偽りの希望 鬼丸「終斗」','DM26RP3 STD超㊙9/',6,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDCHOSEC009'),
('dm26rp3-stdchosec010','BARUGA-雷座87','DM26RP3 STD超㊙10/',5,array['nature']::text[],array['NEOクリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDCHOSEC010'),
('dm26rp3-stdchosec011','ブランド ＜NEXT.Star＞','DM26RP3 STD超㊙11/',7,array['fire']::text[],array['スター進化クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDCHOSEC011'),
('dm26rp3-stdchosec012','禁時混成王 ドキンダンテXXII','DM26RP3 STD超㊙12/',9,array['light','water','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDCHOSEC012'),
('dm26rp3-stdsec009','偽りの希望 鬼丸「終斗」','DM26RP3 STD㊙9/',6,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDSEC009'),
('dm26rp3-stdsec010','BARUGA-雷座87','DM26RP3 STD㊙10/',5,array['nature']::text[],array['NEOクリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDSEC010'),
('dm26rp3-stdsec011','ブランド ＜NEXT.Star＞','DM26RP3 STD㊙11/',7,array['fire']::text[],array['スター進化クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDSEC011'),
('dm26rp3-stdsec012','禁時混成王 ドキンダンテXXII','DM26RP3 STD㊙12/',9,array['light','water','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-STDSEC012'),
('dm26rp3-t001','ベイビーポンの助','DM26RP3 T1/T10',1,array['zero']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T001'),
('dm26rp3-t002','冥王の牙','DM26RP3 T2/T10',7,array['darkness']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T002'),
('dm26rp3-t003','戒王の封','DM26RP3 T3/T10',6,array['darkness']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T003'),
('dm26rp3-t004','影世界のシクミ','DM26RP3 T4/T10',4,array['light','darkness']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T004'),
('dm26rp3-t005','霊宝 ヒャクメ-４','DM26RP3 T5/T10',6,array['light','darkness','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T005'),
('dm26rp3-t006','ディスタス・ゲート','DM26RP3 T6/T10',5,array['light','darkness','nature']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T006'),
('dm26rp3-t007','コンダマ / 魂フエミドロ','DM26RP3 T7/T10',4,array['nature']::text[],array['クリーチャー','呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T007'),
('dm26rp3-t008','アストラルの海幻','DM26RP3 T8/T10',2,array['water']::text[],array['タマシード']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T008'),
('dm26rp3-t009','ダムダム・ジョーカーズ','DM26RP3 T9/T10',1,array['darkness']::text[],array['呪文']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T009'),
('dm26rp3-t010','王道ダチ キャンベロ','DM26RP3 T10/T10',2,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-T010'),
('dm26rp3-td001','∞龍 ゲンムエンペラー','DM26RP3 TD1/TD5',null,array['water','darkness']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TD001'),
('dm26rp3-td002','キング・マニフェスト','DM26RP3 TD2/TD5',7,array['water','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TD002'),
('dm26rp3-td003','王道の弾丸 ジョリー・ザ・ジョニー','DM26RP3 TD3/TD5',11,array['zero']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TD003'),
('dm26rp3-td004','地封龍 ギャイア','DM26RP3 TD4/TD5',9,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TD004'),
('dm26rp3-td005','「正義全帝」','DM26RP3 TD5/TD5',8,array['light','water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TD005'),
('dm26rp3-tr001','大樹王 ギガンディダノス','DM26RP3 TR1/TR9',12,array['darkness','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR001'),
('dm26rp3-tr002','王来英雄 モモキングRX','DM26RP3 TR2/TR9',5,array['fire','nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR002'),
('dm26rp3-tr003','サッヴァークDG','DM26RP3 TR3/TR9',6,array['zero']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR003'),
('dm26rp3-tr004','水上第九院 シャコガイル','DM26RP3 TR4/TR9',9,array['water']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR004'),
('dm26rp3-tr005','勝利龍装 クラッシュ“覇道”','DM26RP3 TR5/TR9',10,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR005'),
('dm26rp3-tr006','自然の四君子 ガイアハザード','DM26RP3 TR6/TR9',11,array['nature']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR006'),
('dm26rp3-tr007','一王二命三眼槍','DM26RP3 TR7/TR9',5,array['darkness','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR007'),
('dm26rp3-tr008','頂上混成 ガリュディアス・モモミーズ’22','DM26RP3 TR8/TR9',99,array['light','water','fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR008'),
('dm26rp3-tr009','ニクジール・ブッシャー','DM26RP3 TR9/TR9',6,array['fire']::text[],array['クリーチャー']::text[],'https://dm.takaratomy.co.jp/card/detail/?id=dm26rp3-TR009');
create temporary table merge_pairs (
  survivor_id bigint primary key, merged_id bigint unique not null, survivor_name text not null, merged_name text not null
) on commit drop;
insert into merge_pairs values
(151,10532,'時の法皇 ミラダンテⅫ','時の法皇 ミラダンテXII'),
(229,7435,'ツクっちょ <メイ様.Star>','ツクっちょ ＜メイ様.Star＞'),
(397,11771,'カツラデランス / 「アフロ行きま～す!!」','カツラデランス / 「アフロ行きま～す！！」'),
(492,6058,'「正義星帝」 <ライオネル.Star>','「正義星帝」 ＜ライオネル.Star＞'),
(614,6205,'「正義星帝」 <鬼羅.Star>','「正義星帝」 ＜鬼羅.Star＞'),
(620,5582,'オンソク童子 <ターボ.鬼>','オンソク童子 ＜ターボ.鬼＞'),
(813,7158,'テラ・スザーク <ロマノフ.Star>','テラ・スザーク ＜ロマノフ.Star＞'),
(877,21607,'めっちゃ！デンヂャラスG３ / ケッシング・ゼロ','めっちゃ！デンヂャラスG3 / ケッシング・ゼロ'),
(898,6232,'キャンベロ <レッゾ.Star>','キャンベロ ＜レッゾ.Star＞'),
(984,20938,'ルピア&ガ:ナテハ','ルピア＆ガ：ナテハ'),
(1196,21773,'ミラクル１ ドレミ24','ミラクル1 ドレミ24'),
(3128,43694,'クイーン&かぼちゃうちゃう','クイーン＆かぼちゃうちゃう'),
(3362,7406,'カチコミ入道 <バトライ.鬼>','カチコミ入道 ＜バトライ.鬼＞'),
(4178,21314,'モンキッド ＜ライゾウ.Star＞','モンキッド <ライゾウ.Star>'),
(5070,12279,'爆殺!! 覇悪怒楽苦','爆殺！！ 覇悪怒楽苦'),
(6361,16056,'大邪眼Ｂ・ロマノフ','大邪眼B・ロマノフ'),
(6942,15420,'戦略のＤ・Ｈ アツト','戦略のD・H アツト'),
(7206,21817,'勇者の１号 ハムカツマン蒼','勇者の1号 ハムカツマン蒼'),
(7377,21278,'「楯騎士」 ＜アブソリュート.Star＞','「楯騎士」 <アブソリュート.Star>'),
(8224,21339,'ゴルドーザ ＜ドラギリア.Star＞','ゴルドーザ <ドラギリア.Star>'),
(8239,21301,'コバンザ ＜ジャニット.Star＞','コバンザ <ジャニット.Star>'),
(8357,21365,'ダチッコ ＜マック.Star＞','ダチッコ <マック.Star>'),
(9725,16127,'ＪＫ大バクチ','JK大バクチ'),
(9893,17153,'ＪＫパーネイチャー','JKパーネイチャー'),
(9902,16877,'ＪＫ軍曹チョキパン','JK軍曹チョキパン'),
(11493,21535,'ジョニー＆ジョラゴン 〜Ｊの意志〜','ジョニー＆ジョラゴン 〜Jの意志〜'),
(11514,21672,'ドッカン！ ゴートッＱ','ドッカン！ ゴートッQ'),
(15082,19931,'爆裂B-BOY','爆裂Ｂ-ＢＯＹ'),
(15619,15641,'アクア・ジェット ＜突撃・ブラザー！＞','アクア・ジェット <突撃・ブラザー！>'),
(16513,43492,'超電磁ヘルラッシュM','超電磁ヘルラッシュＭ'),
(16610,43519,'サイバーX・ザナドゥ','サイバーＸ・ザナドゥ'),
(16895,43486,'キサナティック・X','キサナティック・Ｘ'),
(155,43760,'頂上混成 ガリュディアス・モモミーズ’22','頂上混成 ガリュディアス・モモミーズ''22');
create temporary table unsafe_merges on commit drop as
select pairs.*
from merge_pairs pairs
join public.canonical_cards survivor on survivor.id = pairs.survivor_id and survivor.deleted_at is null
join public.canonical_cards merged on merged.id = pairs.merged_id and merged.deleted_at is null
where survivor.name <> pairs.survivor_name or merged.name <> pairs.merged_name
   or survivor.manually_locked or merged.manually_locked
   or exists (
     select 1 from public.deck_cards source
     join public.deck_cards target on target.deck_id = source.deck_id
       and target.zone = source.zone
       and target.canonical_card_id = pairs.survivor_id
       and target.card_print_id is not distinct from source.card_print_id
     where source.canonical_card_id = pairs.merged_id
   )
   or exists (
     select 1 from public.account_card_bookmarks source
     join public.account_card_bookmarks target on target.user_id = source.user_id
       and target.canonical_card_id = pairs.survivor_id
     where source.canonical_card_id = pairs.merged_id
   );
create temporary table eligible_merges on commit drop as
select pairs.* from merge_pairs pairs
where not exists (select 1 from unsafe_merges unsafe where unsafe.survivor_id = pairs.survivor_id);
create temporary table affected_deck_cards on commit drop as
select cards.id, cards.deck_id, cards.canonical_card_id, cards.card_print_id, cards.zone, cards.quantity, cards.sort_order
from public.deck_cards cards
where cards.canonical_card_id in (select merged_id from eligible_merges);
create temporary table affected_icons on commit drop as
select decks.id, decks.icon_canonical_card_id
from public.decks decks
where decks.icon_canonical_card_id in (select merged_id from eligible_merges);
insert into public.card_search_terms(canonical_card_id, term, normalized_term, term_kind, source, verified, priority)
select merges.survivor_id, terms.term, terms.normalized_term, terms.term_kind, terms.source, terms.verified, terms.priority
from eligible_merges merges
join public.card_search_terms terms on terms.canonical_card_id = merges.merged_id
on conflict (canonical_card_id, normalized_term, term_kind) do nothing;
delete from public.card_search_terms terms
using eligible_merges merges
where terms.canonical_card_id = merges.merged_id;
update public.card_prints prints
set canonical_card_id = merges.survivor_id, updated_at = pg_catalog.now()
from eligible_merges merges
where prints.canonical_card_id = merges.merged_id;
update public.deck_cards cards
set canonical_card_id = merges.survivor_id, updated_at = pg_catalog.now()
from eligible_merges merges
where cards.canonical_card_id = merges.merged_id;
update public.decks decks
set icon_canonical_card_id = merges.survivor_id, updated_at = pg_catalog.now()
from eligible_merges merges
where decks.icon_canonical_card_id = merges.merged_id;
update public.account_card_bookmarks bookmarks
set canonical_card_id = merges.survivor_id
from eligible_merges merges
where bookmarks.canonical_card_id = merges.merged_id;
update public.price_records records
set canonical_card_id = merges.survivor_id, updated_at = pg_catalog.now()
from eligible_merges merges
where records.canonical_card_id = merges.merged_id;
update public.canonical_cards merged
set deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
from eligible_merges merges
where merged.id = merges.merged_id;
create temporary table fallback_prints (official_card_id text primary key, card_print_id bigint unique not null) on commit drop;
insert into fallback_prints values
('dm26rp3-075',48231);
create temporary table existing_print_matches on commit drop as
select source.official_card_id, prints.id as card_print_id
from official_source source
join public.card_prints prints on prints.product_id = 264
  and prints.card_number = source.card_number and prints.deleted_at is null
  and prints.id not in (select card_print_id from fallback_prints)
union all
select source.official_card_id, fallback.card_print_id
from official_source source join fallback_prints fallback using (official_card_id)
join public.card_prints prints on prints.id = fallback.card_print_id
where prints.product_id = 264 and prints.deleted_at is null;
do $$
begin
  if (select count(*) from existing_print_matches) <> 80
     or (select count(*) from existing_print_matches) <> (select count(distinct card_print_id) from existing_print_matches) then
    raise exception 'DM26-RP3 existing print preflight failed';
  end if;
  if exists (select 1 from existing_print_matches matches join public.card_prints prints on prints.id = matches.card_print_id where prints.manually_locked) then
    raise exception 'DM26-RP3 includes a manually locked print';
  end if;
end;
$$;
create temporary table existing_canonical_metadata on commit drop as
select distinct on (prints.canonical_card_id)
  prints.canonical_card_id, source.name, source.cost, source.civilizations, source.card_types
from existing_print_matches matches
join official_source source using (official_card_id)
join public.card_prints prints on prints.id = matches.card_print_id
order by prints.canonical_card_id, source.official_card_id;
update public.canonical_cards cards
set name = metadata.name, source_name = metadata.name, cost = metadata.cost,
    civilizations = metadata.civilizations, card_types = metadata.card_types,
    source_checked_at = pg_catalog.now(), updated_at = pg_catalog.now()
from existing_canonical_metadata metadata
where cards.id = metadata.canonical_card_id and not cards.manually_locked;
update public.card_prints prints
set official_card_id = source.official_card_id, card_number = source.card_number,
    product_name = 'DM26-RP3 デュエル・マスターズTCG 逆札篇 第3弾 勝敵！逆転おこせ鬼の∞ディスペクター!!', official_url = source.official_url,
    source_checked_at = pg_catalog.now(), updated_at = pg_catalog.now()
from existing_print_matches matches
join official_source source using (official_card_id)
where prints.id = matches.card_print_id;
with game as (select id from public.tcg_games where slug = 'duel-masters')
insert into public.canonical_cards(game_id, name, name_kana, cost, civilizations, card_types, source_name, source_name_kana, source_checked_at)
select game.id, source.name, null, source.cost, source.civilizations, source.card_types, source.name, null, pg_catalog.now()
from (
  select distinct on (normalize(name, NFKC)) *
  from official_source
  order by normalize(name, NFKC), official_card_id
) source cross join game
where not exists (
  select 1 from public.canonical_cards cards
  where cards.game_id = game.id and cards.deleted_at is null and normalize(cards.name, NFKC) = normalize(source.name, NFKC)
);
create temporary table source_canonicals on commit drop as
select source.official_card_id, coalesce(existing_prints.canonical_card_id, cards.id) as canonical_card_id
from official_source source
left join existing_print_matches matches using (official_card_id)
left join public.card_prints existing_prints on existing_prints.id = matches.card_print_id
join public.tcg_games game on game.slug = 'duel-masters'
join public.canonical_cards cards on cards.game_id = game.id and cards.deleted_at is null
  and normalize(cards.name, NFKC) = normalize(source.name, NFKC);
do $$
begin
  if (select count(*) from source_canonicals) <> 156 then raise exception 'DM26-RP3 canonical resolution failed'; end if;
end;
$$;
insert into public.card_prints(canonical_card_id, official_card_id, card_number, product_name, official_url, source_checked_at, product_id)
select source_canonicals.canonical_card_id, source.official_card_id, source.card_number,
  'DM26-RP3 デュエル・マスターズTCG 逆札篇 第3弾 勝敵！逆転おこせ鬼の∞ディスペクター!!', source.official_url, pg_catalog.now(), 264
from source_canonicals join official_source source using (official_card_id)
where not exists (select 1 from public.card_prints prints where prints.official_card_id = source.official_card_id and prints.deleted_at is null);
insert into public.card_search_terms(canonical_card_id, term, normalized_term, term_kind, source, verified, priority)
select distinct resolved.canonical_card_id, source.name, public.normalize_card_search(source.name), 'official_name', 'official', true, 0
from source_canonicals resolved join official_source source using (official_card_id)
where public.normalize_card_search(source.name) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do update
set term = excluded.term, source = excluded.source, verified = excluded.verified, priority = excluded.priority, updated_at = pg_catalog.now();
update public.card_products
set product_name = 'DM26-RP3 デュエル・マスターズTCG 逆札篇 第3弾 勝敵！逆転おこせ鬼の∞ディスペクター!!', official_url = 'https://dm.takaratomy.co.jp/product/dm26rp3/', source_checked_at = pg_catalog.now(), updated_at = pg_catalog.now()
where id = 264 and product_code = 'DM26-RP3';
delete from public.card_products legacy
where legacy.id = 263
  and not exists (select 1 from public.card_prints prints where prints.product_id = legacy.id);
alter table public.canonical_cards
  add column if not exists normalized_name_nfkc text generated always as (normalize(name, NFKC)) stored;
create unique index if not exists canonical_cards_active_nfkc_name_uidx
  on public.canonical_cards(game_id, normalized_name_nfkc) where deleted_at is null;
do $$
begin
  if exists (
    select 1 from affected_deck_cards before_state
    left join public.deck_cards after_state on after_state.id = before_state.id
    where after_state.id is null
       or after_state.card_print_id is distinct from before_state.card_print_id
       or after_state.zone <> before_state.zone
       or after_state.quantity <> before_state.quantity
       or after_state.sort_order <> before_state.sort_order
  ) then raise exception 'Deck card preservation validation failed'; end if;
  if exists (
    select 1 from affected_icons before_state
    join public.decks after_state on after_state.id = before_state.id
    where after_state.icon_canonical_card_id is null
  ) then raise exception 'Deck icon preservation validation failed'; end if;
  if (select count(*) from public.card_prints where product_id = 264 and official_card_id in (select official_card_id from official_source) and deleted_at is null) <> 156 then
    raise exception 'DM26-RP3 official print validation failed';
  end if;
end;
$$;
commit;