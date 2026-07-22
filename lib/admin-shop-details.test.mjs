import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteRegisteredShop,
  loadAdminShopDetails,
  updateAdminShopDetails,
} from "./admin-shop-details.ts";

test("登録済み店舗削除RPCへ店舗IDを渡し削除名を返す", async () => {
  const client = rpcClient([{ data: "flat工房 秋葉原店", error: null }]);
  assert.equal(await deleteRegisteredShop(client, 31), "flat工房 秋葉原店");
  assert.deepEqual(client.calls, [{
    functionName: "delete_registered_shop_for_admin",
    args: { p_shop_id: 31 },
  }]);
});

function rpcClient(results) {
  const calls = [];
  const queue = [...results];
  return {
    calls,
    async rpc(functionName, args) {
      calls.push({ functionName, args });
      return queue.shift();
    },
  };
}

const shop = {
  id: 31,
  name: "flat工房 秋葉原店",
  name_kana: "ふらっとこうぼう あきはばらてん",
  aliases: ["フラット工房"],
  prefecture: "東京都",
  municipality: "千代田区",
  address_line: "外神田1-1-1",
  website_url: "https://example.com/shop",
};

test("管理者向け店舗詳細一覧を安全な表示値へ変換する", async () => {
  const client = rpcClient([{ data: [shop], error: null }]);
  assert.deepEqual(await loadAdminShopDetails(client), [{
    id: 31,
    name: shop.name,
    nameKana: shop.name_kana,
    aliases: shop.aliases,
    prefecture: shop.prefecture,
    municipality: shop.municipality,
    addressLine: shop.address_line,
    websiteUrl: shop.website_url,
  }]);
  assert.deepEqual(client.calls, [{
    functionName: "list_shop_details_for_admin",
    args: { p_limit: 500 },
  }]);
});

test("不正な店舗詳細レスポンスを拒否する", async () => {
  await assert.rejects(
    loadAdminShopDetails(rpcClient([{ data: [{ ...shop, id: 0 }], error: null }])),
    /invalid_admin_shop_details_response/,
  );
  await assert.rejects(
    loadAdminShopDetails(rpcClient([{
      data: [{ ...shop, aliases: Array.from({ length: 21 }, (_, index) => `別名${index}`) }],
      error: null,
    }])),
    /invalid_admin_shop_details_response/,
  );
});

test("管理者向け店舗詳細更新RPCへ整形済み値を渡す", async () => {
  const client = rpcClient([{ data: null, error: null }]);
  await updateAdminShopDetails(client, {
    shopId: 31,
    name: shop.name,
    nameKana: shop.name_kana,
    aliases: shop.aliases,
    prefecture: shop.prefecture,
    municipality: shop.municipality,
    addressLine: shop.address_line,
    websiteUrl: shop.website_url,
  });
  assert.deepEqual(client.calls, [{
    functionName: "update_shop_details_for_admin",
    args: {
      p_shop_id: 31,
      p_name: shop.name,
      p_name_kana: shop.name_kana,
      p_aliases: shop.aliases,
      p_prefecture: shop.prefecture,
      p_municipality: shop.municipality,
      p_address_line: shop.address_line,
      p_website_url: shop.website_url,
    },
  }]);
});

test("店舗更新RPCの権限エラーとDB検証エラーを保持する", async () => {
  const input = {
    shopId: 31,
    name: shop.name,
    nameKana: shop.name_kana,
    aliases: shop.aliases,
    prefecture: shop.prefecture,
    municipality: shop.municipality,
    addressLine: shop.address_line,
    websiteUrl: shop.website_url,
  };
  await assert.rejects(
    updateAdminShopDetails(
      rpcClient([{ data: null, error: { code: "42501", message: "admin_required" } }]),
      input,
    ),
    /42501/,
  );
  await assert.rejects(
    updateAdminShopDetails(
      rpcClient([{ data: null, error: { code: "P0001", message: "shop_already_exists" } }]),
      input,
    ),
    /shop_already_exists/,
  );
  await assert.rejects(
    deleteRegisteredShop(
      rpcClient([{ data: null, error: { code: "P0001", message: "shop_has_price_records" } }]),
      31,
    ),
    /shop_has_price_records/,
  );
  await assert.rejects(
    deleteRegisteredShop(rpcClient([{ data: null, error: null }]), 31),
    /invalid_admin_shop_deletion_response/,
  );
});
