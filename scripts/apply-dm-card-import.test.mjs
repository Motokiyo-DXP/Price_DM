import assert from "node:assert/strict";
import test from "node:test";

import { validateApplyRequest } from "./apply-dm-card-import.mjs";

const MANIFEST = {
  card_print_count: 100,
  complete_source: true,
  third_party_aliases_included: false,
  files: ["dm-cards-001.sql"],
};

test("完了済み公式データと一致するリンク先だけ本番適用を許可する", () => {
  assert.deepEqual(
    validateApplyRequest({
      argv: ["--confirm-production", "--project-ref=project-ref"],
      linkedRef: "project-ref",
      manifest: MANIFEST,
    }),
    {
      expectedRef: "project-ref",
      files: ["dm-cards-001.sql"],
      cardPrintCount: 100,
    },
  );
});

test("確認不足、未完了、第三者別名、リンク先不一致を拒否する", () => {
  assert.throws(
    () =>
      validateApplyRequest({
        argv: ["--project-ref=project-ref"],
        linkedRef: "project-ref",
        manifest: MANIFEST,
      }),
    /confirm-production/,
  );
  assert.throws(
    () =>
      validateApplyRequest({
        argv: ["--confirm-production", "--project-ref=other"],
        linkedRef: "project-ref",
        manifest: MANIFEST,
      }),
    /must match/,
  );
  assert.throws(
    () =>
      validateApplyRequest({
        argv: ["--confirm-production", "--project-ref=project-ref"],
        linkedRef: "project-ref",
        manifest: { ...MANIFEST, complete_source: false },
      }),
    /must be complete/,
  );
  assert.throws(
    () =>
      validateApplyRequest({
        argv: ["--confirm-production", "--project-ref=project-ref"],
        linkedRef: "project-ref",
        manifest: { ...MANIFEST, third_party_aliases_included: true },
      }),
    /Third-party aliases/,
  );
});
