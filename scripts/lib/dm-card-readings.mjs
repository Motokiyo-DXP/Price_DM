import { fileURLToPath } from "node:url";

import kuromoji from "kuromoji";

const DICTIONARY_PATH = fileURLToPath(
  new URL("../../node_modules/kuromoji/dict/", import.meta.url),
);

const SPECIAL_CARD_ALIASES = new Map([
  ["理想と平和の決断", ["パーフェクト・アルカディア"]],
  ["星増樹", ["ほしふぇるき"]],
]);

let tokenizerPromise;

function getTokenizer() {
  tokenizerPromise ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DICTIONARY_PATH }).build((error, tokenizer) => {
      if (error) reject(error);
      else resolve(tokenizer);
    });
  });
  return tokenizerPromise;
}

export async function readingFor(value) {
  const tokenizer = await getTokenizer();
  return tokenizer
    .tokenize(value)
    .map((token) => token.reading ?? token.surface_form)
    .join("");
}

export async function buildCardSearchMetadata(name) {
  const aliases = SPECIAL_CARD_ALIASES.get(name) ?? [];
  return {
    aliases,
    // These entries are curated readings already. Running them through the
    // tokenizer can corrupt intentionally non-dictionary pronunciations.
    aliases_kana: aliases,
    name_kana: await readingFor(name),
  };
}
