"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Database, Json } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { STOCK_STATUS_LABELS, StockStatus } from "@/lib/types";

type Game = Database["public"]["Tables"]["tcg_games"]["Row"];
type CardOption =
  Database["public"]["Functions"]["search_canonical_cards"]["Returns"][number];
type CardPrintOption =
  Database["public"]["Functions"]["list_card_prints"]["Returns"][number];
type ShopOption =
  Database["public"]["Functions"]["search_shops"]["Returns"][number];
type SearchMode = "broad" | "precise";
type PinSessionState = "checking" | "required" | "authenticated";

type Feedback = {
  kind: "error" | "success";
  text: string;
};

type RegistrationSessionResult = {
  status: "ok" | "invalid_pin" | "rate_limited" | "not_configured";
  session_token?: string;
  expires_at?: string;
};

type ShopCandidateResult = {
  status: "pending" | "already_approved";
  candidate_id?: number;
  shop_id?: number;
};

const stockStatuses = Object.entries(STOCK_STATUS_LABELS) as [
  StockStatus,
  string,
][];

const priceAttributes = [
  { slug: "normal", name: "通常価格" },
  { slug: "damaged", name: "傷あり" },
  { slug: "special_price", name: "特価" },
  { slug: "storage", name: "ストレージ" },
  { slug: "special_storage", name: "特価ストレージ" },
] as const;

function todayForDateInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePriceInput(value: string) {
  return value.normalize("NFKC").replace(/[^0-9]/g, "").slice(0, 9);
}

function isSessionResult(value: Json): value is RegistrationSessionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.status === "string"
  );
}
function registrationErrorMessage(code: string) {
  const messages: Record<string, string> = {
    card_required: "カードを選択してください。",
    invalid_date: "調査日を確認してください。",
    invalid_price: "価格には0以上の整数を入力してください。",
    invalid_request: "入力内容を確認してください。",
    invalid_shop: "ショップ名を入力してください。",
    invalid_website_url: "公式サイトは http:// または https:// から入力してください。",
    invalid_stock_status: "在庫状況を選び直してください。",
    price_required: "販売価格または買取価格のどちらかを入力してください。",
    rate_limited: "登録回数の上限に達しました。時間をおいて再度お試しください。",
    registration_failed: "登録できませんでした。入力内容を確認してください。",
    service_unavailable: "接続情報を確認できませんでした。時間をおいて再度お試しください。",
    session_required: "登録PINの有効時間が切れました。もう一度入力してください。",
    too_long: "入力内容が長すぎます。文字数を減らしてください。",
  };
  return messages[code] ?? "登録できませんでした。時間をおいて再度お試しください。";
}

