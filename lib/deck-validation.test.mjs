import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { getDeckCardAddCount, parseDeckInput } from "./deck-validation.ts";
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
    editorSortKey: "saved",
    editorSortDirection: "asc",
    cards: [{ canonicalCardId: 1, cardPrintId: null, name: "カード", quantity: 4 }],
  });
});

test("new decks select public while existing decks keep their saved visibility", () => {
  assert.match(deckEditor, /name="visibility" defaultValue=\{initialDeck\?\.visibility \?\? "public"\}/);
  for (const visibility of ["public", "private", "unlisted"]) {
    const form = validForm([]);
    form.set("visibility", visibility);
    assert.equal(parseDeckInput(form)?.visibility, visibility);
  }
  const missing = validForm([]);
  missing.delete("visibility");
  assert.equal(parseDeckInput(missing), null);
});

test("create and edit actions persist explicit visibility without modifying unrelated decks", async () => {
  const rows = new Map();
  const existingId = "11111111-1111-4111-8111-111111111111";
  rows.set(existingId, { id: existingId, owner_id: "owner", visibility: "private", icon_canonical_card_id: null });
  const original = { ...rows.get(existingId) };
  const client = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "owner" } }, error: null }) },
    from(table) {
      const filters = new Map();
      let update;
      const query = {
        select() { return query; },
        eq(key, value) { filters.set(key, value); return query; },
        insert(value) {
          assert.equal(table, "decks");
          const id = `new-${rows.size}`;
          rows.set(id, { ...value, id });
          return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
        },
        update(value) { update = value; return query; },
        delete() { assert.equal(table, "deck_cards"); return query; },
        async maybeSingle() {
          const row = rows.get(filters.get("id"));
          return { data: row?.owner_id === filters.get("owner_id") ? row : null, error: null };
        },
        then(resolve) {
          if (update) {
            assert.equal(table, "decks");
            const row = rows.get(filters.get("id"));
            assert.equal(row.owner_id, filters.get("owner_id"));
            Object.assign(row, update);
          }
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const redirected = new Error("redirect /decks");
  const dependencies = {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect: () => { throw redirected; } },
    "@/lib/deck-validation": { parseDeckInput },
    "@/lib/supabase-auth": { createAuthServerSupabaseClient: async () => client },
    "@/lib/shared-deck": {},
  };
  const source = readFileSync(new URL("../app/decks/actions.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  } });
  for (const visibility of ["public", "private", "unlisted"]) {
    const form = validForm([]);
    form.set("visibility", visibility);
    await assert.rejects(exports.createDeckAction({}, form), (error) => error === redirected);
    assert.equal([...rows.values()].at(-1).visibility, visibility);
    assert.deepEqual(rows.get(existingId), original);
    rows.get(existingId).visibility = visibility;
    await assert.rejects(exports.updateDeckAction(existingId, {}, form), (error) => error === redirected);
    assert.equal(rows.get(existingId).visibility, visibility);
    assert.equal([...rows.values()].at(-1).visibility, visibility);
    rows.set(existingId, { ...original });
  }
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

test("カードのまとめ追加は1カード4枚とメインデッキ上限を超えない", () => {
  assert.equal(getDeckCardAddCount(0, 0, 4), 4);
  assert.equal(getDeckCardAddCount(8, 2, 4), 2);
  assert.equal(getDeckCardAddCount(59, 0, 4), 1);
  assert.equal(getDeckCardAddCount(60, 0, 4), 0);
  assert.equal(getDeckCardAddCount(40, 4, 4), 0);
});
test("設定を開かなくても保存必須項目はDOMとFormDataに残る", () => {
  assert.ok(deckEditor.includes('<section className="deck-maker-settings" hidden={!settingsOpen}>'));
  assert.ok(!deckEditor.includes('{settingsOpen ? <section className="deck-maker-settings">'));
  assert.ok(deckEditor.includes('name="format"'));
  assert.ok(deckEditor.includes('name="visibility"'));
  assert.ok(deckEditor.includes('name="description"'));
});

test("既存デッキは保存済み順、新規デッキはコスト昇順で開始し、明示的なソート時だけ表示順を保存する", () => {
  assert.ok(deckEditor.includes('initialSort.key === "saved" ? null : initialSort.key'));
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
