"use client";

import { useState } from "react";
import { resolveCardArtworkUrl } from "@/lib/card-image";
import { getCardArtworkOrientation } from "@/lib/card-artwork-orientation";

export function CardArtwork({
  imageUrl,
  name,
  className = "",
  sizes,
  eager = false,
  fit = "contain",
}: {
  imageUrl: string | null;
  name: string;
  className?: string;
  sizes: string;
  eager?: boolean;
  fit?: "contain" | "cover";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const orientation = getCardArtworkOrientation(imageUrl);
  if (!imageUrl || failedUrl === imageUrl) return <span aria-label={`${name}（画像未登録）`} className={`card-artwork card-artwork-placeholder ${className}`} style={{ backgroundImage: "url(/card-back.svg)" }}><img alt="" draggable={false} src="/card-back.svg" /></span>;
  const artwork = <img alt={name} decoding="async" draggable={false} fetchPriority={eager ? "high" : "auto"} loading={eager ? "eager" : "lazy"} onError={() => setFailedUrl(imageUrl)} sizes={sizes} src={resolveCardArtworkUrl(imageUrl)} style={{ display: "block", height: "100%", width: "100%", opacity: 1, objectFit: orientation ? "contain" : fit }} />;
  return (
    <span aria-label={orientation ? name : undefined} role={orientation ? "img" : undefined} className={`card-artwork ${className}`} data-artwork-rotation={orientation?.rotation ?? 0}>
      {orientation ? <svg aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet" style={{ display: "block", height: "100%", width: "100%", overflow: "visible" }} viewBox={`0 0 ${orientation.height} ${orientation.width}`}>
        <foreignObject height={orientation.height} width={orientation.width} transform={`translate(${orientation.height} 0) rotate(90)`}>
          {artwork}
        </foreignObject>
      </svg> : artwork}
    </span>
  );
}
