"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { BOT_ELO_OPTIONS } from "@/components/chess/engine/botElo";

type EloLevelScrollPickerProps = {
  value: number;
  onChange: (elo: number) => void;
  className?: string;
};

function readEloAtCenter(container: HTMLElement): number {
  const rect = container.getBoundingClientRect();
  const cy = rect.top + rect.height / 2;
  let best = BOT_ELO_OPTIONS[0]!;
  let bestDist = Infinity;
  container.querySelectorAll<HTMLElement>("[data-bot-elo]").forEach((node) => {
    const r = node.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    const d = Math.abs(mid - cy);
    if (d < bestDist) {
      bestDist = d;
      best = Number(node.dataset.botElo);
    }
  });
  return best;
}

export function EloLevelScrollPicker({
  value,
  onChange,
  className = "",
}: EloLevelScrollPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const scrollValueIntoCenter = useCallback((elo: number) => {
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(`[data-bot-elo="${elo}"]`);
    if (!root || !target) return;
    const rootRect = root.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const delta =
      tRect.top + tRect.height / 2 - (rootRect.top + rootRect.height / 2);
    programmaticScrollRef.current = true;
    root.scrollTop += delta;
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 200);
  }, []);

  useLayoutEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    queueMicrotask(() => scrollValueIntoCenter(value));
  }, [value, scrollValueIntoCenter]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const flush = () => {
      if (programmaticScrollRef.current) return;
      const next = readEloAtCenter(el);
      if (next !== value) onChange(next);
    };

    const onScroll = () => {
      if (programmaticScrollRef.current) return;
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(flush, 120);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", flush);

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", flush);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [value, onChange]);

  const pick = useCallback(
    (elo: number) => {
      onChange(elo);
      queueMicrotask(() => scrollValueIntoCenter(elo));
    },
    [onChange, scrollValueIntoCenter],
  );

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border/80 bg-muted/20 ring-1 ring-border/40 dark:bg-muted/15 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-card via-card/90 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-card via-card/90 to-transparent"
        aria-hidden
      />
      <div
        ref={scrollRef}
        role="listbox"
        aria-label="Орієнтовний рейтинг бота (ELO)"
        aria-activedescendant={`bot-elo-option-${value}`}
        className="max-h-[220px] snap-y snap-mandatory overflow-y-auto scroll-py-3 scroll-smooth py-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
      >
        
        {BOT_ELO_OPTIONS.map((elo) => {
          const active = value === elo;
          return (
            <button
              key={elo}
              id={`bot-elo-option-${elo}`}
              type="button"
              role="option"
              aria-selected={active}
              data-bot-elo={elo}
              onClick={() => pick(elo)}
              className={`mx-2 flex h-11 w-[calc(100%-1rem)] shrink-0 snap-center snap-always flex-col items-center justify-center rounded-lg transition-colors ${
                active
                  ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <span className="text-sm font-semibold tabular-nums tracking-tight">
                ≈ {elo} {" "}
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                ELO
              </span>
              </span>

            </button>
          );
        })}
      </div>
    </div>
  );
}
