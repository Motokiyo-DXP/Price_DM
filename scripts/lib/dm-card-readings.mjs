import { fileURLToPath } from "node:url";

import kuromoji from "kuromoji";

const DICTIONARY_PATH = fileURLToPath(
  new URL("../../node_modules/kuromoji/dict/", import.meta.url),
);

const SPECIAL_CARD_ALIASES = new Map([
  ["理想と平和の決断", ["パーフェクト・アルカディア"]],
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
    aliases_kana: await Promise.all(aliases.map(readingFor)),
    name_kana: await readingFor(name),
  };
}
