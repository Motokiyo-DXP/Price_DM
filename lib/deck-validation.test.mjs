import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDeckInput } from "./deck-validation.ts";
import { getDeckPreview, invalidateDeckPreviewCache, setDeckPreview } from "./deck-preview-cache.ts";

const deckEditor = readFileSync(new URL("../components/deck-editor.tsx", import.meta.url), "utf8");
const deckPreviewModal = readFileSync(new URL("../components/deck-preview-modal.tsx", import.meta.url), "utf8");

function validForm(cards = [{ canonicalCardId: 1, name: "カード", quantity: 4 }]) {
  const form = new FormData();
  form.set("name", "テストデッキ");
  form.set("format", "original");
  form.set("visibility", "private");
  form.set("description", "説明");
  form.set("cards", JSON.stringify(cards));
  return form;
}

test("accepts a valid draft deck", () => {
  assert.deepEqual(parseDeckInput(validForm()), {
    name: "テストデッキ",
    format: "original",
    visibility: "private",
    description: "説明",
    cards: [{ canonicalCardId: 1, cardPrintId: null, name: "カード", quantity: 4 }],
  });
});

test("rejects duplicate cards and more than sixty cards", () => {
  assert.equal(parseDeckInput(validForm([
    { canonicalCardId: 1, name: "A", quantity: 1 },
    { canonicalCardId: 1, name: "A", quantity: 1 },
  ])), null);
  assert.equal(parseDeckInput(validForm(Array.from({ length: 16 }, (_, index) => ({
    canonicalCardId: index + 1,
    name: `card-${index}`,
    quantity: 4,
  })))), null);
});

test("rejects invalid metadata and quantities", () => {
  const invalidFormat = validForm();
  invalidFormat.set("format", "anything");
  assert.equal(parseDeckInput(invalidFormat), null);
  assert.equal(parseDeckInput(validForm([{ canonicalCardId: 1, name: "A", quantity: 5 }])), null);
  assert.equal(parseDeckInput(validForm([{ canonicalCardId: 1, cardPrintId: -1, name: "A", quantity: 1 }])), null);
});

test("accepts a selected print id", () => {
  assert.equal(parseDeckInput(validForm([{ canonicalCardId: 1, cardPrintId: 42, name: "A", quantity: 1 }]))?.cards[0].cardPrintId, 42);
});

test("allows main decks from zero through sixty regardless of format and rejects sixty-one", () => {
  for (const count of [0, 39, 40, 41, 59, 60]) {
    const cards = Array.from({ length: Math.ceil(count / 4) }, (_, index) => ({
      canonicalCardId: index + 1,
      name: `card-${index}`,
      quantity: Math.min(4, count - index * 4),
    }));
    for (const format of ["original", "advanced", "duel_party"]) {
      const form = validForm(cards);
      form.set("format", format);
      assert.equal(parseDeckInput(form)?.cards.reduce((sum, card) => sum + card.quantity, 0), count, `${format} ${count}`);
    }
  }
  const sixtyOneCards = Array.from({ length: 16 }, (_, index) => ({
    canonicalCardId: index + 1,
    name: `card-${index}`,
    quantity: index < 15 ? 4 : 1,
  }));
  for (const format of ["original", "advanced", "duel_party"]) {
    const form = validForm(sixtyOneCards);
    form.set("format", format);
    assert.equal(parseDeckInput(form), null, format);
  }
});
test("設定を開かなくても保存必須項目はDOMとFormDataに残る", () => {
  assert.ok(deckEditor.includes('<section className="deck-maker-settings" hidden={!settingsOpen}>'));
  assert.ok(!deckEditor.includes('{settingsOpen ? <section className="deck-maker-settings">'));
  assert.ok(deckEditor.includes('name="format"'));
  assert.ok(deckEditor.includes('name="visibility"'));
  assert.ok(deckEditor.includes('name="description"'));
});

test("既存デッキは保存済み順、新規デッキはコスト昇順で開始し、明示的なソート時だけ表示順を保存する", () => {
  assert.match(deckEditor, /const \[deckSort, setDeckSort\] = useState<DeckSortKey \| null>\(initialDeck \? null : "cost"\)/);
  assert.match(deckEditor, /deckSort \? sortDeckCards\(cards, deckSort, deckSortDirection\) : cards/);
  assert.match(deckEditor, /value=\{JSON\.stringify\(orderedCards\)\}/);
  assert.match(deckEditor, /<form action=\{formAction\} className="deck-maker-form" onSubmit=\{\(\) => \{ if \(initialDeck\) invalidateDeckPreviewCache\(initialDeck\.id\); \}\}>/);
});

test("保存対象デッキだけプレビューキャッシュを無効化する", () => {
  const preview = { name: "テスト", cards: [] };
  setDeckPreview("mine", "deck-a", preview);
  setDeckPreview("public", "deck-a", preview);
  setDeckPreview("mine", "deck-b", preview);

  invalidateDeckPreviewCache("deck-a");

  assert.equal(getDeckPreview("mine", "deck-a"), undefined);
  assert.equal(getDeckPreview("public", "deck-a"), undefined);
  assert.equal(getDeckPreview("mine", "deck-b"), preview);
});

test("デッキプレビューは再オープン時に保存済み順を再取得する", () => {
  assert.match(deckPreviewModal, /preview`, \{ cache: "no-store" \}/);
});