export default function RegisterPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [gameSlug, setGameSlug] = useState("duel-masters");
  const [cardQuery, setCardQuery] = useState("");
  const [cardOptions, setCardOptions] = useState<CardOption[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardOption | null>(null);
  const [cardPrints, setCardPrints] = useState<CardPrintOption[]>([]);
  const [selectedPrintId, setSelectedPrintId] = useState("");
  const [loadingPrints, setLoadingPrints] = useState(false);
  const [shopQuery, setShopQuery] = useState("");
  const [shopOptions, setShopOptions] = useState<ShopOption[]>([]);
  const [selectedShop, setSelectedShop] = useState<ShopOption | null>(null);
  const [searchingShops, setSearchingShops] = useState(false);
  const [shopSuggestionsOpen, setShopSuggestionsOpen] = useState(false);
  const [activeShopOptionIndex, setActiveShopOptionIndex] = useState(-1);
  const [candidateSubmitting, setCandidateSubmitting] = useState(false);
  const [candidateFeedback, setCandidateFeedback] = useState<Feedback | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("broad");
  const [searchingCards, setSearchingCards] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1);
  const [pinSessionState, setPinSessionState] =
    useState<PinSessionState>("checking");
  const [pinExpiresAt, setPinExpiresAt] = useState<string | null>(null);
  const [salePriceInput, setSalePriceInput] = useState("");
  const [buyPriceInput, setBuyPriceInput] = useState("");
  const salePriceIsComposing = useRef(false);
  const buyPriceIsComposing = useRef(false);
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

    async function checkPinSession() {
      try {
        const response = await fetch("/api/registration-session", {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          authenticated?: boolean;
          expiresAt?: string;
        };
        if (cancelled) return;
        setPinSessionState(result.authenticated ? "authenticated" : "required");
        setPinExpiresAt(result.expiresAt ?? null);
      } catch {
        if (!cancelled) setPinSessionState("required");
      }
    }

    void loadGames();
    void checkPinSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const query = cardQuery.trim();

    if (!gameSlug || query.length === 0) {
      setCardOptions([]);
      setSearchingCards(false);
      setActiveOptionIndex(-1);
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

      const { data, error } = await supabase.rpc("search_canonical_cards", {
        p_game_slug: gameSlug,
        p_limit: 30,
        p_mode: searchMode,
        p_query: query,
      });

      if (cancelled) return;
      setSearchingCards(false);
      if (error) {
        setSystemError("カード候補を読み込めませんでした。");
        return;
      }

      setSystemError(null);
      setCardOptions(data ?? []);
      setActiveOptionIndex(-1);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cardQuery, gameSlug, searchMode]);

  useEffect(() => {
    let cancelled = false;
    const query = shopQuery.trim();

    if (query.length === 0 || selectedShop) {
      setShopOptions([]);
      setSearchingShops(false);
      setActiveShopOptionIndex(-1);
      return;
    }

    setSearchingShops(true);
    const timer = window.setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      if (!supabase) {
        setSystemError("Supabase の接続情報が設定されていません。");
        setSearchingShops(false);
        return;
      }

      const { data, error } = await supabase.rpc("search_shops", {
        p_limit: 20,
        p_query: query,
      });

      if (cancelled) return;
      setSearchingShops(false);
      if (error) {
        setSystemError("承認済み店舗を読み込めませんでした。");
        return;
      }

      setSystemError(null);
      setShopOptions(data ?? []);
      setActiveShopOptionIndex(-1);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedShop, shopQuery]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedCard) {
      setCardPrints([]);
      setSelectedPrintId("");
      setLoadingPrints(false);
      return;
    }

    setLoadingPrints(true);
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setLoadingPrints(false);
      return;
    }

    void supabase
      .rpc("list_card_prints", { p_canonical_card_id: selectedCard.id })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingPrints(false);
        if (error) {
          setSystemError("収録版を読み込めませんでした。");
          return;
        }
        setCardPrints(data ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCard]);

  function chooseCard(card: CardOption) {
    setSelectedCard(card);
    setCardQuery(card.name);
    setSuggestionsOpen(false);
  }

  function chooseShop(shop: ShopOption) {
    setSelectedShop(shop);
    setShopQuery(shop.name);
    setShopSuggestionsOpen(false);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      return;
    }
    if (cardOptions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveOptionIndex((current) => (current + 1) % cardOptions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestionsOpen(true);
      setActiveOptionIndex(
        (current) =>
          current <= 0 ? cardOptions.length - 1 : current - 1,
      );
    } else if (
      event.key === "Enter" &&
      suggestionsOpen &&
      activeOptionIndex >= 0
    ) {
      event.preventDefault();
      chooseCard(cardOptions[activeOptionIndex]);
    }
  }

  function handleShopKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setShopSuggestionsOpen(false);
      return;
    }
    if (shopOptions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setShopSuggestionsOpen(true);
      setActiveShopOptionIndex(
        (current) => (current + 1) % shopOptions.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setShopSuggestionsOpen(true);
      setActiveShopOptionIndex((current) =>
        current <= 0 ? shopOptions.length - 1 : current - 1,
      );
    } else if (
      event.key === "Enter" &&
      shopSuggestionsOpen &&
      activeShopOptionIndex >= 0
    ) {
      event.preventDefault();
      chooseShop(shopOptions[activeShopOptionIndex]);
    }
  }

  async function establishPinSession(pin: string) {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return { ok: false, message: "接続情報を確認できませんでした。" };

    const { data, error } = await supabase.rpc("create_registration_session", {
      p_pin: pin,
    });
    if (error || !isSessionResult(data)) {
      return { ok: false, message: "登録PINを確認できませんでした。" };
    }
    if (data.status === "invalid_pin") {
      return { ok: false, message: "登録PINが違います。入力内容を確認してください。" };
    }
    if (data.status === "rate_limited") {
      return {
        ok: false,
        message: "PINの確認回数が上限に達しました。15分ほど待ってください。",
      };
    }
    if (data.status === "not_configured") {
      return { ok: false, message: "登録PINがまだ設定されていません。" };
    }
    if (!data.session_token) {
      return { ok: false, message: "登録PINを確認できませんでした。" };
    }

    const response = await fetch("/api/registration-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: data.session_token }),
    });
    if (!response.ok) {
      return { ok: false, message: "登録PINの保持設定に失敗しました。" };
    }

    const result = (await response.json()) as { expiresAt?: string };
    setPinSessionState("authenticated");
    setPinExpiresAt(result.expiresAt ?? data.expires_at ?? null);
    return { ok: true, message: "" };
  }

  async function clearPinSession() {
    await fetch("/api/registration-session", { method: "DELETE" });
    setPinSessionState("required");
    setPinExpiresAt(null);
  }

  async function ensureRegistrationSession(formData: FormData) {
    if (pinSessionState === "authenticated") {
      return { ok: true, message: "" };
    }

    const pin = String(formData.get("password") ?? "");
    if (!pin) {
      return { ok: false, message: "登録PINを入力してください。" };
    }
    return establishPinSession(pin);
  }

  async function submitShopCandidate(form: HTMLFormElement) {
    const formData = new FormData(form);
    const name = String(formData.get("candidateName") ?? "").trim();

    setCandidateFeedback(null);
    if (!name) {
      setCandidateFeedback({ kind: "error", text: "候補の店舗名を入力してください。" });
      return;
    }

    setCandidateSubmitting(true);
    const sessionResult = await ensureRegistrationSession(formData);
    if (!sessionResult.ok) {
      setCandidateSubmitting(false);
      setCandidateFeedback({ kind: "error", text: sessionResult.message });
      return;
    }

    const response = await fetch("/api/shop-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addressLine: String(formData.get("candidateAddressLine") ?? ""),
        municipality: String(formData.get("candidateMunicipality") ?? ""),
        name,
        prefecture: String(formData.get("candidatePrefecture") ?? ""),
        websiteUrl: String(formData.get("candidateWebsiteUrl") ?? ""),
      }),
    });
    const result = (await response.json()) as ShopCandidateResult & {
      error?: string;
    };
    setCandidateSubmitting(false);

    if (!response.ok) {
      if (result.error === "session_required") {
        setPinSessionState("required");
        setPinExpiresAt(null);
      }
      setCandidateFeedback({
        kind: "error",
        text: registrationErrorMessage(result.error ?? "registration_failed"),
      });
      return;
    }

    if (result.status === "already_approved") {
      setShopQuery(name);
      setSelectedShop(null);
      setShopSuggestionsOpen(true);
      setCandidateFeedback({
        kind: "success",
        text: "この店舗は承認済みです。上の検索候補から選択してください。",
      });
      return;
    }

    setCandidateFeedback({
      kind: "success",
      text: "店舗候補を送信しました。承認後に価格登録で選択できるようになります。",
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const salePrice = normalizePriceInput(salePriceInput);
    const buyPrice = normalizePriceInput(buyPriceInput);

    setFeedback(null);
    if (!selectedCard) {
      setFeedback({ kind: "error", text: "候補からカードを選択してください。" });
      return;
    }
    if (!selectedShop) {
      setFeedback({
        kind: "error",
        text: "承認済み店舗を検索候補から選択してください。",
      });
      return;
    }
    if (!salePrice && !buyPrice) {
      setFeedback({
        kind: "error",
        text: "販売価格または買取価格のどちらかを入力してください。",
      });
      return;
    }

    setSubmitting(true);
    const sessionResult = await ensureRegistrationSession(formData);
    if (!sessionResult.ok) {
      setSubmitting(false);
      setFeedback({ kind: "error", text: sessionResult.message });
      return;
    }

    const response = await fetch("/api/price-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attributeSlugs: formData.getAll("attributeSlug").map(String),
        buyPrice: buyPrice ? Number(buyPrice) : null,
        canonicalCardId: selectedCard.id,
        cardPrintId: selectedPrintId ? Number(selectedPrintId) : null,
        contributorName: String(formData.get("contributorName") ?? ""),
        note: String(formData.get("note") ?? ""),
        observedOn: String(formData.get("observedOn") ?? ""),
        salePrice: salePrice ? Number(salePrice) : null,
        shopId: selectedShop.id,
        stockStatus: String(formData.get("stockStatus") ?? "unknown"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setSubmitting(false);

    if (!response.ok) {
      if (result.error === "session_required") {
        setPinSessionState("required");
        setPinExpiresAt(null);
      }
      setFeedback({
        kind: "error",
        text: registrationErrorMessage(result.error ?? "registration_failed"),
      });
      return;
    }

    form.reset();
    setCardQuery("");
    setCardOptions([]);
    setSelectedCard(null);
    setCardPrints([]);
    setSelectedPrintId("");
    setSuggestionsOpen(false);
    setShopQuery("");
    setShopOptions([]);
    setSelectedShop(null);
    setShopSuggestionsOpen(false);
    setSalePriceInput("");
    setBuyPriceInput("");
    setFeedback({ kind: "success", text: "価格情報を登録しました。" });
  }

  const showSuggestions =
    suggestionsOpen && cardQuery.trim().length > 0 && !selectedCard;
  const activeOption = cardOptions[activeOptionIndex];
  const showShopSuggestions =
    shopSuggestionsOpen && shopQuery.trim().length > 0 && !selectedShop;
  const activeShopOption = shopOptions[activeShopOptionIndex];

  return (
    <section className="form-wrap">
      <a href="/">← 一覧へ戻る</a>
      <h1>価格を登録</h1>
      <p className="form-intro">
        カード名を入力して候補から選び、確認した価格を共有します。
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
              setSelectedCard(null);
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

        <fieldset className="search-mode">
          <legend>検索の厳しさ</legend>
          <label>
            <input
              type="radio"
              name="searchMode"
              value="broad"
              checked={searchMode === "broad"}
              onChange={() => {
                setSearchMode("broad");
                setSelectedCard(null);
              }}
            />
            ざっくり検索 <small>目安60%</small>
          </label>
          <label>
            <input
              type="radio"
              name="searchMode"
              value="precise"
              checked={searchMode === "precise"}
              onChange={() => {
                setSearchMode("precise");
                setSelectedCard(null);
              }}
            />
            パーペキ検索 <small>目安90%</small>
          </label>
        </fieldset>

        <div
          className="card-combobox"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setSuggestionsOpen(false);
            }
          }}
        >
          <label htmlFor="cardQuery">カード</label>
          <input
            id="cardQuery"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="card-suggestions"
            aria-expanded={showSuggestions}
            aria-activedescendant={
              showSuggestions && activeOption
                ? `card-option-${activeOption.id}`
                : undefined
            }
            placeholder="カード名・読み・別名・収録番号で検索"
            value={cardQuery}
            onFocus={() => setSuggestionsOpen(true)}
            onKeyDown={handleCardKeyDown}
            onChange={(event) => {
              setCardQuery(event.target.value);
              setSelectedCard(null);
              setSuggestionsOpen(true);
            }}
            required
          />

          {showSuggestions && (
            <ul className="suggestions" id="card-suggestions" role="listbox">
              {searchingCards && <li className="suggestion-status">検索中…</li>}
              {!searchingCards && cardOptions.length === 0 && (
                <li className="suggestion-status">一致するカードがありません</li>
              )}
              {!searchingCards &&
                cardOptions.map((card, index) => (
                  <li
                    id={`card-option-${card.id}`}
                    className={index === activeOptionIndex ? "active" : ""}
                    key={card.id}
                    role="option"
                    aria-selected={index === activeOptionIndex}
                    onMouseEnter={() => setActiveOptionIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseCard(card);
                    }}
                  >
                    <strong>{card.name}</strong>
                    <small>{card.print_count}件の収録版</small>
                  </li>
                ))}
            </ul>
          )}
          {selectedCard && (
            <p className="selected-card" role="status">
              選択中：{selectedCard.name}
            </p>
          )}
          <p className="form-help">
            ひらがな・カタカナ・漢字、中点「・」の有無、登録済みの別名で検索できます。
          </p>
        </div>

        {selectedCard && (
          <label htmlFor="cardPrintId">
            収録版
            <select
              id="cardPrintId"
              name="cardPrintId"
              value={selectedPrintId}
              onChange={(event) => setSelectedPrintId(event.target.value)}
              disabled={loadingPrints}
            >
              <option value="">
                {loadingPrints ? "収録版を読み込み中…" : "収録版を定めない（推奨）"}
              </option>
              {cardPrints.map((cardPrint) => (
                <option key={cardPrint.id} value={cardPrint.id}>
                  {[cardPrint.card_number, cardPrint.product_name]
                    .filter(Boolean)
                    .join("｜") || `収録版 #${cardPrint.id}`}
                </option>
              ))}
            </select>
            <small className="form-help">
              通常は「収録版を定めない」のままで登録できます。版を区別したい場合だけ選択してください。
            </small>
          </label>
        )}

        <fieldset className="attribute-options">
          <legend>価格の属性（指定しないが標準）</legend>
          <p className="form-help">
            傷あり・特価・ストレージなど、注意が必要な場合だけ選択してください。
          </p>
          <div className="attribute-grid">
            {priceAttributes.map((attribute) => (
              <label key={attribute.slug}>
                <input
                  type="checkbox"
                  name="attributeSlug"
                  value={attribute.slug}
                />
                {attribute.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div
          className="card-combobox shop-combobox"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setShopSuggestionsOpen(false);
            }
          }}
        >
          <label htmlFor="shopQuery">承認済み店舗</label>
          <input
            id="shopQuery"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="shop-suggestions"
            aria-expanded={showShopSuggestions}
            aria-activedescendant={
              showShopSuggestions && activeShopOption
                ? `shop-option-${activeShopOption.id}`
                : undefined
            }
            placeholder="店舗名を入力して候補から選択"
            value={shopQuery}
            onFocus={() => setShopSuggestionsOpen(true)}
            onKeyDown={handleShopKeyDown}
            onChange={(event) => {
              setShopQuery(event.target.value);
              setSelectedShop(null);
              setShopSuggestionsOpen(true);
            }}
            required
          />

          {showShopSuggestions && (
            <ul className="suggestions" id="shop-suggestions" role="listbox">
              {searchingShops && <li className="suggestion-status">検索中…</li>}
              {!searchingShops && shopOptions.length === 0 && (
                <li className="suggestion-status">
                  一致する承認済み店舗がありません
                </li>
              )}
              {!searchingShops &&
                shopOptions.map((shop, index) => (
                  <li
                    id={`shop-option-${shop.id}`}
                    className={index === activeShopOptionIndex ? "active" : ""}
                    key={shop.id}
                    role="option"
                    aria-selected={index === activeShopOptionIndex}
                    onMouseEnter={() => setActiveShopOptionIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseShop(shop);
                    }}
                  >
                    <strong>{shop.name}</strong>
                  </li>
                ))}
            </ul>
          )}
          {selectedShop && (
            <p className="selected-card" role="status">
              選択中：{selectedShop.name}
            </p>
          )}
          <p className="form-help">
            価格情報は、承認済み店舗を候補から選択した場合だけ登録できます。
          </p>
        </div>

        <details className="shop-candidate-panel">
          <summary>店舗が見つからない場合：候補を申請</summary>
          <p className="form-help">
            店舗情報を確認してから承認します。申請中は価格登録に使用できません。
          </p>
          <label htmlFor="candidateName">
            店舗名
            <input
              id="candidateName"
              name="candidateName"
              maxLength={200}
              placeholder="例：カードショップ○○"
            />
          </label>
          <div className="two">
            <label htmlFor="candidatePrefecture">
              都道府県
              <input
                id="candidatePrefecture"
                name="candidatePrefecture"
                maxLength={20}
                placeholder="例：東京都"
              />
            </label>
            <label htmlFor="candidateMunicipality">
              市区町村
              <input
                id="candidateMunicipality"
                name="candidateMunicipality"
                maxLength={100}
                placeholder="例：千代田区"
              />
            </label>
          </div>
          <label htmlFor="candidateAddressLine">
            住所の続き
            <input
              id="candidateAddressLine"
              name="candidateAddressLine"
              maxLength={300}
              placeholder="町名・番地・建物名"
            />
          </label>
          <label htmlFor="candidateWebsiteUrl">
            公式サイト
            <input
              id="candidateWebsiteUrl"
              name="candidateWebsiteUrl"
              type="url"
              maxLength={500}
              placeholder="https://example.com/shop"
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={candidateSubmitting || pinSessionState === "checking"}
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form) void submitShopCandidate(form);
            }}
          >
            {candidateSubmitting ? "候補を送信中…" : "店舗候補を送信"}
          </button>
          {candidateFeedback && (
            <p
              className={`notice ${candidateFeedback.kind}`}
              role={candidateFeedback.kind === "error" ? "alert" : "status"}
            >
              {candidateFeedback.text}
            </p>
          )}
        </details>

        <div className="two">
          <label htmlFor="salePrice">
            販売価格
            <input
              id="salePrice"
              name="salePrice"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={9}
              value={salePriceInput}
              onCompositionStart={() => {
                salePriceIsComposing.current = true;
              }}
              onCompositionEnd={(event) => {
                salePriceIsComposing.current = false;
                setSalePriceInput(normalizePriceInput(event.currentTarget.value));
              }}
              onChange={(event) => {
                setSalePriceInput(
                  salePriceIsComposing.current
                    ? event.target.value
                    : normalizePriceInput(event.target.value),
                );
              }}
              placeholder="半角・全角どちらでも入力できます"
            />
          </label>
          <label htmlFor="buyPrice">
            買取価格
            <input
              id="buyPrice"
              name="buyPrice"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={9}
              value={buyPriceInput}
              onCompositionStart={() => {
                buyPriceIsComposing.current = true;
              }}
              onCompositionEnd={(event) => {
                buyPriceIsComposing.current = false;
                setBuyPriceInput(normalizePriceInput(event.currentTarget.value));
              }}
              onChange={(event) => {
                setBuyPriceInput(
                  buyPriceIsComposing.current
                    ? event.target.value
                    : normalizePriceInput(event.target.value),
                );
              }}
              placeholder="半角・全角どちらでも入力できます"
            />
          </label>
        </div>

        <label htmlFor="stockStatus">
          在庫状況
          <select id="stockStatus" name="stockStatus" defaultValue="unknown">
            {stockStatuses.map(([value, label]) => (
              <option key={value} value={value}>
                {value === "unknown" ? "指定しない" : label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor="observedOn">
          調査日
          <input id="observedOn" name="observedOn" type="date" defaultValue={observedOn} required />
        </label>

        <label htmlFor="contributorName">
          登録者名
          <input id="contributorName" name="contributorName" placeholder="任意のニックネーム" />
        </label>

        <label htmlFor="note">
          コメント
          <textarea id="note" name="note" rows={3} />
        </label>

        {pinSessionState === "checking" && (
          <p className="pin-status">登録PINの認証状態を確認中…</p>
        )}
        {pinSessionState === "authenticated" && (
          <div className="pin-status authenticated">
            <span>
              登録PINは認証済みです
              {pinExpiresAt
                ? `（${new Date(pinExpiresAt).toLocaleString("ja-JP", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}まで）`
                : "（14日間有効）"}
            </span>
            <button type="button" onClick={() => void clearPinSession()}>
              認証を解除
            </button>
          </div>
        )}
        {pinSessionState === "required" && (
          <>
            <label className="visually-hidden" htmlFor="sharedPinUsername">
              ユーザー名
              <input
                id="sharedPinUsername"
                name="username"
                autoComplete="username"
                value="TCG 相場チェッカー"
                readOnly
                tabIndex={-1}
              />
            </label>
            <label htmlFor="registrationPin">
              登録PIN
              <input
                id="registrationPin"
                name="password"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
              />
              <small className="form-help">一度認証すると、この端末では14日間入力を省略できます。</small>
            </label>
          </>
        )}

        <button
          className="button"
          type="submit"
          disabled={
            submitting ||
            pinSessionState === "checking" ||
            !selectedCard ||
            !selectedShop
          }
        >
          {submitting ? "登録中…" : "登録する"}
        </button>

        {feedback && (
          <p className={`notice ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
            {feedback.text}
          </p>
        )}
      </form>
    </section>
  );
}
