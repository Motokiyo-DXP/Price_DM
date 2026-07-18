# 店舗候補の承認運用

店舗候補DBマイグレーション適用後の管理者向け手順です。公開画面や `anon` / `authenticated` ロールから承認・却下は実行できません。

## 前提

- 本番DBへマイグレーションを適用する前に、もう一人がSQL差分を確認する
- 承認操作はSupabase SQL Editorを管理者権限で使用する
- PIN、セッショントークン、Service Role keyをSQLやGitへ記録しない
- 最終構成では `shops` は承認済み店舗だけを保持し、未承認候補は `shop_candidates` に保持する

## 段階導入上の注意

このマイグレーションは候補受付と承認処理のDB基盤を追加しますが、既存の価格登録RPCはまだ新しい店舗名を `shops` へ直接追加します。マイグレーション適用だけでは完全な承認制になりません。

適用後に店舗検索・候補登録画面と価格登録RPCを切り替え、動作確認が終わるまでは従来の登録PINを知る開発者だけが価格登録を行います。

## 未承認候補を確認する

```sql
select
  id,
  name,
  prefecture,
  municipality,
  address_line,
  website_url,
  submission_count,
  submitted_at,
  last_submitted_at
from public.shop_candidates
where status = 'pending'
order by submitted_at, id;
```

## 承認する

候補の店舗名、住所、公式サイトを別経路で確認してから実行します。承認すると既存の同名店舗を再利用するか、新しい `shops` レコードを作り、承認済み店舗IDを返します。

```sql
begin;

select private.approve_shop_candidate(
  p_candidate_id := 123,
  p_review_note := '公式サイトで店舗情報を確認'
);

commit;
```

`123` は実際の候補IDへ置き換えます。実行前に同じトランザクション内で候補行を再確認してください。

## 却下する

```sql
begin;

select private.reject_shop_candidate(
  p_candidate_id := 123,
  p_review_note := '既存店舗の表記違いのため却下'
);

commit;
```

## 適用後の確認

```sql
select id, name, prefecture, municipality, address_line
from public.shops
order by id desc
limit 20;

select id, name, status, approved_shop_id, reviewed_at, review_note
from public.shop_candidates
order by id desc
limit 20;
```

承認・却下処理に公開API権限が付与されていないことも、SupabaseのSecurity Advisorと関数権限で確認します。
