"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { fitCardStage } from "@/lib/card-stage";

const CARD_STAGE_BASE_WIDTH = 500;
const CARD_STAGE_BASE_HEIGHT = 700;

export function CardVisualStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const [fit, setFit] = useState(() => fitCardStage(0, 0, CARD_STAGE_BASE_WIDTH, CARD_STAGE_BASE_HEIGHT));

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const bounds = viewport.getBoundingClientRect();
      const next = fitCardStage(bounds.width, bounds.height, CARD_STAGE_BASE_WIDTH, CARD_STAGE_BASE_HEIGHT);
      setFit((current) => current.scale === next.scale && current.width === next.width && current.height === next.height ? current : next);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <span className={`card-stage-viewport ${className}`.trim()} ref={viewportRef}>
      <span className="card-stage-slot" style={{ height: fit.height, width: fit.width }}>
        <span
          className="card-stage"
          data-card-scale={fit.scale}
          style={{ height: CARD_STAGE_BASE_HEIGHT, transform: `scale(${fit.scale})`, width: CARD_STAGE_BASE_WIDTH }}
        >
          {children}
        </span>
      </span>
    </span>
  );
}
