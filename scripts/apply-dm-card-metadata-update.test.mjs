import assert from "node:assert/strict";
import test from "node:test";
import { validateMetadataApply } from "./apply-dm-card-metadata-update.mjs";

test("requires explicit production confirmation and the linked project", () => {
  const manifest = { complete: true, records: 11687, files: ["card-metadata-001.sql"] };
  assert.throws(() => validateMetadataApply({ argv: [], linkedRef: "project", manifest }), /confirm-production/);
  assert.throws(() => validateMetadataApply({ argv: ["--confirm-production", "--project-ref=other"], linkedRef: "project", manifest }), /must match/);
  assert.equal(validateMetadataApply({ argv: ["--confirm-production", "--project-ref=project"], linkedRef: "project", manifest }).records, 11687);
});
