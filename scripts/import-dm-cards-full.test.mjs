import assert from "node:assert/strict";
import test from "node:test";

import {
  deduplicateCardOutput,
  isOfficialUnavailablePlaceholder,
  parseFullImportArguments,
  processFetchedCard,
  resolveTotalAvailable,
} from "./import-dm-cards-full.mjs";
import { buildCardSearchMetadata } from "./lib/dm-card-readings.mjs";

test("full import arguments enforce a respectful delay", () => {
  assert.deepEqual(parseFullImportArguments([]), {
    delayMs: 1_000,
    maxPages: null,
    startPage: null,
  });
  assert.throws(() => parseFullImportArguments(["--delay-ms=200"]), /cannot be lower/);
});

test("a resumed crawl adopts the latest official catalog total", () => {
  assert.equal(resolveTotalAvailable(22_953, 23_120), 23_120);
  assert.equal(resolveTotalAvailable(22_953, null), 22_953);
});

test("Japanese readings and verified alternate names are generated", async () => {
  const musha = await buildCardSearchMetadata("ボルメテウス・武者・ドラゴン");
  assert.equal(musha.name_kana, "ボルメテウス・ムシャ・ドラゴン");

  const perfect = await buildCardSearchMetadata("理想と平和の決断");
  assert.deepEqual(perfect.aliases, ["パーフェクト・アルカディア"]);
  assert.deepEqual(perfect.aliases_kana, ["パーフェクト・アルカディア"]);
});

test("one malformed card is isolated, recorded, and succeeds on a later retry", async () => {
  const detailUrl = "https://dm.takaratomy.co.jp/card/detail/?id=broken";
  const knownUrls = new Set();
  const failures = new Map();
  const appended = [];
  let persistedFailures = 0;
  const persistFailures = async (current) => {
    assert.equal(current, failures);
    persistedFailures += 1;
  };

  const failed = await processFetchedCard({
    appendRecord: async (card) => appended.push(card),
    buildMetadata: async () => ({ name_kana: "てすと", aliases: [], aliases_kana: [] }),
    detailHtml: "<html>broken</html>",
    detailUrl,
    failures,
    knownUrls,
    now: () => new Date("2026-07-18T00:00:00.000Z"),
    page: 200,
    parseDetail: () => {
      throw new Error("card name was missing");
    },
    persistFailures,
  });

  assert.deepEqual(failed, {
    status: "failed",
    error: "card name was missing",
  });
  assert.equal(knownUrls.size, 0);
  assert.equal(appended.length, 0);
  assert.deepEqual(failures.get(detailUrl), {
    official_url: detailUrl,
    page: 200,
    attempts: 1,
    first_failed_at: "2026-07-18T00:00:00.000Z",
    last_failed_at: "2026-07-18T00:00:00.000Z",
    last_error: "card name was missing",
  });

  const saved = await processFetchedCard({
    appendRecord: async (card) => appended.push(card),
    buildMetadata: async () => ({
      aliases: [],
      aliases_kana: [],
      name_kana: "てすとかーど",
    }),
    detailHtml: "<html>fixed</html>",
    detailUrl,
    failures,
    knownUrls,
    page: 200,
    parseDetail: () => ({
      name: "テストカード",
      official_url: detailUrl,
    }),
    persistFailures,
  });

  assert.equal(saved.status, "saved");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].name, "テストカード");
  assert.equal(appended[0].name_kana, "てすとかーど");
  assert.equal(knownUrls.has(detailUrl), true);
  assert.equal(failures.size, 0);
  assert.equal(persistedFailures, 2);
});

test("a URL already present in output is not parsed or appended twice", async () => {
  const detailUrl = "https://dm.takaratomy.co.jp/card/detail/?id=known";
  const knownUrls = new Set([detailUrl]);
  const failures = new Map([
    [detailUrl, { official_url: detailUrl, attempts: 1 }],
  ]);
  let parsed = false;
  let appended = false;
  let persisted = false;

  const result = await processFetchedCard({
    appendRecord: async () => {
      appended = true;
    },
    detailHtml: "",
    detailUrl,
    failures,
    knownUrls,
    page: 1,
    parseDetail: () => {
      parsed = true;
      return { name: "duplicate" };
    },
    persistFailures: async () => {
      persisted = true;
    },
  });

  assert.deepEqual(result, { status: "known" });
  assert.equal(parsed, false);
  assert.equal(appended, false);
  assert.equal(failures.size, 0);
  assert.equal(persisted, true);
});

test("an official placeholder without a published name is tracked as unavailable", async () => {
  const detailUrl = "https://dm.takaratomy.co.jp/card/detail/?id=dmex08-022";
  const knownUrls = new Set();
  const failures = new Map([
    [detailUrl, { official_url: detailUrl, attempts: 1 }],
  ]);
  const unavailable = new Map();
  let unavailablePersisted = false;
  const detailHtml = `
    <title>(DMEX08 22/???) | デュエル・マスターズ</title>
    <h1 class="card-name"><span class="packname">(DMEX08 22/???)</span></h1>
  `;

  assert.equal(isOfficialUnavailablePlaceholder(detailHtml, detailUrl), true);
  const result = await processFetchedCard({
    appendRecord: async () => assert.fail("placeholder must not be appended"),
    detailHtml,
    detailUrl,
    failures,
    knownUrls,
    page: 131,
    parseDetail: () => {
      throw new Error("card name was missing");
    },
    persistFailures: async () => {},
    persistUnavailable: async () => {
      unavailablePersisted = true;
    },
    unavailable,
  });

  assert.deepEqual(result, { status: "unavailable" });
  assert.equal(failures.size, 0);
  assert.equal(knownUrls.has(detailUrl), true);
  assert.equal(unavailablePersisted, true);
  assert.equal(
    unavailable.get(detailUrl)?.reason,
    "official_page_has_no_published_card_name",
  );
  assert.equal(
    isOfficialUnavailablePlaceholder(
      '<h1 class="card-name">通常カード<span class="packname">(1/100)</span></h1>',
      detailUrl,
    ),
    false,
  );
  assert.equal(
    isOfficialUnavailablePlaceholder("<html>temporary error</html>", detailUrl),
    false,
  );
  assert.equal(
    isOfficialUnavailablePlaceholder(
      "<title>(DMPROMOY16 P61/Y16) | デュエル・マスターズ</title>",
      detailUrl,
    ),
    true,
  );
});

test("duplicate URLs and an incomplete trailing record are repaired before resume", () => {
  const first = JSON.stringify({
    name: "Card A",
    official_url: "https://dm.takaratomy.co.jp/card/detail/?id=a",
  });
  const second = JSON.stringify({
    name: "Card B",
    official_url: "https://dm.takaratomy.co.jp/card/detail/?id=b",
  });
  const result = deduplicateCardOutput(
    `${first}\n${first}\n${second}\n{\"name\":\"incomplete`,
  );

  assert.equal(result.removedRecords, 2);
  assert.equal(result.knownUrls.size, 2);
  assert.equal(result.repaired, true);
  assert.equal(result.content, `${first}\n${second}\n`);
});
