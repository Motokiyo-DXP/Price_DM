import assert from "node:assert/strict";
import test from "node:test";
import { getCardImageUrl, resolveCardArtworkUrl } from "./card-image.ts";

test("builds a local card image URL", () => {
  assert.equal(getCardImageUrl("prints/123"), "/cards/prints/123.webp");
});

test("encodes path segments and rejects traversal", () => {
  assert.equal(getCardImageUrl("sample/card 1"), "/cards/sample/card%201.webp");
  assert.equal(getCardImageUrl("../secret"), null);
  assert.equal(getCardImageUrl(null), null);
});

test("resolves local card artwork to the remote base in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBaseUrl = process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL;
  try {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL = "https://cards.example.com";
    assert.equal(
      resolveCardArtworkUrl("/cards/official/dm26rp1-S002.webp"),
      "https://cards.example.com/official/dm26rp1-S002.webp",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousBaseUrl === undefined) delete process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL;
    else process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL = previousBaseUrl;
  }
});

test("keeps local card artwork local in development", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBaseUrl = process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL;
  try {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL = "https://cards.example.com";
    assert.equal(
      resolveCardArtworkUrl("/cards/official/dm26rp1-S002.webp"),
      "/cards/official/dm26rp1-S002.webp",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousBaseUrl === undefined) delete process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL;
    else process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL = previousBaseUrl;
  }
});
