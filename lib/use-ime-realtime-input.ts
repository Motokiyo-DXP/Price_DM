"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, CompositionEvent } from "react";

/** Controlled text input handlers that keep the visible value live during IME composition. */
export function useImeRealtimeInput(initialValue = "") {
  const [value, setValueState] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const composingRef = useRef(false);

  const setValue = useCallback((nextValue: string) => {
    if (valueRef.current === nextValue) return;
    valueRef.current = nextValue;
    setValueState(nextValue);
  }, []);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.currentTarget.value);
  }, [setValue]);

  const onCompositionStart = useCallback((_event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    // Keep the controlled value aligned with the final DOM value without rescheduling an unchanged query.
    setValue(event.currentTarget.value);
  }, [setValue]);

  const isComposing = useCallback(() => composingRef.current, []);

  return { value, setValue, onChange, onCompositionStart, onCompositionEnd, isComposing };
}

export function isImeCompositionEnter(
  event: { key: string; nativeEvent: { isComposing?: boolean; keyCode?: number } },
  composing = false,
) {
  return event.key === "Enter" && (event.nativeEvent.isComposing === true || event.nativeEvent.keyCode === 229 || composing);
}
