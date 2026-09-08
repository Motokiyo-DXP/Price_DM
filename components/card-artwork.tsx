"use client";

import { useState } from "react";
import { resolveCardArtworkUrl } from "@/lib/card-image";

export function CardArtwork({
  imageUrl,
  name,
  className = "",
  sizes,
  eager = false,
}: {
  imageUrl: string | null;
  name: string;
  className?: string;
  sizes: string;
  eager?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!imageUrl || failedUrl === imageUrl) return <span aria-label={`${name}（画像未登録）`} className={`card-artwork card-artwork-placeholder ${className}`} style={{ backgroundImage: "url(/card-back.svg)" }}><img alt="" draggable={false} src="/card-back.svg" /></span>;
  return (
    <span className={`card-artwork ${className}`} >
      <img alt={name} decoding="async" draggable={false} fetchPriority={eager ? "high" : "auto"} loading={eager ? "eager" : "lazy"} onError={() => setFailedUrl(imageUrl)} sizes={sizes} src={resolveCardArtworkUrl(imageUrl)} style={{ display: "block", height: "100%", width: "100%", opacity: 1, objectFit: "contain" }} />
    </span>
  );
}
