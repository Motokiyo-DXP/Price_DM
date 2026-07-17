"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Database } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { STOCK_STATUS_LABELS, StockStatus } from "@/lib/types";

type Game = Database["public"]["Tables"]["tcg_games"]["Row"];
type CardOption =
  Database["public"]["Functions"]["search_cards"]["Returns"][number];
type SubmitArgs =
  Database["public"]["Functions"]["submit_price_record"]["Args"];

type Feedback = {
  kind: "error" | "success";
  text: string;
};

const stockStatuses = Object.entries(STOCK_STATUS_LABELS) as [
  StockStatus,
  string,
][];

function todayForDateInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function registrationErrorMessage(message: string) {
  if (message.includes("registration_pin_not_configured")) {
    return "登録PINがまだ設定されていません。Supabaseの管理者へ確認してください。";
  }
  if (message.includes("invalid_registration_pin")) {
    return "登録PINが違います。入力内容を確認してください。";
  }
  if (message.includes("card_not_found")) {
    return "選択したカードが見つかりません。カードを選び直してください。";
  }
  if (message.includes("at_least_one_price_required")) {
    return "販売価格または買取価格のどちらかを入力してください。";
  }
  if (message.includes("price_must_be_nonnegative")) {
    return "価格には0以上の数値を入力してください。";
  }
  if (message.includes("too_long")) {
    return "入力内容が長すぎます。文字数を減らしてください。";
  }
  return "登録できませんでした。入力内容を確認して再度お試しください。";
}

function registrationResultMessage(recordId: number | null) {
  if (recordId === -1) {
    return "登録PINが違います。入力内容を確認してください。";
  }
  if (recordId === -2) {
    return "登録回数の上限に達しました。時間をおいて再度お試しください。";
  }
  if (recordId === -3) {
    return "登録PINがまだ設定されていません。Supabaseの管理者へ確認してください。";
  }
  if (recordId === null || recordId <= 0) {
    return "登録結果を確認できませんでした。時間をおいて再度お試しください。";
  }
  return null;
}

