import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveAppliedFiles,
  validateApplyRequest,
} from "./apply-dm-card-import.mjs";

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

test("公式総件数または接続先が変わった場合は前回の適用済み一覧を破棄する", () => {
  const request = {
    expectedRef: "project-ref",
    cardPrintCount: 200,
    files: ["dm-cards-001.sql", "dm-cards-002.sql"],
  };
  assert.deepEqual(
    resolveAppliedFiles(
      {
        project_ref: "project-ref",
        card_print_count: 100,
        applied: ["dm-cards-001.sql"],
      },
      request,
    ),
    [],
  );
  assert.deepEqual(
    resolveAppliedFiles(
      {
        project_ref: "other-project",
        card_print_count: 200,
        applied: ["dm-cards-001.sql"],
      },
      request,
    ),
    [],
  );
  assert.deepEqual(
    resolveAppliedFiles(
      {
        project_ref: "project-ref",
        card_print_count: 200,
        applied: ["dm-cards-001.sql", "obsolete.sql"],
      },
      request,
    ),
    ["dm-cards-001.sql"],
  );
});
