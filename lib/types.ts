import type { Database } from "./database.types";

export type Trend = "up" | "down" | "same" | "unknown";
export type StockStatus = Database["public"]["Enums"]["stock_status"];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: "在庫あり",
  low_stock: "残りわずか",
  out_of_stock: "売り切れ",
  unknown: "不明",
  buying: "買取中",
  buying_paused: "買取停止",
};

export type CardSummary = {
  id: string;
  game: string;
  name: string;
  nameKana?: string;
  aliases: string[];
  setCode?: string;
  productName?: string;
  salePrice: number | null;
  buyPrice: number | null;
  saleTrend: Trend;
  buyTrend: Trend;
  stock: string;
  updatedAt: string | null;
  isStale: boolean;
  shopName?: string;
};
