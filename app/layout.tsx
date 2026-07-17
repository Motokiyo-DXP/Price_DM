import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "TCG 相場チェッカー", description: "TCGカードの販売・買取相場を記録、比較するアプリ" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body><header><a href="/">TCG 相場チェッカー</a><a className="button compact" href="/register">＋ 価格を登録</a></header><main>{children}</main></body></html>;
}
