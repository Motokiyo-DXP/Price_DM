import assert from "node:assert/strict";
import test from "node:test";
import { parseShoppingAccess } from "./shopping-share-access.ts";
test("shopping access separates owner, friend and token credentials", () => {
  assert.deepEqual(parseShoppingAccess(new URLSearchParams()),{});
  assert.deepEqual(parseShoppingAccess(new URLSearchParams({token:"a".repeat(64)})),{p_token:"a".repeat(64)});
  assert.deepEqual(parseShoppingAccess(new URLSearchParams({share:"10000000-0000-4000-8000-000000000001"})),{p_share_id:"10000000-0000-4000-8000-000000000001"});
  for (const query of ["token=", "share=", "token=guess", "share=bad", `token=${"a".repeat(64)}&share=foo`, "token=a&token=b", "share=a&share=b"]) assert.equal(parseShoppingAccess(new URLSearchParams(query)),null);
});
