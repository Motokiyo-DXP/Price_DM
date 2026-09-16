import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const SET_CODE = "DM26-RP3";
const PRODUCT_CODE = "DM26-RP3";
const PRODUCT_URL = "https://dm.takaratomy.co.jp/product/dm26rp3/";
const RELEASE_DATE = "2026-09-19";
const CIVILIZATIONS = new Map([
  ["光", "light"], ["水", "water"], ["闇", "darkness"],
  ["火", "fire"], ["自然", "nature"], ["ゼロ", "zero"],
]);

function sqlText(value) {
  return value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return values.length ? `array[${values.map(sqlText).join(",")}]::text[]` : "'{}'::text[]";
}

export function previewImageNumber(cardNumber) {
  let match = cardNumber.match(/^(\d+)\/77$/u);
  if (match) return 46 + Number(match[1]);
  match = cardNumber.match(/^S(\d+)\/S11$/u);
  if (match) return 35 + Number(match[1]);
  match = cardNumber.match(/^TR(\d+)\/TR9$/u);
  if (match) return 16 + Number(match[1]);
  match = cardNumber.match(/^TD(\d+)\/TD5$/u);
  if (match) return 11 + Number(match[1]);
  if (cardNumber === "OR1/OR1") return 11;
  if (cardNumber === "DM1/DM1") return 8;
  if (cardNumber === "DM1㊙/DM1") return 9;
  if (cardNumber === "DM超㊙1/DM1") return 10;
  return null;
}

function normalizeCard(card) {
  if (card.set_code !== SET_CODE) throw new Error(`Unexpected set_code for ${card.name}.`);
  if (typeof card.card_number !== "string" || !card.card_number.trim()) throw new Error("Every card needs card_number.");
  if (typeof card.name !== "string" || !card.name.trim()) throw new Error(`Card ${card.card_number} needs a name.`);
  const faces = Array.isArray(card.faces) ? card.faces : [];
  if ((card.cost == null) !== (faces.length > 0)) throw new Error(`Invalid twin-impact shape: ${card.card_number}.`);
  if (faces.length > 0 && faces.length !== 2) throw new Error(`Twin-impact card must have two faces: ${card.card_number}.`);
  const faceNames = faces.map((face) => face.name.trim());
  const name = faceNames.length ? faceNames.join(" / ") : card.name.trim();
  const cost = faceNames.length ? faces[0].cost : card.cost;
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > 99) throw new Error(`Invalid cost: ${card.card_number}.`);
  const sourceCivilizations = faceNames.length ? faces.flatMap((face) => face.civilization) : card.civilization;
  const civilizations = [...new Set(sourceCivilizations.map((value) => {
    const mapped = CIVILIZATIONS.get(value);
    if (!mapped) throw new Error(`Invalid civilization ${value}: ${card.card_number}.`);
    return mapped;
  }))];
  const imageNumber = previewImageNumber(card.card_number);
  const imageId = imageNumber == null ? null : String(imageNumber).padStart(3, "0");
  return {
    sourceNumber: card.card_number,
    cardNumber: `${SET_CODE.replaceAll("-", "")} ${card.card_number}`,
    name,
    cost,
    civilizations,
    cardTypes: faceNames.length ? ["クリーチャー", "呪文"] : [],
    faceNames,
    imageId,
    imageKey: imageId ? `official/dm26rp3-preview-${imageId}` : null,
  };
}

export function normalizeInput(input) {
  if (input.set_code !== SET_CODE || input.official_product_url !== PRODUCT_URL) throw new Error("Unexpected DM26-RP3 input metadata.");
  if (!Array.isArray(input.cards) || input.cards.length !== input.record_count) throw new Error("record_count does not match cards.");
  const cards = input.cards.map(normalizeCard);
  const keys = new Set();
  for (const card of cards) {
    const key = `${SET_CODE}\0${card.sourceNumber}`;
    if (keys.has(key)) throw new Error(`Duplicate card number: ${card.sourceNumber}.`);
    keys.add(key);
  }
  return cards;
}

function sourceValues(cards, imageMetadata, includeImages) {
  return cards.map((card) => {
    const image = imageMetadata.get(card.sourceNumber);
    return `(${sqlText(card.sourceNumber)},${sqlText(card.cardNumber)},${sqlText(card.name)},${card.cost},${sqlArray(card.civilizations)},${sqlArray(card.cardTypes)},${sqlArray(card.faceNames)},${sqlText(includeImages && image ? card.imageKey : null)},${includeImages && image ? image.width : "null"},${includeImages && image ? image.height : "null"},${includeImages && image ? image.byteSize : "null"})`;
  }).join(",\n");
}

