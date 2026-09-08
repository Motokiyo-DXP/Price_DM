import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_EMAIL, isAdminEmail } from "./admin-auth.ts";

test("固定の管理者メールアドレスだけを許可する", () => {
  assert.equal(isAdminEmail(ADMIN_EMAIL), true);
  assert.equal(isAdminEmail(` ${ADMIN_EMAIL.toUpperCase()} `), true);
  assert.equal(isAdminEmail("another@example.com"), false);
  assert.equal(isAdminEmail(undefined), false);
});
