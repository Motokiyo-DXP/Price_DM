"use client";

import { useEffect, useState } from "react";

export function PrimaryPageLoading({ title }: { title: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 600);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <section aria-busy="true" aria-labelledby="primary-page-loading-title" className="primary-page-loading">
      <h1 className="visually-hidden" id="primary-page-loading-title">{title}を読み込み中</h1>
      <svg aria-hidden="true" className="primary-page-loading-mark" viewBox="0 0 360 420">
        <g className="primary-page-loading-arrows">
          <path d="M197 37V9l-65 43 65 38V66c33 4 63 19 86 41 26 26 42 62 42 102h29c0-90-69-164-157-172Z" />
          <path d="M167 350c-72-7-129-67-130-141l-29 .4c1 90 71 163 159 170l.4 28 64-44-65-37 .3 24Z" />
        </g>
        <image className="primary-page-loading-card" href="/logo-dmsoba-naname.svg" height="141" width="115" x="122.5" y="139.5" />
      </svg>
      <p role="status">読み込み中…</p>
    </section>
  );
}