export function buildSql(cards, imageMetadata = new Map(), includeImages = false) {
  return `begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dm26rp3-preview-import', 0));
create temporary table dm26rp3_source(source_number text primary key,card_number text not null,name text not null,cost smallint not null,civilizations text[] not null,card_types text[] not null,face_names text[] not null,image_key text,image_width integer,image_height integer,image_byte_size integer) on commit drop;
insert into dm26rp3_source values
${sourceValues(cards, imageMetadata, includeImages)};

with game as (select id from public.tcg_games where slug='duel-masters')
insert into public.card_products(game_id,product_code,product_name,release_date,release_date_precision,official_url,source_checked_at)
select game.id,${sqlText(PRODUCT_CODE)},${sqlText("DM26-RP3 逆札篇 第3弾 勝敵！逆転おこせ鬼の∞ディスペクター!!")},${sqlText(RELEASE_DATE)}::date,'day',${sqlText(PRODUCT_URL)},pg_catalog.now() from game
on conflict(game_id,product_code) do update set product_name=excluded.product_name,release_date=excluded.release_date,release_date_precision=excluded.release_date_precision,official_url=excluded.official_url,source_checked_at=excluded.source_checked_at,updated_at=pg_catalog.now();

with game as (select id from public.tcg_games where slug='duel-masters'), source as (select distinct on(name) * from dm26rp3_source order by name,source_number)
insert into public.canonical_cards(game_id,name,name_kana,cost,civilizations,card_types,source_name,source_name_kana,source_checked_at)
select game.id,source.name,null,source.cost,source.civilizations,source.card_types,source.name,null,pg_catalog.now() from source cross join game
on conflict(game_id,name) where deleted_at is null do nothing;

with game as (select id from public.tcg_games where slug='duel-masters'), product as (select cp.id from public.card_products cp join game on game.id=cp.game_id where cp.product_code=${sqlText(PRODUCT_CODE)})
insert into public.card_prints(canonical_card_id,official_card_id,card_number,product_name,official_url,source_checked_at,image_key,image_width,image_height,image_byte_size,image_updated_at,product_id)
select canonical.id,null,source.card_number,${sqlText("DM26-RP3 逆札篇 第3弾 勝敵！逆転おこせ鬼の∞ディスペクター!!")},${sqlText(PRODUCT_URL)},pg_catalog.now(),source.image_key,source.image_width,source.image_height,source.image_byte_size,case when source.image_key is null then null else pg_catalog.now() end,product.id
from dm26rp3_source source cross join game cross join product join public.canonical_cards canonical on canonical.game_id=game.id and canonical.name=source.name and canonical.deleted_at is null
where not exists(select 1 from public.card_prints existing where existing.product_id=product.id and existing.card_number=source.card_number and existing.deleted_at is null);

with game as (select id from public.tcg_games where slug='duel-masters')
insert into public.card_search_terms(canonical_card_id,term,normalized_term,term_kind,source,verified,priority)
select distinct canonical.id,source.name,public.normalize_card_search(source.name),'official_name','official',true,0 from dm26rp3_source source cross join game join public.canonical_cards canonical on canonical.game_id=game.id and canonical.name=source.name and canonical.deleted_at is null where public.normalize_card_search(source.name)<>''
on conflict(canonical_card_id,normalized_term,term_kind) do update set term=excluded.term,source=excluded.source,verified=excluded.verified,priority=excluded.priority,updated_at=pg_catalog.now();

with game as (select id from public.tcg_games where slug='duel-masters')
insert into public.card_search_terms(canonical_card_id,term,normalized_term,term_kind,source,verified,priority)
select distinct canonical.id,face.name,public.normalize_card_search(face.name),'face_name','official',true,10 from dm26rp3_source source cross join lateral unnest(source.face_names) face(name) cross join game join public.canonical_cards canonical on canonical.game_id=game.id and canonical.name=source.name and canonical.deleted_at is null where public.normalize_card_search(face.name)<>''
on conflict(canonical_card_id,normalized_term,term_kind) do update set term=excluded.term,source=excluded.source,verified=excluded.verified,priority=excluded.priority,updated_at=pg_catalog.now();
commit;
`;
}

async function main(argv) {
  const [inputPath, sourceDirectory = ".local/dm26rp3-source", outputDirectory = ".local/dm26rp3-import"] = argv.filter((value) => value !== "--images-uploaded");
  const includeImages = argv.includes("--images-uploaded");
  if (!inputPath) throw new Error("Usage: node scripts/build-dm26rp3-preview-import.mjs <input.json> [source-dir] [output-dir]");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  const cards = normalizeInput(input);
  const imageDirectory = path.join(outputDirectory, "upload", "official");
  await mkdir(imageDirectory, { recursive: true });
  const imageMetadata = new Map();
  for (const card of cards) {
    if (!card.imageId) continue;
    const source = path.join(sourceDirectory, `${card.imageId}.jpg`);
    const output = path.join(imageDirectory, `dm26rp3-preview-${card.imageId}.webp`);
    const info = await sharp(source).rotate().resize({ width: 384, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(output);
    imageMetadata.set(card.sourceNumber, { width: info.width, height: info.height, byteSize: (await stat(output)).size });
  }
  await writeFile(path.join(outputDirectory, "import.sql"), buildSql(cards, imageMetadata, includeImages), "utf8");
  const manifest = { set_code: SET_CODE, input_records: cards.length, images_prepared: imageMetadata.size, images_in_sql: includeImages ? imageMetadata.size : 0, images_missing: cards.filter((card) => !card.imageId).map((card) => card.sourceNumber), source: PRODUCT_URL };
  await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch((error) => { console.error(error); process.exitCode = 1; });
