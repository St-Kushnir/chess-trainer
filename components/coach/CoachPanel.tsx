"use client";

import { useMemo } from "react";
import type { CoachStatus } from "./useChessCoach";

export type CoachSideTag = "player" | "opponent" | null;

type CoachPanelProps = {
  text: string;
  status: CoachStatus;
  error: string | null;
  enabled: boolean;
  onToggle: () => void;
  onReset: () => void;
  /** Іде запит до Stockfish + LLM (поза самим стрімом). */
  busy?: boolean;
  /**
   * Швидкий «попередній» хід від Stockfish, щоб користувач бачив рекомендацію
   * ще до приходу першого токена від Gemini. SAN, який буде показано вгорі
   * шапки — наприклад «Грай: Nf3».
   */
  quickHintSan?: string | null;
  /** `textBeforeToken` — префікс відповіді до початку токена (для зняття неоднозначності превʼю). */
  onPreviewSquare?: (
    square: string,
    isOpponentContext: boolean,
    textBeforeToken: string,
  ) => void;
  onPreviewMove?: (san: string, sideTag: CoachSideTag) => void;
  onClearPreview?: () => void;
  className?: string;
};

const SQUARE_REGEX = /^[a-h][1-8]$/i;
const MOVE_LETTER_REGEX = /[KQRBNКФСЛxX=]|O-O/;
// SAN: castle | [piece]?[disambig file]?[disambig rank]?[x]?[file][rank][promo]?[+#]?
// Допускаємо кириличні літери фігур (К, Ф, С, Л) та "файлоподібні" а с е в.
const INTERACTIVE_TOKEN_REGEX =
  /(?<![\p{L}\p{N}_])(O-O-O|O-O|[KQRBNКФСЛ]?[a-hасев]?[1-8]?x?[a-hасев][1-8](?:=[QRBN])?[+#]?)(?![\p{L}\p{N}_])/gu;

function normalizeCyrillicChessText(value: string): string {
  return value
    .replace(/К/g, "N")
    .replace(/Ф/g, "Q")
    .replace(/С/g, "B")
    .replace(/Л/g, "R")
    .replace(/а/g, "a")
    .replace(/в/g, "b")
    .replace(/с/g, "c")
    .replace(/е/g, "e");
}

/**
 * Маркери того, що в реченні йдеться про відповідь / хід опонента.
 * Якщо їх нема — ми вважаємо токен «нейтральним полем» і не малюємо
 * жовту стрілку, а лише підсвічуємо клітинку.
 */
const OPPONENT_CONTEXT_REGEX =
  /(суперник|опонент|відповід|відповіс|відповіст|відповіда|у відповідь|побʼ|побит|взятт|загроз|загрожу|контратак|контр-?удар|чорні|білі)/i;

/**
 * У шахових текстах «...Nf6» / «...Bg4» — стандартне позначення ходу сторони,
 * що ходить другою (чорних у більшості діаграм). Тоді треба превʼю як для
 * ходу опонента, навіть якщо перед цим стоїть крапка з трикрапки.
 */
function hasOpponentMoveEllipsisPrefix(text: string, tokenIndex: number): boolean {
  let i = tokenIndex - 1;
  while (i >= 0 && /\s/.test(text[i] ?? "")) i -= 1;
  if (i >= 2 && text.slice(i - 2, i + 1) === "...") return true;
  if (i >= 0 && text[i] === "…") return true;
  return false;
}

/**
 * Явні мітки з промпта LLM одразу після SAN / клітинки (можуть бути зірочки markdown).
 */
function readSideTagAfterToken(text: string, tokenEnd: number): CoachSideTag {
  let i = tokenEnd;
  while (i < text.length && /[\s*]/.test(text[i] ?? "")) i += 1;
  if (text[i] !== "(") return null;
  const close = text.indexOf(")", i);
  if (close === -1) return null;
  const inner = text.slice(i + 1, close).trim().toLowerCase();
  if (/^(ти|учень|наш|гравець)$/.test(inner)) return "player";
  if (/^(суперник|бот|противник|опонент)$/.test(inner)) return "opponent";
  return null;
}

/** Дужки з промпта лише для логіки превʼю на дошці — у UI не показуємо. */
const SIDE_TAG_DISPLAY_REGEX =
  /\s*\(\s*(ти|учень|наш|гравець|суперник|бот|противник|опонент)\s*\)/gi;

function stripSideTagsForDisplay(segment: string): string {
  return segment
    .replace(SIDE_TAG_DISPLAY_REGEX, "")
    .replace(/[ \t]{2,}/g, " ");
}

function isOpponentContextHeuristic(text: string, tokenIndex: number): boolean {
  const lookbackLimit = Math.max(0, tokenIndex - 240);
  const slice = text.slice(lookbackLimit, tokenIndex);
  const nl = slice.lastIndexOf("\n");
  const dotSpace = slice.lastIndexOf(". ");
  const exSpace = slice.lastIndexOf("! ");
  const qSpace = slice.lastIndexOf("? ");
  const best = Math.max(nl, dotSpace, exSpace, qSpace);
  let start = lookbackLimit;
  if (best >= 0) {
    const ch = slice[best];
    start = lookbackLimit + best + (ch === "\n" ? 1 : 2);
  }
  const context = text.slice(start, tokenIndex);
  return OPPONENT_CONTEXT_REGEX.test(context);
}

/** Чи токен SAN / клітинки стосується ходу чи поля опонента (жовта стрілка тощо). */
function isOpponentContextForToken(
  text: string,
  tokenIndex: number,
  tokenLength: number,
): boolean {
  const tag = readSideTagAfterToken(text, tokenIndex + tokenLength);
  if (tag === "opponent") return true;
  if (tag === "player") return false;
  if (hasOpponentMoveEllipsisPrefix(text, tokenIndex)) return true;
  return isOpponentContextHeuristic(text, tokenIndex);
}

export function CoachPanel({
  text,
  status,
  error,
  enabled,
  onToggle,
  onReset,
  busy = false,
  quickHintSan = null,
  onPreviewSquare,
  onPreviewMove,
  onClearPreview,
  className = "",
}: CoachPanelProps) {
  const isStreaming = status === "streaming" || busy;
  const showIdleHint = enabled && !isStreaming && !text && !error;
  /**
   * Скелетон, поки немає першого токена. Показуємо ТІЛЬКИ коли тренер
   * увімкнений, ще немає тексту й немає швидкої плашки — інакше плашка
   * «Грай: …» вже виконує роль активного стану.
   */
  const showStreamingSkeleton =
    enabled && isStreaming && !text && !error && !quickHintSan;

  const sectionBorderClass = useMemo(() => {
    if (!enabled) {
      return "border border-border/80 ring-1 ring-border/50 dark:ring-border/40";
    }
    if (error || status === "error") {
      return "border-2 border-destructive/55 ring-1 ring-destructive/25";
    }
    if (isStreaming) {
      return "border-2 border-indigo-500/70 ring-0 coach-panel-border-loading dark:border-indigo-400/75";
    }
    if (status === "done" && !error) {
      return "border-2 border-green-600/85 ring-1 ring-green-600/25 dark:border-green-500/80";
    }
    return "border border-border/80 ring-1 ring-border/50 dark:ring-border/40";
  }, [enabled, error, isStreaming, status]);
  const interactiveChunks = useMemo(() => {
    const chunks: Array<{
      value: string;
      interactive: boolean;
      isOpponent?: boolean;
      sideTag?: CoachSideTag;
      tokenStart?: number;
    }> = [];
    let lastIndex = 0;
    for (const match of text.matchAll(INTERACTIVE_TOKEN_REGEX)) {
      const token = match[1];
      const index = match.index ?? -1;
      if (!token || index < 0) continue;
      if (index > lastIndex) {
        chunks.push({
          value: text.slice(lastIndex, index),
          interactive: false,
        });
      }
      chunks.push({
        value: token,
        interactive: true,
        isOpponent: isOpponentContextForToken(text, index, token.length),
        sideTag: readSideTagAfterToken(text, index + token.length),
        tokenStart: index,
      });
      lastIndex = index + token.length;
    }
    if (lastIndex < text.length) {
      chunks.push({ value: text.slice(lastIndex), interactive: false });
    }
    return chunks.length > 0 ? chunks : [{ value: text, interactive: false }];
  }, [text]);

  const previewToken = (
    token: string,
    isOpponent: boolean,
    sideTag: CoachSideTag,
    tokenStart: number,
  ) => {
    const normalized = normalizeCyrillicChessText(token);
    const textBefore = text.slice(0, tokenStart);
    if (SQUARE_REGEX.test(normalized) && !MOVE_LETTER_REGEX.test(token)) {
      onPreviewSquare?.(normalized.toLowerCase(), isOpponent, textBefore);
      return;
    }
    onPreviewMove?.(normalized, sideTag);
  };

  return (
    <section
      className={`relative min-w-0 max-w-full rounded-2xl bg-card/90 p-3 shadow-sm sm:p-5 dark:bg-card/70 ${sectionBorderClass} ${className}`}
      aria-label="AI-тренер"
      aria-busy={isStreaming}
    >
      <div className="absolute right-3 top-1 z-10 sm:right-5 sm:top-5">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={enabled}
          aria-label={enabled ? "Вимкнути тренера" : "Увімкнути тренера"}
          className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors sm:px-3 sm:py-1.5 sm:text-xs ${
            enabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border border-border/80 bg-secondary text-foreground hover:bg-muted"
          }`}
        >
          <span className="sm:hidden">{enabled ? "Вимкнути" : "Увімкнути"}</span>
          <span className="hidden sm:inline">
            {enabled ? "Вимкнути тренера" : "Увімкнути тренера"}
          </span>
        </button>
      </div>

      <header className="min-w-0 max-w-[calc(100%-5.75rem)] sm:max-w-[calc(100%-11.5rem)]">
        <p className="text-xs font-semibold leading-tight tracking-tight text-foreground sm:text-sm">
          AI-тренер
        </p>
        <p className="mt-0 hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:mt-0.5 sm:block sm:text-[11px]">
          Gemini · Stockfish
        </p>
      </header>

      {/*
        Мобільний: фіксована висота блоку підказка + текст (`~22svh`, макс. 8.25rem),
        щоб дошка не стрибала; довгий текст — скрол усередині.
      */}
      {enabled ? (
        <div className="mt-2 flex w-full min-w-0 flex-col max-md:h-[min(20svh,6.50rem)] md:mt-4 md:h-auto">
          {quickHintSan && !error ? (
            <button
              type="button"
              onClick={() => onPreviewMove?.(quickHintSan, "player")}
              onMouseEnter={() => onPreviewMove?.(quickHintSan, "player")}
              onMouseLeave={onClearPreview}
              onFocus={() => onPreviewMove?.(quickHintSan, "player")}
              onBlur={onClearPreview}
              className="group mb-2 inline-flex max-w-full shrink-0 items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-left text-[11px] font-semibold text-foreground ring-1 ring-primary/25 transition-colors hover:bg-primary/15 sm:mb-2 sm:gap-1.5 sm:rounded-md sm:px-2 sm:py-1 sm:text-xs"
              aria-label={`Рекомендований хід: ${quickHintSan}`}
            >
              <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground group-hover:text-foreground sm:text-[10px] sm:tracking-wider">
                Грай
              </span>
              <span className="font-mono text-xs text-primary sm:text-sm">
                {quickHintSan}
              </span>
              {isStreaming ? (
                <span
                  className="ml-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70 sm:h-2 sm:w-2"
                  aria-hidden
                />
              ) : null}
            </button>
          ) : null}

          <div
            className="relative min-w-0 max-w-full max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-y-contain max-md:pr-0.5 max-md:leading-snug max-md:text-[clamp(0.68rem,calc(0.58rem+1.2vmin),0.8125rem)] md:min-h-11 md:max-h-[min(75vh,24rem)] md:flex-none md:overflow-y-auto md:pr-1 md:text-sm md:leading-relaxed text-foreground/90"
            onMouseLeave={onClearPreview}
          >
              {showIdleHint ? (
                <p className="text-muted-foreground">
                  Як тільки бот зіграє — підкажу твій найкращий хід.
                </p>
              ) : null}

              {showStreamingSkeleton ? (
                <div
                  className="space-y-1.5"
                  aria-hidden
                >
                  <div className="h-2.5 w-11/12 animate-pulse rounded bg-muted/60 dark:bg-muted/35" />
                  <div className="h-2.5 w-9/12 animate-pulse rounded bg-muted/60 dark:bg-muted/35" />
                  <div className="h-2.5 w-7/12 animate-pulse rounded bg-muted/60 dark:bg-muted/35" />
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
                  className="min-w-0 max-w-full break-words sm:space-y-1 whitespace-pre-wrap"
                  aria-live="polite"
                  aria-busy={isStreaming}
                >
                  {interactiveChunks.map((chunk, index) =>
                    chunk.interactive ? (
                      <button
                        key={`${chunk.value}-${index}`}
                        type="button"
                        className="inline-block max-w-full whitespace-normal rounded px-0.5 text-left align-baseline text-primary underline decoration-primary/40 underline-offset-2 transition-colors break-words hover:bg-primary/10 hover:decoration-primary"
                        onMouseEnter={() =>
                          previewToken(
                            chunk.value,
                            !!chunk.isOpponent,
                            chunk.sideTag ?? null,
                            chunk.tokenStart ?? 0,
                          )
                        }
                        onClick={() =>
                          previewToken(
                            chunk.value,
                            !!chunk.isOpponent,
                            chunk.sideTag ?? null,
                            chunk.tokenStart ?? 0,
                          )
                        }
                        onFocus={() =>
                          previewToken(
                            chunk.value,
                            !!chunk.isOpponent,
                            chunk.sideTag ?? null,
                            chunk.tokenStart ?? 0,
                          )
                        }
                      >
                        {chunk.value}
                      </button>
                    ) : (
                      <span key={`${chunk.value}-${index}`}>
                        {stripSideTagsForDisplay(chunk.value)}
                      </span>
                    ),
                  )}
                  {isStreaming ? (
                    <span
                      className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-primary align-middle"
                      aria-hidden
                    />
                  ) : null}
                </div>
              ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
