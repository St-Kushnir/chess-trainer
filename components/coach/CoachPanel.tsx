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
  onPreviewSquare,
  onPreviewMove,
  onClearPreview,
  className = "",
}: CoachPanelProps) {
  const isStreaming = status === "streaming" || busy;
  const showIdleHint = enabled && !isStreaming && !text && !error;

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
      className={`relative rounded-2xl bg-card/90 p-4 sm:p-5 shadow-sm dark:bg-card/70 ${sectionBorderClass} ${className}`}
      aria-label="AI-тренер"
      aria-busy={isStreaming}
    >
      <div className="absolute right-4 top-4 z-10 sm:right-5 sm:top-5">
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

      <header className="min-w-0 max-w-[calc(100%-10.5rem)] sm:max-w-[calc(100%-11.5rem)]">
        <p className="text-sm font-semibold tracking-tight text-foreground">
          AI-тренер
        </p>
        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Gemini · Stockfish
        </p>
      </header>

      {/*
        На md+ висота за контентом з max-height. На мобільних при увімкненому
        тренері — фіксована «ячейка» (dvh), текст дрібніший і лише всередині
        неї прокручується, щоб дошка під карткою не стрибала.
      */}
      {enabled ? (
        <div className="mt-4 max-md:flex max-md:min-h-[min(18dvh,5.75rem)] max-md:max-h-[min(18dvh,5.75rem)] max-md:flex-col md:block">
          <div
            className="relative max-md:min-h-0 max-md:flex-1 max-md:text-[0.8125rem] max-md:leading-snug md:min-h-11 md:max-h-[min(75vh,24rem)] md:text-sm md:leading-relaxed overflow-y-auto pr-1 text-foreground/90"
            onMouseLeave={onClearPreview}
          >
              {showIdleHint ? (
                <p className="text-muted-foreground">
                  Як тільки бот зіграє — підкажу твій найкращий хід.
                </p>
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
                  className="sm:space-y-1 whitespace-pre-wrap"
                  aria-live="polite"
                  aria-busy={isStreaming}
                >
                  {interactiveChunks.map((chunk, index) =>
                    chunk.interactive ? (
                      <button
                        key={`${chunk.value}-${index}`}
                        type="button"
                        className="inline rounded px-0.5 text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:bg-primary/10 hover:decoration-primary"
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
