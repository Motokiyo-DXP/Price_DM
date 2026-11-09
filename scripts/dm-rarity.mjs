import { load } from 'cheerio';

// Keep official special categories extensible. Never infer rarity from a print number.
export function normalizeRarity(value) {
  if (typeof value !== 'string') return null;
  const raw = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!raw) return null;
  if (['レアリティなし', 'なし', '-','－'].includes(raw)) return 'NONE';
  const aliases = {コモン:'C',アンコモン:'U',レア:'R',ベリーレア:'VR',スーパーレア:'SR'};
  return aliases[raw] ?? (/^[a-z0-9]+$/iu.test(raw) ? raw.toUpperCase() : raw);
}

export function parseOfficialRarities(html) {
  const $ = load(html);
  const values = $('.cardDetail th').toArray()
    .filter(th => $(th).text().trim() === 'レアリティ')
    .map(th => normalizeRarity($(th).next('td').text()));
  const meaningful = values.filter(value => value && value !== 'NONE');
  const unique = [...new Set(meaningful.length ? meaningful : values.filter(Boolean))];
  // Reverse/twinpact dash placeholders do not replace observed face rarities.
  // Distinct meaningful codes are retained, e.g. U/VIC dual-face prints.
  return values.length && values.every(Boolean) ? unique.sort() : null;
}

export function parseOfficialRarity(html) {
  const codes = parseOfficialRarities(html);
  return codes?.length === 1 ? codes[0] : null;
}

export function parseRarityOptions(html) {
  const $ = load(html);
  return [...new Map($('select[name=rarity] option').toArray().filter(el => $(el).attr('value'))
    .map(el => [$(el).attr('value'), {value:$(el).attr('value'), rarity:normalizeRarity($(el).text())}])).values()];
}

export function reconcileRarities(prints, memberships) {
  const byId = new Map();
  for (const member of memberships) {
    const entry = byId.get(member.official_card_id) ?? new Map();
    entry.set(member.rarity, member);
    byId.set(member.official_card_id, entry);
  }
  return prints.map(print => {
    const candidates = byId.get(print.official_card_id);
    const reason = print.manually_locked ? 'manually_locked' : !print.official_card_id ? 'missing_official_id'
      : !candidates?.size ? 'not_in_official_rarity_results' : candidates.size !== 1 ? 'conflicting_official_rarities' : null;
    return {...print, rarity_codes: reason ? null : [...candidates.keys()], reason,
      evidence: reason ? null : [...candidates.values()][0]};
  });
}
