"use client";

import type { CoachStatus } from "./useChessCoach";

type CoachPanelProps = {
  text: string;
  status: CoachStatus;
  error: string | null;
  enabled: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onReset: () => void;
  /** Іде запит до Stockfish + LLM (поза самим стрімом). */
  busy?: boolean;
  className?: string;
};

export function CoachPanel({
  text,
  status,
  error,
  enabled,
  onToggle,
  onCancel,
  onReset,
  busy = false,
  className = "",
}: CoachPanelProps) {
  const isStreaming = status === "streaming" || busy;
  const showIdleHint = enabled && !isStreaming && !text && !error;

  return (
    <section
      className={`rounded-2xl border border-border/80 bg-card/90 p-5 shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40 ${className}`}
      aria-label="AI-тренер"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            AI-тренер
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Gemini · Stockfish
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border/80 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              Стоп
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={enabled}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              enabled
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border/80 bg-secondary text-foreground hover:bg-muted"
            }`}
          >
            {enabled ? "Вимкнути тренера" : "Увімкнути тренера"}
          </button>
        </div>
      </header>

      {/*
        Коли тренер увімкнений — область відповіді завжди має фіксовану висоту
        (h-56 ≈ 224px), щоб ні поява спінера, ні стрім тексту, ні зміна стану
        idle/error НЕ змінювали висоту панелі. На мобільному це критично, бо
        панель стоїть НАД дошкою — будь-яке зростання штовхало б дошку вниз
        прямо під час перетягування фігури і drag би «промахувався».
        Внутрішнім контентом текст/спінер/помилка прокручуються в межах цієї
        висоти.
      */}
      {enabled ? (
        <div className="relative mt-4 h-56 overflow-y-auto pr-1 text-sm leading-relaxed text-foreground/90">
          {showIdleHint ? (
            <p className="text-muted-foreground">
              Як тільки бот зіграє — підкажу твій найкращий хід зі стрілкою на
              дошці.
            </p>
          ) : null}

          {isStreaming && !text ? (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              aria-live="polite"
              aria-busy
            >
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
                aria-hidden
              />
              Тренер думає…
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
              <button
                type="button"
                onClick={onReset}
                className="ml-2 underline underline-offset-2"
              >
                скинути
              </button>
            </div>
          ) : null}

          {text ? (
            <div
              className="space-y-2 whitespace-pre-wrap"
              aria-live="polite"
              aria-busy={isStreaming}
            >
              {text}
              {isStreaming ? (
                <span
                  className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-primary align-middle"
                  aria-hidden
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
