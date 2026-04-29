"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentInput } from "@/lib/commentator";

export type CoachStatus = "idle" | "streaming" | "done" | "error";

/** Має збігатися з `COACH_ERROR_TAG` у `app/api/coach/route.ts`. */
const COACH_ERROR_TAG = "\u001f[COACH_ERROR]\u001f";

export type UseChessCoachReturn = {
  text: string;
  status: CoachStatus;
  error: string | null;
  ask: (input: CommentInput) => Promise<void>;
  cancel: () => void;
  reset: () => void;
};

export function useChessCoach(): UseChessCoachReturn {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<CoachStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const ask = useCallback(async (input: CommentInput) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText("");
    setError(null);
    setStatus("streaming");

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("Порожня відповідь сервера");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let errored = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const piece = decoder.decode(value, { stream: true });
        if (!piece) continue;
        buffer += piece;

        const tagIdx = buffer.indexOf(COACH_ERROR_TAG);
        if (tagIdx >= 0) {
          const before = buffer.slice(0, tagIdx).replace(/\s+$/, "");
          const message = buffer
            .slice(tagIdx + COACH_ERROR_TAG.length)
            .trim();
          setText(before);
          setError(message || "Невідома помилка коментатора");
          setStatus("error");
          errored = true;
          break;
        }

        // Притримуємо хвіст ТІЛЬКИ якщо він починається з префіксу сентінела
        // (`\u001f`). У звичайному тексті цього байта не буває, тому в 99%
        // випадків публікуємо весь буфер одразу й уникаємо мерехтіння в UI.
        const sentinelHead = COACH_ERROR_TAG.charAt(0);
        const lastSentinelStart = buffer.lastIndexOf(sentinelHead);
        const looksLikePrefix =
          lastSentinelStart >= 0 &&
          buffer.length - lastSentinelStart < COACH_ERROR_TAG.length &&
          COACH_ERROR_TAG.startsWith(buffer.slice(lastSentinelStart));
        const visible = looksLikePrefix
          ? buffer.slice(0, lastSentinelStart)
          : buffer;
        setText(visible);
      }

      if (!errored) {
        setText(buffer);
        setStatus("done");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      const message = err instanceof Error ? err.message : "Невідома помилка";
      setError(message);
      setStatus("error");
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setText("");
    setError(null);
    setStatus("idle");
  }, []);

  return { text, status, error, ask, cancel, reset };
}
