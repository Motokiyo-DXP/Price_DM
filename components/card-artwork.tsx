"use client";

import Image from "next/image";
import { useState } from "react";

export function CardArtwork({
  imageUrl,
  name,
  className = "",
  sizes,
}: {
  imageUrl: string | null;
  name: string;
  className?: string;
  sizes: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!imageUrl || failedUrl === imageUrl) return <span aria-label={`${name}（画像未登録）`} className={`card-artwork-placeholder ${className}`}>DM</span>;
  return (
    <span className={`card-artwork ${className}`}>
      <Image alt={name} fill onError={() => setFailedUrl(imageUrl)} sizes={sizes} src={imageUrl} unoptimized />
    </span>
  );
}
