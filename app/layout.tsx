import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = { title: "TCG 相場チェッカー", description: "TCGカードの販売・買取相場を記録、比較するアプリ" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <a className="site-logo" href="/" aria-label="TCG相場チェッカー ホーム">
            <Image
              src="/logo-dmsoba.svg"
              alt="TCG相場チェッカー"
              width={280}
              height={48}
              priority
            />
          </a>
          <nav className="header-links" aria-label="主要メニュー">
            <a href="/decks"><span aria-hidden="true">▤</span> マイデッキ</a>
            <a href="/rooms"><span aria-hidden="true">⚔</span> オンライン対戦</a>
            <a href="/admin"><span aria-hidden="true">▣</span> 管理者</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