export default function RegisterPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [gameSlug, setGameSlug] = useState("duel-masters");
  const [cardQuery, setCardQuery] = useState("");
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [searchingCards, setSearchingCards] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [observedOn] = useState(todayForDateInput);

  useEffect(() => {
    let cancelled = false;

    async function loadGames() {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setSystemError("Supabase の接続情報が設定されていません。");
        return;
      }

      const { data, error } = await supabase
        .from("tcg_games")
        .select("id, slug, name, created_at")
        .order("id");

      if (cancelled) return;
      if (error) {
        setSystemError("TCGの一覧を読み込めませんでした。");
        return;
      }

      const loadedGames = data ?? [];
      setGames(loadedGames);
      setGameSlug((current) =>
        loadedGames.some((game) => game.slug === current)
          ? current
          : (loadedGames[0]?.slug ?? ""),
      );
    }

    void loadGames();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!gameSlug) {
      setCardOptions([]);
      setSearchingCards(false);
      return;
    }

    setSearchingCards(true);
    const timer = window.setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setSystemError("Supabase の接続情報が設定されていません。");
        setSearchingCards(false);
        return;
      }

      const { data, error } = await supabase.rpc("search_cards", {
        p_game_slug: gameSlug,
        p_limit: 30,
        p_query: cardQuery.trim(),
      });

      if (cancelled) return;
      setSearchingCards(false);
      if (error) {
        setSystemError("カード候補を読み込めませんでした。");
        return;
      }

      setSystemError(null);
      setCardOptions(data ?? []);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cardQuery, gameSlug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const salePrice = String(formData.get("salePrice") ?? "").trim();
    const buyPrice = String(formData.get("buyPrice") ?? "").trim();

    setFeedback(null);
    if (!selectedCardId) {
      setFeedback({ kind: "error", text: "カードを選択してください。" });
      return;
    }
    if (!salePrice && !buyPrice) {
      setFeedback({
        kind: "error",
        text: "販売価格または買取価格のどちらかを入力してください。",
      });
      return;
    }

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setFeedback({
        kind: "error",
        text: "Supabase の接続情報が設定されていません。",
      });
      return;
    }

    const args: SubmitArgs = {
      p_card_id: Number(selectedCardId),
      p_observed_on: String(formData.get("observedOn") ?? ""),
      p_pin: String(formData.get("pin") ?? ""),
      p_shop_name: String(formData.get("shopName") ?? ""),
      p_stock_status: String(
        formData.get("stockStatus") ?? "unknown",
      ) as StockStatus,
    };

    const contributorName = String(
      formData.get("contributorName") ?? "",
    ).trim();
    const note = String(formData.get("note") ?? "").trim();
    if (salePrice) args.p_sale_price = Number(salePrice);
    if (buyPrice) args.p_buy_price = Number(buyPrice);
    if (contributorName) args.p_contributor_name = contributorName;
    if (note) args.p_note = note;

    setSubmitting(true);
    const { data: recordId, error } = await supabase.rpc(
      "submit_price_record",
      args,
    );
    setSubmitting(false);

    if (error) {
      setFeedback({
        kind: "error",
        text: registrationErrorMessage(error.message),
      });
      return;
    }

    const resultMessage = registrationResultMessage(recordId);
    if (resultMessage) {
      setFeedback({ kind: "error", text: resultMessage });
      return;
    }

    form.reset();
    setCardQuery("");
    setSelectedCardId("");
    setFeedback({ kind: "success", text: "価格情報を登録しました。" });
  }

  return (
    <section className="form-wrap">
      <a href="/">← 一覧へ戻る</a>
      <h1>価格を登録</h1>
      <p className="form-intro">
        Supabaseに登録済みのカードを選び、確認した価格を共有します。
      </p>

      {systemError && (
        <p className="notice error" role="alert">
          {systemError}
        </p>
      )}

      <form onSubmit={submit}>
        <label htmlFor="gameSlug">
          TCG
          <select
            id="gameSlug"
            value={gameSlug}
            onChange={(event) => {
              setGameSlug(event.target.value);
              setSelectedCardId("");
              setCardQuery("");
            }}
            disabled={games.length === 0}
          >
            {games.length === 0 && <option value="">読み込み中</option>}
            {games.map((game) => (
              <option key={game.id} value={game.slug}>
                {game.name}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="cardQuery">
          カード検索
          <input
            id="cardQuery"
            type="search"
            placeholder="カード名・収録番号で検索"
            value={cardQuery}
            onChange={(event) => {
              setCardQuery(event.target.value);
              setSelectedCardId("");
            }}
          />
        </label>

        <label htmlFor="cardId">
          カード
          <select
            id="cardId"
            value={selectedCardId}
            onChange={(event) => setSelectedCardId(event.target.value)}
            required
            disabled={searchingCards || cardOptions.length === 0}
          >
            <option value="">
              {searchingCards
                ? "検索中…"
                : cardOptions.length === 0
                  ? "対象カードがありません"
                  : "カードを選択"}
            </option>
            {cardOptions.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
                {card.card_number ? `（${card.card_number}）` : ""}
              </option>
            ))}
          </select>
        </label>
        {!searchingCards && cardOptions.length === 0 && (
          <p className="form-help">
            カードマスタに対象カードが未登録です。Supabase管理者へ追加を依頼してください。
          </p>
        )}

        <label htmlFor="shopName">
          ショップ名
          <input
            id="shopName"
            name="shopName"
            required
            placeholder="例：カードショップ○○"
          />
        </label>

        <div className="two">
          <label htmlFor="salePrice">
            販売価格
            <input
              id="salePrice"
              name="salePrice"
              type="number"
              min="0"
              inputMode="numeric"
            />
          </label>
          <label htmlFor="buyPrice">
            買取価格
            <input
              id="buyPrice"
              name="buyPrice"
              type="number"
              min="0"
              inputMode="numeric"
            />
          </label>
        </div>

        <label htmlFor="stockStatus">
          在庫状況
          <select id="stockStatus" name="stockStatus" defaultValue="unknown">
            {stockStatuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="observedOn">
          調査日
          <input
            id="observedOn"
            name="observedOn"
            type="date"
            defaultValue={observedOn}
            required
          />
        </label>

        <label htmlFor="contributorName">
          登録者名
          <input
            id="contributorName"
            name="contributorName"
            placeholder="任意のニックネーム"
          />
        </label>

        <label htmlFor="note">
          コメント
          <textarea id="note" name="note" rows={3} />
        </label>

        <label htmlFor="pin">
          登録PIN
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
          />
        </label>

        <button
          className="button"
          type="submit"
          disabled={submitting || !selectedCardId}
        >
          {submitting ? "登録中…" : "登録する"}
        </button>

        {feedback && (
          <p
            className={`notice ${feedback.kind}`}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.text}
          </p>
        )}
      </form>
    </section>
  );
}
