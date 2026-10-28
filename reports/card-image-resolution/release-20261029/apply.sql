-- Apply only after ALL four uploaded objects pass public GET/SHA/dimensions.
begin;
do $image_release$
declare affected integer;
begin
with changed as (update public.card_prints p set image_key='official/dmrp09-005-reviewed-sha256-c08b5d6f247ef07e25ef7953412c576ce7197ea36264f9c475214ec1b9dde12b',image_width=384,image_height=536,image_byte_size=60050,image_updated_at=pg_catalog.now()
 where p.id=12817 and p.canonical_card_id=6993 and p.official_card_id='dmrp09-005'
 and p.card_number is not distinct from 'DMRP09 5/102' and p.product_name is not distinct from 'DMRP-09 超天篇 拡張パック第１弾 新世界ガチ誕！超ＧＲとオレガ・オーラ!!'
 and p.official_url is not distinct from 'https://dm.takaratomy.co.jp/card/detail/?id=dmrp09-005' and p.deleted_at is null and p.manually_locked=false and p.image_key='official/dmrp09-005' and p.image_width=250 and p.image_height=350 and p.image_byte_size=32642
 and p.image_updated_at is not distinct from '2026-08-28T22:00:31.567883+00:00'::timestamptz
 and p.updated_at is not distinct from '2026-09-29T06:50:03.944032+00:00'::timestamptz returning p.id) select count(*) into affected from changed;
 if affected<>1 then raise exception 'Image snapshot conflict for 12817'; end if;
with changed as (update public.card_prints p set image_key='official/dmrp09-003-reviewed-sha256-1298b25448fedf6e2f9d09e32e7d9c90b4dc38486b3b9673ca062c94f4fffee3',image_width=384,image_height=537,image_byte_size=50594,image_updated_at=pg_catalog.now()
 where p.id=12827 and p.canonical_card_id=7836 and p.official_card_id='dmrp09-003'
 and p.card_number is not distinct from 'DMRP09 3/102' and p.product_name is not distinct from 'DMRP-09 超天篇 拡張パック第１弾 新世界ガチ誕！超ＧＲとオレガ・オーラ!!'
 and p.official_url is not distinct from 'https://dm.takaratomy.co.jp/card/detail/?id=dmrp09-003' and p.deleted_at is null and p.manually_locked=false and p.image_key='official/dmrp09-003' and p.image_width=250 and p.image_height=350 and p.image_byte_size=27784
 and p.image_updated_at is not distinct from '2026-08-28T22:00:31.567883+00:00'::timestamptz
 and p.updated_at is not distinct from '2026-09-29T06:38:31.284271+00:00'::timestamptz returning p.id) select count(*) into affected from changed;
 if affected<>1 then raise exception 'Image snapshot conflict for 12827'; end if;
with changed as (update public.card_prints p set image_key='official/dmrp08-g05-reviewed-sha256-a25710747989d43f626c0736f21524307f121c9cf63d48969ce8dbfac388444d',image_width=384,image_height=539,image_byte_size=55482,image_updated_at=pg_catalog.now()
 where p.id=13118 and p.canonical_card_id=4736 and p.official_card_id='dmrp08-g05'
 and p.card_number is not distinct from 'DMRP08 G5/G5' and p.product_name is not distinct from 'DMRP-08 双極篇 拡張パック第４弾 超決戦!バラギアラ!!無敵オラオラ輪廻∞'
 and p.official_url is not distinct from 'https://dm.takaratomy.co.jp/card/detail/?id=dmrp08-g05' and p.deleted_at is null and p.manually_locked=false and p.image_key='official/dmrp08-g05' and p.image_width=250 and p.image_height=350 and p.image_byte_size=36198
 and p.image_updated_at is not distinct from '2026-08-28T22:00:48.964286+00:00'::timestamptz
 and p.updated_at is not distinct from '2026-09-29T06:42:10.95602+00:00'::timestamptz returning p.id) select count(*) into affected from changed;
 if affected<>1 then raise exception 'Image snapshot conflict for 13118'; end if;
