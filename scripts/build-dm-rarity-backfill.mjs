import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export function buildRarityBackfill(report) {
  if (report.total !== report.rows.length || report.verified + report.unverified !== report.total) throw Error('Invalid reconciliation totals');
  const rows = report.rows.filter(r=>r.rarity_codes && !r.reason);
  if (rows.length !== report.verified || new Set(rows.map(r=>r.id)).size !== rows.length) throw Error('Duplicate or invalid verified rows');
  for(const row of rows) {
    if(!row.official_card_id || !row.evidence?.sha256 || !row.evidence?.body
      || row.evidence.official_card_id!==row.official_card_id || (row.evidence.rarity_codes ? JSON.stringify(row.evidence.rarity_codes)!==JSON.stringify(row.rarity_codes) : row.rarity_codes.length!==1 || row.evidence.rarity!==row.rarity_codes[0])) throw Error('Missing exact official-ID evidence');
  }
  const stage = rows.map(r=>({id:r.id,canonical_card_id:r.canonical_card_id,official_card_id:r.official_card_id,
    card_number:r.card_number,product_name:r.product_name,rarity_codes:r.rarity_codes,
    provenance:{source:r.evidence.body==='detail'?'official_detail':'official_rarity_search',url:r.evidence.url,body:r.evidence.body,
      sha256:r.evidence.sha256,checked_at:r.evidence.checked_at,official_card_id:r.official_card_id}}));
  const setup=`create temporary table rarity_stage on commit drop as select * from jsonb_to_recordset(${literal(stage)})
    as r(id bigint,canonical_card_id bigint,official_card_id text,card_number text,product_name text,rarity_codes text[],provenance jsonb);`;
  const identity=`p.id=s.id and p.canonical_card_id=s.canonical_card_id and p.official_card_id=s.official_card_id
    and p.card_number is not distinct from s.card_number and p.product_name is not distinct from s.product_name
    and p.deleted_at is null and not p.manually_locked`;
  const apply=`begin;
set local lock_timeout='5s';
${setup}
-- Serialize with concurrent print updates before checking the read-only snapshot.
lock table public.card_prints in share row exclusive mode;
do $$ begin
  if (select count(*) from card_prints p join canonical_cards c on c.id=p.canonical_card_id
    join tcg_games g on g.id=c.game_id where p.deleted_at is null and g.slug='duel-masters') <> ${report.total}
    then raise exception 'Rarity snapshot total changed; refresh reconciliation'; end if;
  if (select count(*) from rarity_stage s join card_prints p on ${identity}
    where (p.rarity_codes is null and p.rarity_provenance is null) or (p.rarity_codes=s.rarity_codes and p.rarity_provenance=s.provenance)) <> ${rows.length}
    then raise exception 'Rarity snapshot identity, lock or old value changed'; end if;
end $$;
update public.card_prints p set rarity_codes=s.rarity_codes, rarity_provenance=s.provenance
from rarity_stage s where ${identity} and p.rarity_codes is null and p.rarity_provenance is null;
commit;
`;
  const rollback=`begin;
set local lock_timeout='5s';
${setup}
lock table public.card_prints in share row exclusive mode;
do $$ begin
  if (select count(*) from rarity_stage s join card_prints p on ${identity}
    where p.rarity_codes=s.rarity_codes and p.rarity_provenance=s.provenance) <> ${rows.length}
    then raise exception 'Rollback stopped: rarity changed since backfill'; end if;
end $$;
update public.card_prints p set rarity_codes=null,rarity_provenance=null from rarity_stage s
where ${identity} and p.rarity_codes=s.rarity_codes and p.rarity_provenance=s.provenance;
commit;
`;
  return {apply,rollback};
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  const report=JSON.parse(await readFile('.local/rarity/reconciliation.json','utf8'));
  const sql=buildRarityBackfill(report);
  await writeFile('.local/rarity/backfill.sql',sql.apply);
  await writeFile('.local/rarity/rollback-backfill.sql',sql.rollback);
  console.log(`Prepared ${report.verified}/${report.total}; unverified ${report.unverified}. No DB writes.`);
}
