"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getVisiblePrimaryNavigationPath } from "@/lib/primary-navigation";

const destinations = [
  { href: "/deck-search", label: "デッキ検索", icon: "/navigation/deck-search.svg" },
  { href: "/decks", label: "マイデッキ", icon: "/navigation/solo-play.svg" },
  { href: "/", label: "ホーム", icon: "/navigation/home.svg" },
  { href: "/solo", label: "ひとり回し", icon: "/navigation/my-decks.svg" },
  { href: "/rooms", label: "オンライン", icon: "/navigation/online.svg" },
] as const;

export function PrimaryNavigation() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activePath = getVisiblePrimaryNavigationPath(pathname, mounted);
  if (activePath === null) return null;

  return (
    <nav aria-label="主要ページ" className="primary-navigation">
      {destinations.map(({ href, label, icon }) => (
        <Link aria-current={activePath === href ? "page" : undefined} href={href} key={href}>
          <Image alt="" aria-hidden="true" height={26} src={icon} width={26} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
