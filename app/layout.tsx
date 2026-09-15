import type { Metadata } from "next";
import Image from "next/image";
import { SiteNavigation } from "@/components/site-navigation";
import { PrimaryNavigation } from "@/components/primary-navigation";
import { NavigationProgress } from "@/components/navigation-progress";
import "./globals.css";

export const metadata: Metadata = { title: "TCG 相場チェッカー", description: "TCGカードの販売・買取相場を記録、比較するアプリ", icons: { icon: "/logo-dmsoba-naname.svg", shortcut: "/logo-dmsoba-naname.svg", apple: "/logo-dmsoba-naname.svg" } };

const cardImageBaseUrl = process.env.NEXT_PUBLIC_CARD_IMAGE_BASE_URL;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      {cardImageBaseUrl ? (
        <head>
          <link rel="preconnect" href={cardImageBaseUrl} crossOrigin="anonymous" />
        </head>
      ) : null}
      <body>
        <NavigationProgress />
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
          <SiteNavigation />
        </header>
        <PrimaryNavigation />
        <main>{children}</main>
      </body>
    </html>
  );
}
