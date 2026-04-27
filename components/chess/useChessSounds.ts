"use client";

import { useCallback, useEffect, useRef } from "react";

export type ChessSound =
  | "move"
  | "capture"
  | "check"
  | "castle"
  | "gameEnd"
  | "mate";

/** Шляхи до mp3 у `public/sounds/` (за замовчуванням — ваші файли). */
export type ChessSoundUrls = {
  move?: string;
  mate?: string;
};

const DEFAULT_URLS: ChessSoundUrls = {
  move: "/sounds/move.mp3",
  mate: "/sounds/final-move.mp3",
};

type ToneSpec = {
  frequency: number;
  type?: OscillatorType;
  duration: number;
  delay?: number;
  gain?: number;
};

const SYNTH_PRESETS: Record<Exclude<ChessSound, "move" | "mate">, ToneSpec[]> = {
  capture: [
    { frequency: 220, type: "triangle", duration: 0.07, gain: 0.22 },
    { frequency: 140, type: "triangle", duration: 0.12, delay: 0.04, gain: 0.18 },
  ],
  check: [
    { frequency: 880, type: "square", duration: 0.06, gain: 0.16 },
    { frequency: 880, type: "square", duration: 0.06, delay: 0.1, gain: 0.16 },
  ],
  castle: [
    { frequency: 392, type: "sine", duration: 0.08, gain: 0.18 },
    { frequency: 587, type: "sine", duration: 0.1, delay: 0.06, gain: 0.18 },
  ],
  gameEnd: [
    { frequency: 660, type: "triangle", duration: 0.12, gain: 0.2 },
    { frequency: 523, type: "triangle", duration: 0.12, delay: 0.1, gain: 0.2 },
    { frequency: 392, type: "triangle", duration: 0.18, delay: 0.2, gain: 0.2 },
  ],
};

function playSample(
  ctx: AudioContext,
  presets: ToneSpec[],
  startOffset: number,
) {
  const now = ctx.currentTime + startOffset;
  for (const tone of presets) {
    const start = now + (tone.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.value = tone.frequency;
    const peak = tone.gain ?? 0.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }
}

/**
 * Звуки: `move` і `mate` — з файлів у `public/sounds/`, решта — синтез Web Audio.
 * Перший виклик ініціалізує `AudioContext` / відтворення після взаємодії користувача.
 */
export function useChessSounds(
  enabled: boolean = true,
  urls?: ChessSoundUrls,
) {
  const moveSrc = urls?.move ?? DEFAULT_URLS.move;
  const mateSrc = urls?.mate ?? DEFAULT_URLS.mate;

  const ctxRef = useRef<AudioContext | null>(null);
  const moveAudioRef = useRef<HTMLAudioElement | null>(null);
  const mateAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (moveSrc) {
      const a = new Audio(moveSrc);
      a.preload = "auto";
      moveAudioRef.current = a;
    } else {
      moveAudioRef.current = null;
    }
    if (mateSrc) {
      const a = new Audio(mateSrc);
      a.preload = "auto";
      mateAudioRef.current = a;
    } else {
      mateAudioRef.current = null;
    }
  }, [moveSrc, mateSrc]);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      moveAudioRef.current = null;
      mateAudioRef.current = null;
    };
  }, []);

  const playSynth = useCallback(
    (sound: Exclude<ChessSound, "move" | "mate">) => {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = new AudioCtx();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      playSample(ctx, SYNTH_PRESETS[sound], 0);
    },
    [],
  );

  const tryPlayFile = useCallback((el: HTMLAudioElement | null): boolean => {
    if (!el) return false;
    try {
      el.currentTime = 0;
      el.play().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }, []);

  const play = useCallback(
    (sound: ChessSound) => {
      if (!enabled) return;
      if (typeof window === "undefined") return;

      if (sound === "move") {
        if (tryPlayFile(moveAudioRef.current)) return;
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) return;
        let ctx = ctxRef.current;
        if (!ctx) {
          ctx = new AudioCtx();
          ctxRef.current = ctx;
        }
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        playSample(
          ctx,
          [{ frequency: 520, type: "sine", duration: 0.08, gain: 0.18 }],
          0,
        );
        return;
      }

      if (sound === "mate") {
        if (tryPlayFile(mateAudioRef.current)) return;
        playSynth("gameEnd");
        return;
      }

      playSynth(sound);
    },
    [enabled, tryPlayFile, playSynth],
  );

  return play;
}
