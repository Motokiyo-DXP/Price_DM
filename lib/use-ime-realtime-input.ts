"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, CompositionEvent, FormEvent } from "react";

/** Selection remains authoritative until the user returns to edit the input. */
export function createImeSelectionGuard() {
  let committed: string | null = null;
  return {
    commit(value: string) { committed = value; },
    resume() { committed = null; },
    accept(input: { value: string }) {
      if (committed === null) return true;
      input.value = committed;
      return false;
    },
  };
}

/** Controlled text input handlers that keep the visible value live during IME composition. */
export function useImeRealtimeInput(initialValue = "") {
  const [value, setValueState] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionGuard = useRef(createImeSelectionGuard());
  const onFocus = useCallback(() => selectionGuard.current.resume(), []);

  const setValue = useCallback((nextValue: string) => {
    if (valueRef.current === nextValue) return;
    valueRef.current = nextValue;
    setValueState(nextValue);
  }, []);

  // Also repair the DOM for native input events that React does not turn into change.
  const onInput = useCallback((event: FormEvent<HTMLInputElement>) => {
    selectionGuard.current.accept(event.currentTarget);
  }, []);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (!selectionGuard.current.accept(event.currentTarget)) return false;
    setValue(event.currentTarget.value);
    return true;
  }, [setValue]);

  const onCompositionStart = useCallback((_event: CompositionEvent<HTMLInputElement>) => {
    if (!selectionGuard.current.accept(_event.currentTarget)) return;
    composingRef.current = true;
  }, []);

  const onCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    // Keep the controlled value aligned with the final DOM value without rescheduling an unchanged query.
    if (!selectionGuard.current.accept(event.currentTarget)) return false;
    setValue(event.currentTarget.value);
    return true;
  }, [setValue]);

  const commitSelection = useCallback((nextValue: string) => {
    // Lock before blur: some engines dispatch compositionend synchronously from blur.
    selectionGuard.current.commit(nextValue);
    inputRef.current?.blur();
    composingRef.current = false;
    if (inputRef.current) inputRef.current.value = nextValue;
    setValue(nextValue);
  }, [setValue]);

  const isComposing = useCallback(() => composingRef.current, []);

  return { inputRef, onFocus, commitSelection, value, setValue, onInput, onChange, onCompositionStart, onCompositionEnd, isComposing };
}

export function isImeCompositionEnter(
  event: { key: string; nativeEvent: { isComposing?: boolean; keyCode?: number } },
  composing = false,
) {
  return event.key === "Enter" && (event.nativeEvent.isComposing === true || event.nativeEvent.keyCode === 229 || composing);
}