with changed as (update public.card_prints p set image_key='official/dmrp06-s06-reviewed-sha256-4d2f5edce7ac79c3aea1e5be206200423099c9dbe87d34252f351de8acfbfd5a',image_width=384,image_height=537,image_byte_size=58072,image_updated_at=pg_catalog.now()
 where p.id=13610 and p.canonical_card_id=157 and p.official_card_id='dmrp06-s06'
 and p.card_number is not distinct from 'DMRP06 S6/S10' and p.product_name is not distinct from 'DMRP-06 双極篇 拡張パック第２弾 逆襲のギャラクシー 卍・獄・殺!!'
 and p.official_url is not distinct from 'https://dm.takaratomy.co.jp/card/detail/?id=dmrp06-s06' and p.deleted_at is null and p.manually_locked=false and p.image_key='official/dmrp06-s06' and p.image_width=250 and p.image_height=350 and p.image_byte_size=31684
 and p.image_updated_at is not distinct from '2026-08-28T22:01:07.720621+00:00'::timestamptz
 and p.updated_at is not distinct from '2026-09-29T06:50:03.944032+00:00'::timestamptz returning p.id) select count(*) into affected from changed;
 if affected<>1 then raise exception 'Image snapshot conflict for 13610'; end if;
end $image_release$;
do $metadata_patch$
declare affected integer;
begin
with expected(id,canonical_id,official_id,image_key,w,h,bytes,old_w,old_h,old_bytes,old_updated) as (values
(48390,43931,'dm26ex4-046','official/dm26ex4-preview-115-778d8e00f13c6336',384,536,63594,null::integer,null::integer,null::integer,null::timestamptz),
(48391,43916,'dm26ex4-038','official/dm26ex4-preview-107-6d4f28bd61be27da',384,536,55182,null::integer,null::integer,null::integer,null::timestamptz),
(48392,43929,'dm26ex4-049','official/dm26ex4-preview-118-1a7d7b6633aff0e3',384,536,42322,null::integer,null::integer,null::integer,null::timestamptz),
(48393,43923,'dm26ex4-007','official/dm26ex4-preview-076-6780e2b55ed5465e',384,536,63958,null::integer,null::integer,null::integer,null::timestamptz),
(48394,43898,'dm26ex4-057','official/dm26ex4-preview-126-aedc15ef0a7f2200',384,536,70994,null::integer,null::integer,null::integer,null::timestamptz),
(48395,43911,'dm26ex4-024','official/dm26ex4-preview-093-67b24b3f13d04912',384,536,57140,null::integer,null::integer,null::integer,null::timestamptz),
(48396,43903,'dm26ex4-026','official/dm26ex4-preview-095-7a37119c3717c4fa',384,536,44494,null::integer,null::integer,null::integer,null::timestamptz),
(48397,43908,'dm26ex4-035','official/dm26ex4-preview-104-31112b4d9b81cde6',384,536,67102,null::integer,null::integer,null::integer,null::timestamptz),
(48398,43909,'dm26ex4-003','official/dm26ex4-preview-072-2f4458d3345b579d',384,536,54602,null::integer,null::integer,null::integer,null::timestamptz),
(48399,43912,'dm26ex4-031','official/dm26ex4-preview-100-bbc17b145360dbd5',384,536,59296,null::integer,null::integer,null::integer,null::timestamptz),
(48400,43894,'dm26ex4-018','official/dm26ex4-preview-087-2b6aad4b6400da8c',384,536,79854,null::integer,null::integer,null::integer,null::timestamptz),
(48401,43928,'dm26ex4-009','official/dm26ex4-preview-078-30a88b7505ca2453',384,536,43480,null::integer,null::integer,null::integer,null::timestamptz),
(48402,43905,'dm26ex4-043','official/dm26ex4-preview-112-4dd4573cec00270c',384,536,45684,null::integer,null::integer,null::integer,null::timestamptz),
(48403,908,null,'official/dm26ex4-preview-009-8529ed6774c95198',384,536,63414,null::integer,null::integer,null::integer,null::timestamptz),
(48404,43910,'dm26ex4-004','official/dm26ex4-preview-073-45d72dd1c2c59d0a',384,536,67740,null::integer,null::integer,null::integer,null::timestamptz),
(48405,43925,'dm26ex4-030','official/dm26ex4-preview-099-b527313949dccf4c',384,536,64068,null::integer,null::integer,null::integer,null::timestamptz),
(48406,43936,'dm26ex4-077','official/dm26ex4-preview-146-7f81ed9ffcd2c499',384,536,52056,null::integer,null::integer,null::integer,null::timestamptz),
(48407,929,'dm26ex4-CHO027','official/dm26ex4-preview-046-6aad7d63deaffc19',384,536,49144,null::integer,null::integer,null::integer,null::timestamptz),
(48408,43927,'dm26ex4-006','official/dm26ex4-preview-075-f610c879c88f0c8e',384,536,61158,null::integer,null::integer,null::integer,null::timestamptz),
(48409,43935,'dm26ex4-065','official/dm26ex4-preview-134-b5cf14dbd6f34bc9',384,536,46716,null::integer,null::integer,null::integer,null::timestamptz),
(48410,43913,'dm26ex4-014','official/dm26ex4-preview-083-b5dafa9f3a7f0ffe',384,536,71498,null::integer,null::integer,null::integer,null::timestamptz),
(48411,43920,'dm26ex4-012','official/dm26ex4-preview-081-34d2fa8adf177cf7',384,536,80618,null::integer,null::integer,null::integer,null::timestamptz),
(48412,43906,'dm26ex4-098','official/dm26ex4-preview-167-c67c0093ce31acd9',384,536,46862,null::integer,null::integer,null::integer,null::timestamptz),
(48413,43926,'dm26ex4-017','official/dm26ex4-preview-086-dc3f316987fc5727',384,536,66408,null::integer,null::integer,null::integer,null::timestamptz),
(48414,43914,'dm26ex4-025','official/dm26ex4-preview-094-c5e0670722891feb',384,536,57112,null::integer,null::integer,null::integer,null::timestamptz),
(48415,43902,'dm26ex4-093','official/dm26ex4-preview-162-3d82f33859025bbf',384,536,47698,null::integer,null::integer,null::integer,null::timestamptz),
(48416,43924,'dm26ex4-037','official/dm26ex4-preview-106-a303108355c8f2ab',384,536,61680,null::integer,null::integer,null::integer,null::timestamptz),
(48417,43918,'dm26ex4-036','official/dm26ex4-preview-105-c4cb0a54d9ce4e42',384,536,57130,null::integer,null::integer,null::integer,null::timestamptz),
(48418,43904,'dm26ex4-099','official/dm26ex4-preview-168-bafdf62f6393db1d',384,536,46912,null::integer,null::integer,null::integer,null::timestamptz),
(48419,43922,'dm26ex4-019','official/dm26ex4-preview-088-1c34d9a3099a38ae',384,536,66386,null::integer,null::integer,null::integer,null::timestamptz),
(48420,43900,'dm26ex4-052','official/dm26ex4-preview-121-95bff91287264221',384,536,44602,null::integer,null::integer,null::integer,null::timestamptz),
(48421,43893,'dm26ex4-015','official/dm26ex4-preview-084-90183763892d7636',384,536,79758,null::integer,null::integer,null::integer,null::timestamptz),
(48422,43901,'dm26ex4-070','official/dm26ex4-preview-139-ce8606523d6a5f2f',384,536,38962,null::integer,null::integer,null::integer,null::timestamptz),
(48423,43932,'dm26ex4-090','official/dm26ex4-preview-159-0ca07378e8327893',384,536,68906,null::integer,null::integer,null::integer,null::timestamptz),
(48424,43896,'dm26ex4-058','official/dm26ex4-preview-127-1aba334ffe7e09cf',384,536,68564,null::integer,null::integer,null::integer,null::timestamptz),
(48425,43921,'dm26ex4-033','official/dm26ex4-preview-102-c70fe0d752af707f',384,536,55262,null::integer,null::integer,null::integer,null::timestamptz),
(48426,43891,'dm26ex4-072','official/dm26ex4-preview-141-829b943e356cf9f9',384,536,50374,null::integer,null::integer,null::integer,null::timestamptz),
(48427,43892,'dm26ex4-094','official/dm26ex4-preview-163-bb662efcae0a2f0e',384,536,39790,null::integer,null::integer,null::integer,null::timestamptz),
(48428,43933,'dm26ex4-008','official/dm26ex4-preview-077-55105a292eeff903',384,536,47144,null::integer,null::integer,null::integer,null::timestamptz),
(48429,43930,'dm26ex4-023','official/dm26ex4-preview-092-924b805098f78d6f',384,536,75436,null::integer,null::integer,null::integer,null::timestamptz),
(48430,43915,'dm26ex4-005','official/dm26ex4-preview-074-27b007af42cebca6',384,536,71444,null::integer,null::integer,null::integer,null::timestamptz),
(48431,43897,'dm26ex4-059','official/dm26ex4-preview-128-ab9d1eeb9c435351',384,536,72418,null::integer,null::integer,null::integer,null::timestamptz),
(48432,43917,'dm26ex4-029','official/dm26ex4-preview-098-375fb56537f5f3fa',384,536,57564,null::integer,null::integer,null::integer,null::timestamptz),
(48433,43938,'dm26ex4-067','official/dm26ex4-preview-136-c94ca9b0e9d2af99',384,536,65446,null::integer,null::integer,null::integer,null::timestamptz),
(48434,43919,'dm26ex4-001','official/dm26ex4-preview-070-341eb0e7a6a5c0d3',384,536,72598,null::integer,null::integer,null::integer,null::timestamptz),
(48435,43907,'dm26ex4-028','official/dm26ex4-preview-097-5d09474475ae56b0',384,536,60736,null::integer,null::integer,null::integer,null::timestamptz),
(48436,43937,'dm26ex4-013','official/dm26ex4-preview-082-a30fdc596c90c6d0',384,536,54760,null::integer,null::integer,null::integer,null::timestamptz),
(48437,43899,'dm26ex4-040','official/dm26ex4-preview-109-6d9c9d281894d82e',384,536,45130,null::integer,null::integer,null::integer,null::timestamptz),
(48438,967,'dm26ex4-CHO008','official/dm26ex4-preview-027-20170aaa7abcefcb',384,536,59890,null::integer,null::integer,null::integer,null::timestamptz),
(48439,7949,'dm26ex4-CHO040','official/dm26ex4-preview-059-5022531fb84ad953',384,536,52428,null::integer,null::integer,null::integer,null::timestamptz),
(48440,44073,'dm26ex4-082','official/dm26ex4-preview-151-2a44563338cf7a69',384,536,41114,null::integer,null::integer,null::integer,null::timestamptz),
(48441,44053,'dm26ex4-076','official/dm26ex4-preview-145-988bf48fe052e983',384,536,65450,null::integer,null::integer,null::integer,null::timestamptz),
(48442,846,'dm26ex4-CHO007','official/dm26ex4-preview-026-21161b937386c532',384,536,50148,null::integer,null::integer,null::integer,null::timestamptz),
(48443,535,'dm26ex4-CHO005','official/dm26ex4-preview-024-9df9f6c31c1f60e7',384,536,65884,null::integer,null::integer,null::integer,null::timestamptz),
(48444,44080,'dm26ex4-078','official/dm26ex4-preview-147-8be45860bc381a97',384,536,64020,null::integer,null::integer,null::integer,null::timestamptz),
(48445,44034,'dm26ex4-020','official/dm26ex4-preview-089-4af3f5bfa6b5f084',384,536,55126,null::integer,null::integer,null::integer,null::timestamptz),
(48446,7993,'dm26ex4-CHO043','official/dm26ex4-preview-062-973306971cb4ef28',384,536,53526,null::integer,null::integer,null::integer,null::timestamptz),
(48447,7154,'dm26ex4-CHO048','official/dm26ex4-preview-067-cb0be61fced0d7f8',384,536,50408,null::integer,null::integer,null::integer,null::timestamptz),
(48448,43996,'dm26ex4-041','official/dm26ex4-preview-110-18456ab6b8373c70',384,536,38842,null::integer,null::integer,null::integer,null::timestamptz),
(48449,43976,'dm26ex4-021','official/dm26ex4-preview-090-1e39eab8b6ae620d',384,536,46862,null::integer,null::integer,null::integer,null::timestamptz),
(48450,2995,'dm26ex4-CHO015','official/dm26ex4-preview-034-8cc9b828693bbb16',384,536,52458,null::integer,null::integer,null::integer,null::timestamptz),
(48451,44061,'dm26ex4-055','official/dm26ex4-preview-124-14cfe74438581b3f',384,536,61708,null::integer,null::integer,null::integer,null::timestamptz),
(48452,43957,'dm26ex4-074','official/dm26ex4-preview-143-565b16854e67098f',384,536,48044,null::integer,null::integer,null::integer,null::timestamptz),
(48453,467,'dm26ex4-CHO020','official/dm26ex4-preview-039-1a1bece75fa749d5',384,536,75918,null::integer,null::integer,null::integer,null::timestamptz),
(48454,264,'dm26ex4-CHO001','official/dm26ex4-preview-020-149361427dcd802c',384,536,72396,null::integer,null::integer,null::integer,null::timestamptz),
(48455,7802,'dm26ex4-CHO013','official/dm26ex4-preview-032-475174d52e35112b',384,536,55374,null::integer,null::integer,null::integer,null::timestamptz),
(48456,45,'dm26ex4-CHO047','official/dm26ex4-preview-066-529d9fa09f759777',384,536,50172,null::integer,null::integer,null::integer,null::timestamptz),
(48457,43940,'dm26ex4-002','official/dm26ex4-preview-071-26c6624d1130453a',384,536,70730,null::integer,null::integer,null::integer,null::timestamptz),
(48458,43993,'dm26ex4-083','official/dm26ex4-preview-152-b24b68fc733fd7e3',384,536,35524,null::integer,null::integer,null::integer,null::timestamptz),
(48459,16824,'dm26ex4-CHO010','official/dm26ex4-preview-029-6f049be40ebc0b8f',384,536,60820,null::integer,null::integer,null::integer,null::timestamptz),
(48460,43979,'dm26ex4-092','official/dm26ex4-preview-161-4ba55f48702353de',384,536,48214,null::integer,null::integer,null::integer,null::timestamptz),
(48461,43983,'dm26ex4-068','official/dm26ex4-preview-137-d0e831cc3bafbd9c',384,536,32950,null::integer,null::integer,null::integer,null::timestamptz),
(48462,44013,'dm26ex4-011','official/dm26ex4-preview-080-5241d464655df767',384,536,57358,null::integer,null::integer,null::integer,null::timestamptz),
(48463,43975,'dm26ex4-066','official/dm26ex4-preview-135-a37d1efa8f56d19a',384,536,59032,null::integer,null::integer,null::integer,null::timestamptz),
(48464,223,'dm26ex4-CHO038','official/dm26ex4-preview-057-4a7bd401a1dfb450',384,536,66508,null::integer,null::integer,null::integer,null::timestamptz),
(48465,43959,'dm26ex4-022','official/dm26ex4-preview-091-136c186c8388ea50',384,536,55660,null::integer,null::integer,null::integer,null::timestamptz),
(48466,222,'dm26ex4-CHO028','official/dm26ex4-preview-047-cd207f72b952e640',384,536,42606,null::integer,null::integer,null::integer,null::timestamptz),
(48467,8083,'dm26ex4-CHO014','official/dm26ex4-preview-033-78d8473250efbc0e',384,536,52052,null::integer,null::integer,null::integer,null::timestamptz),
(48468,44055,'dm26ex4-080','official/dm26ex4-preview-149-a11483a7adb04fa3',384,536,57170,null::integer,null::integer,null::integer,null::timestamptz),
(48469,43947,'dm26ex4-089','official/dm26ex4-preview-158-a62c11a333cfed66',384,536,50794,null::integer,null::integer,null::integer,null::timestamptz),
(48470,43990,'dm26ex4-051','official/dm26ex4-preview-120-1466c305e26265d7',384,536,42128,null::integer,null::integer,null::integer,null::timestamptz),
(48471,1172,'dm26ex4-CHO023','official/dm26ex4-preview-042-bb1b0fc5243839f4',384,536,52914,null::integer,null::integer,null::integer,null::timestamptz),
(48472,44070,'dm26ex4-088','official/dm26ex4-preview-157-f404997d34bf11f7',384,536,39892,null::integer,null::integer,null::integer,null::timestamptz),
(48473,43997,'dm26ex4-063','official/dm26ex4-preview-132-88cdba9217b5423f',384,536,56258,null::integer,null::integer,null::integer,null::timestamptz),
(48474,3882,'dm26ex4-CHO032','official/dm26ex4-preview-051-11d3e2eeb785f6a5',384,536,52740,null::integer,null::integer,null::integer,null::timestamptz),
(48475,43980,'dm26ex4-061','official/dm26ex4-preview-130-0361af68d7298670',384,536,65424,null::integer,null::integer,null::integer,null::timestamptz),
(48476,44012,'dm26ex4-010','official/dm26ex4-preview-079-48c5f275afdc90d8',384,536,72130,null::integer,null::integer,null::integer,null::timestamptz),
(48478,10015,'dm26ex4-CHO009','official/dm26ex4-preview-028-2a8ea9617f03488c',384,536,45168,null::integer,null::integer,null::integer,null::timestamptz),
(48479,3885,'dm26ex4-CHO044','official/dm26ex4-preview-063-10daf1a67476df85',384,536,38634,null::integer,null::integer,null::integer,null::timestamptz),
(48480,7057,'dm26ex4-CHO026','official/dm26ex4-preview-045-e64d4c12058f7936',384,536,41540,null::integer,null::integer,null::integer,null::timestamptz),
(48481,5235,'dm26ex4-CHO011','official/dm26ex4-preview-030-73ff4f01c715e985',384,536,40114,null::integer,null::integer,null::integer,null::timestamptz),
(48482,43927,'dm26ex4-SEC013','official/dm26ex4-preview-016-0d0504a1a3976b29',384,537,68074,null::integer,null::integer,null::integer,null::timestamptz),
(48483,43921,'dm26ex4-SEC001','official/dm26ex4-preview-013-05b2816b35c9cd05',384,537,54822,null::integer,null::integer,null::integer,null::timestamptz),
(48484,187,'dm26ex4-CHO031','official/dm26ex4-preview-050-397c0499e158be9b',384,536,48948,null::integer,null::integer,null::integer,null::timestamptz),
(48485,44079,'dm26ex4-060','official/dm26ex4-preview-129-59be665c0f217a2c',384,536,51904,null::integer,null::integer,null::integer,null::timestamptz),
(48486,43970,'dm26ex4-081','official/dm26ex4-preview-150-a0abd5ca64cc5be0',384,536,51168,null::integer,null::integer,null::integer,null::timestamptz),
(48487,43960,'dm26ex4-042','official/dm26ex4-preview-111-6059d928bb87d726',384,536,46522,null::integer,null::integer,null::integer,null::timestamptz),
(48488,43991,'dm26ex4-048','official/dm26ex4-preview-117-e42c2b605c881725',384,536,44358,null::integer,null::integer,null::integer,null::timestamptz),
(48489,3414,'dm26ex4-CHO034','official/dm26ex4-preview-053-279b10a1134bc3a9',384,536,44744,null::integer,null::integer,null::integer,null::timestamptz),
(48490,1164,'dm26ex4-CHO036','official/dm26ex4-preview-055-f7105d7e17257780',384,536,75042,null::integer,null::integer,null::integer,null::timestamptz),
(48491,43949,'dm26ex4-087','official/dm26ex4-preview-156-347d605905078bf1',384,536,46182,null::integer,null::integer,null::integer,null::timestamptz),
(48492,43911,'dm26ex4-SEC002','official/dm26ex4-preview-014-250d30c205a15155',384,537,57672,null::integer,null::integer,null::integer,null::timestamptz),
(48493,3023,'dm26ex4-CHO042','official/dm26ex4-preview-061-235b52b5d17b46a5',384,536,64974,null::integer,null::integer,null::integer,null::timestamptz),
(48494,43913,'dm26ex4-SEC015','official/dm26ex4-preview-018-14d50c21d9ad0447',384,537,70182,null::integer,null::integer,null::integer,null::timestamptz),
(48495,43969,'dm26ex4-069','official/dm26ex4-preview-138-78f9487ee1751f50',384,536,61134,null::integer,null::integer,null::integer,null::timestamptz),
(48496,44042,'dm26ex4-064','official/dm26ex4-preview-133-f1e1bdf09381a5c1',384,536,57144,null::integer,null::integer,null::integer,null::timestamptz),
(48497,1120,'dm26ex4-CHO035','official/dm26ex4-preview-054-edb8515405ee27e7',384,536,59556,null::integer,null::integer,null::integer,null::timestamptz),
(48498,4384,'dm26ex4-CHO050','official/dm26ex4-preview-069-126e7600dc0f8e0f',384,536,39042,null::integer,null::integer,null::integer,null::timestamptz),
(48499,398,'dm26ex4-CHO033','official/dm26ex4-preview-052-20bd98776bd75cc3',384,536,70126,null::integer,null::integer,null::integer,null::timestamptz),
(48500,43985,'dm26ex4-050','official/dm26ex4-preview-119-bbaa590cccd0a608',384,536,38272,null::integer,null::integer,null::integer,null::timestamptz),
(48501,44049,'dm26ex4-073','official/dm26ex4-preview-142-a3ea418193ea1d62',384,536,58722,null::integer,null::integer,null::integer,null::timestamptz),
(48502,745,'dm26ex4-CHO019','official/dm26ex4-preview-038-6f950b90575c8bd0',384,536,68138,null::integer,null::integer,null::integer,null::timestamptz),
(48503,1280,'dm26ex4-CHO037','official/dm26ex4-preview-056-22e1a6ceda9acf27',384,536,56090,null::integer,null::integer,null::integer,null::timestamptz),
(48504,7526,'dm26ex4-CHO018','official/dm26ex4-preview-037-a887a5536c95b152',384,536,77092,null::integer,null::integer,null::integer,null::timestamptz),
(48505,1122,'dm26ex4-CHO025','official/dm26ex4-preview-044-883782a4b94bc39f',384,536,54542,null::integer,null::integer,null::integer,null::timestamptz),
(48506,44082,'dm26ex4-079','official/dm26ex4-preview-148-63e574155831f9d6',384,536,43220,null::integer,null::integer,null::integer,null::timestamptz),
(48507,7795,'dm26ex4-CHO030','official/dm26ex4-preview-049-45b897188624c1a4',384,536,47076,null::integer,null::integer,null::integer,null::timestamptz),
(48508,43977,'dm26ex4-062','official/dm26ex4-preview-131-9342ba18c1a0aa39',384,536,56004,null::integer,null::integer,null::integer,null::timestamptz),
(48509,44027,null,'official/dm26ex4-preview-085-2-1051e433553623c3',384,536,82618,null::integer,null::integer,null::integer,null::timestamptz),
(48510,44028,'dm26ex4-032','official/dm26ex4-preview-101-3be4ce593a29e6a5',384,536,62224,null::integer,null::integer,null::integer,null::timestamptz),
(48511,43910,'dm26ex4-SEC016','official/dm26ex4-preview-019-0048bbe79ed83778',384,537,77824,null::integer,null::integer,null::integer,null::timestamptz),
(48512,5770,'dm26ex4-CHO046','official/dm26ex4-preview-065-e09dc859863e303d',384,536,50126,null::integer,null::integer,null::integer,null::timestamptz),
(48513,4449,'dm26ex4-CHO022','official/dm26ex4-preview-041-305b0da2ae417198',384,536,46534,null::integer,null::integer,null::integer,null::timestamptz),
(48514,44046,'dm26ex4-039','official/dm26ex4-preview-108-85ca14ea19bfa036',384,536,59314,null::integer,null::integer,null::integer,null::timestamptz),
(48515,9847,'dm26ex4-CHO045','official/dm26ex4-preview-064-6e4efc458f5cdc9e',384,536,40516,null::integer,null::integer,null::integer,null::timestamptz),
(48516,5196,'dm26ex4-CHO016','official/dm26ex4-preview-035-2d8e0d84dcd60e5d',384,536,69658,null::integer,null::integer,null::integer,null::timestamptz),
(48517,43992,'dm26ex4-053','official/dm26ex4-preview-122-d35f1b2ea17d4a18',384,536,40638,null::integer,null::integer,null::integer,null::timestamptz),
(48518,11986,'dm26ex4-CHO024','official/dm26ex4-preview-043-161e26b2934829b6',384,536,50376,null::integer,null::integer,null::integer,null::timestamptz),
(48519,3080,'dm26ex4-CHO041','official/dm26ex4-preview-060-c605dc672101b8e0',384,536,40822,null::integer,null::integer,null::integer,null::timestamptz),
(48520,44001,'dm26ex4-075','official/dm26ex4-preview-144-c334dad017730458',384,536,59450,null::integer,null::integer,null::integer,null::timestamptz),
(48521,43965,'dm26ex4-097','official/dm26ex4-preview-166-9404212825abefa6',384,536,44042,null::integer,null::integer,null::integer,null::timestamptz),
(48522,43948,'dm26ex4-096','official/dm26ex4-preview-165-996d305b5c230c10',384,536,44670,null::integer,null::integer,null::integer,null::timestamptz),
(48523,44037,'dm26ex4-085','official/dm26ex4-preview-154-3b1ead8e38d6d7d0',384,536,49496,null::integer,null::integer,null::integer,null::timestamptz),
(48524,44063,'dm26ex4-054','official/dm26ex4-preview-123-867c21adb6c80ce0',384,536,60432,null::integer,null::integer,null::integer,null::timestamptz),
(48525,7107,'dm26ex4-CHO002','official/dm26ex4-preview-021-38c74d6a2f5cd093',384,536,62408,null::integer,null::integer,null::integer,null::timestamptz),
(48526,44006,'dm26ex4-034','official/dm26ex4-preview-103-e47e888ca82a1795',384,536,63806,null::integer,null::integer,null::integer,null::timestamptz),
(48528,87,'dm26ex4-CHO004','official/dm26ex4-preview-023-553692462c359810',384,536,57718,null::integer,null::integer,null::integer,null::timestamptz),
(48529,44044,'dm26ex4-071','official/dm26ex4-preview-140-fc3d6ca0521b67ca',384,536,61702,null::integer,null::integer,null::integer,null::timestamptz),
(48530,4186,'dm26ex4-CHO021','official/dm26ex4-preview-040-3f57a8d5d54d1211',384,536,56318,null::integer,null::integer,null::integer,null::timestamptz),
(48531,43963,'dm26ex4-027','official/dm26ex4-preview-096-f1fea04502bc3c5f',384,536,39880,null::integer,null::integer,null::integer,null::timestamptz),
(48532,44018,'dm26ex4-016','official/dm26ex4-preview-085-f72a214d843503dc',384,536,71116,null::integer,null::integer,null::integer,null::timestamptz),
(48533,44030,'dm26ex4-047','official/dm26ex4-preview-116-1595b631fffa1253',384,536,48270,null::integer,null::integer,null::integer,null::timestamptz),
(48534,44071,'dm26ex4-095','official/dm26ex4-preview-164-146426c7f313b4a6',384,536,40722,null::integer,null::integer,null::integer,null::timestamptz),
(48535,43988,'dm26ex4-045','official/dm26ex4-preview-114-a0ee3675788cb20a',384,536,46032,null::integer,null::integer,null::integer,null::timestamptz),
(48536,44018,'dm26ex4-SEC010','official/dm26ex4-preview-015-2c81d3f3260f33cf',384,537,65872,null::integer,null::integer,null::integer,null::timestamptz),
(48537,7147,'dm26ex4-CHO003','official/dm26ex4-preview-022-68b1d76710acd786',384,536,64984,null::integer,null::integer,null::integer,null::timestamptz),
(48538,3603,'dm26ex4-CHO039','official/dm26ex4-preview-058-d4404f10e9605c6c',384,536,47614,null::integer,null::integer,null::integer,null::timestamptz),
(48539,7504,'dm26ex4-CHO017','official/dm26ex4-preview-036-a27bc0aaa0603345',384,536,63608,null::integer,null::integer,null::integer,null::timestamptz),
(48540,44069,'dm26ex4-091','official/dm26ex4-preview-160-1d567ef9d22f8d55',384,536,50856,null::integer,null::integer,null::integer,null::timestamptz),
(48541,10742,'dm26ex4-CHO029','official/dm26ex4-preview-048-e8580e95642cddf4',384,536,55598,null::integer,null::integer,null::integer,null::timestamptz),
(48543,44027,null,'official/dm26ex4-preview-015-2-bb8e90a2a9f11ecc',384,537,64248,null::integer,null::integer,null::integer,null::timestamptz),
(48544,43946,'dm26ex4-084','official/dm26ex4-preview-153-0d03953f7507888d',384,536,43806,null::integer,null::integer,null::integer,null::timestamptz),
(48545,43915,'dm26ex4-SEC014','official/dm26ex4-preview-017-5fa9bb912fe07472',384,537,78146,null::integer,null::integer,null::integer,null::timestamptz),
(48546,13181,'dm26ex4-CHO049','official/dm26ex4-preview-068-fac199f104529e0b',384,536,65112,null::integer,null::integer,null::integer,null::timestamptz),
(48547,44072,'dm26ex4-086','official/dm26ex4-preview-155-ba869cf0155714df',384,536,47912,null::integer,null::integer,null::integer,null::timestamptz),
(48548,823,'dm26ex4-CHO012','official/dm26ex4-preview-031-6a9089bb9b5a91e5',384,536,72002,null::integer,null::integer,null::integer,null::timestamptz),
(48549,44000,'dm26ex4-056','official/dm26ex4-preview-125-18bee8a402638fc9',384,536,55646,null::integer,null::integer,null::integer,null::timestamptz),
(48550,44075,'dm26ex4-044','official/dm26ex4-preview-113-6655668ad8438e55',384,536,47812,null::integer,null::integer,null::integer,null::timestamptz),
(48551,15103,'dm26ex4-CHO006','official/dm26ex4-preview-025-5ab07d089d0c26b5',384,536,57984,null::integer,null::integer,null::integer,null::timestamptz)
), updated as (
update public.card_prints p set image_width=coalesce(p.image_width,e.w),image_height=coalesce(p.image_height,e.h),image_byte_size=coalesce(p.image_byte_size,e.bytes)
from expected e where p.id=e.id and p.canonical_card_id=e.canonical_id
and p.official_card_id is not distinct from e.official_id and p.image_key=e.image_key
and p.deleted_at is null and p.manually_locked=false
and p.image_width is not distinct from e.old_w and p.image_height is not distinct from e.old_h
and p.image_byte_size is not distinct from e.old_bytes and p.image_updated_at is not distinct from e.old_updated
and (p.image_width is null or p.image_height is null or p.image_byte_size is null)
returning p.id) select count(*) into affected from updated;
if affected <> 159 then raise exception 'Metadata snapshot conflict: expected 159, updated %', affected; end if;
end $metadata_patch$;
commit;
