import assert from "node:assert/strict";
import test from "node:test";
import { createShopForAdmin } from "./admin-shop-registration.ts";

function rpcClient(result) {
  const calls = [];
  return {
    calls,
    async rpc(functionName, args) {
      calls.push({ functionName, args });
      return result;
    },
  };
}

const input = {
  name: "カードショップ秋葉原",
  nameKana: "かーどしょっぷあきはばら",
  aliases: ["アキバ店"],
  prefecture: "東京都",
  municipality: "千代田区",
  addressLine: "外神田1-1-1",
  websiteUrl: "https://example.com/shop",
  reviewNote: "公式サイト確認済み",
};

test("管理者店舗登録RPCを呼び出してレスポンスを変換する", async () => {
  const client = rpcClient({
    data: [{
      shop_id: 42,
      shop_name: input.name,
      prefecture: input.prefecture,
      municipality: input.municipality,
      address_line: input.addressLine,
      website_url: input.websiteUrl,
    }],
    error: null,
  });

  assert.deepEqual(await createShopForAdmin(client, input), {
    id: 42,
    name: input.name,
    prefecture: input.prefecture,
    municipality: input.municipality,
    addressLine: input.addressLine,
    websiteUrl: input.websiteUrl,
  });
  assert.deepEqual(client.calls, [{
    functionName: "create_shop_for_admin_with_search",
    args: {
      p_name: input.name,
      p_name_kana: input.nameKana,
      p_aliases: input.aliases,
      p_prefecture: input.prefecture,
      p_municipality: input.municipality,
      p_address_line: input.addressLine,
      p_website_url: input.websiteUrl,
      p_review_note: input.reviewNote,
    },
  }]);
});

test("空の任意項目はnullとしてRPCへ渡す", async () => {
  const client = rpcClient({
    data: [{
      shop_id: 1,
      shop_name: "店舗A",
      prefecture: "東京都",
      municipality: null,
      address_line: null,
      website_url: null,
    }],
    error: null,
  });
  await createShopForAdmin(client, {
    ...input,
    name: "店舗A",
    nameKana: "",
    aliases: [],
    municipality: "",
    addressLine: "",
    websiteUrl: "",
    reviewNote: "",
  });
  assert.deepEqual(client.calls[0].args, {
    p_name: "店舗A",
    p_name_kana: null,
    p_aliases: [],
    p_prefecture: "東京都",
    p_municipality: null,
    p_address_line: null,
    p_website_url: null,
    p_review_note: null,
  });
});

test("既知の重複エラーを保持し、不正なレスポンスを拒否する", async () => {
  await assert.rejects(
    createShopForAdmin(rpcClient({
      data: null,
      error: { code: "P0001", message: "shop_already_exists" },
    }), input),
    /shop_already_exists/,
  );
  await assert.rejects(
    createShopForAdmin(rpcClient({ data: [], error: null }), input),
    /invalid_admin_shop_registration_response/,
  );
});
