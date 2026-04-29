import { NextResponse, type NextRequest } from "next/server";
import { GeminiCommentator, type CommentInput } from "@/lib/commentator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Сентінел, який клієнт (`useChessCoach`) шукає у тілі стріму, щоб перевести
 * залишок чанків у стан `error` замість того, щоб дописувати їх у `text`.
 * Сервер не повинен ніколи генерувати цю послідовність у звичайних чанках —
 * це безпечно, бо це не валідний фрагмент шахового коментаря.
 */
const COACH_ERROR_TAG = "\u001f[COACH_ERROR]\u001f";

/** Лише `UNAVAILABLE`/503 ретраїмо — це короткочасні збої сервісу Gemini. */
const RETRIABLE_HTTP_CODES = new Set<number>([503]);
const RETRIABLE_STATUSES = new Set<string>(["UNAVAILABLE"]);
const MAX_STREAM_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 350;
const RETRY_JITTER_MS = 250;

type ParsedGeminiError = {
  code?: number;
  status?: string;
  message?: string;
};

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractGeminiError(raw: string): ParsedGeminiError | null {
  // SDK Gemini часто кидає текст виду: `got status: 429 Too Many Requests. {...JSON...}`.
  // Шукаємо перший `{` і пробуємо розпарсити, потім (якщо message сам — JSON) розпарсити ще раз.
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) return null;

  const top = tryParseJson(raw.slice(jsonStart)) as
    | { error?: Record<string, unknown> }
    | Record<string, unknown>
    | null;
  if (!top || typeof top !== "object") return null;

  const outer =
    "error" in top && top.error && typeof top.error === "object"
      ? (top.error as Record<string, unknown>)
      : (top as Record<string, unknown>);

  let inner: Record<string, unknown> = outer;
  if (typeof outer.message === "string" && outer.message.trim().startsWith("{")) {
    const nested = tryParseJson(outer.message) as
      | { error?: Record<string, unknown> }
      | Record<string, unknown>
      | null;
    if (nested && typeof nested === "object") {
      inner =
        "error" in nested && nested.error && typeof nested.error === "object"
          ? (nested.error as Record<string, unknown>)
          : (nested as Record<string, unknown>);
    }
  }

  return {
    code: typeof inner.code === "number" ? inner.code : undefined,
    status: typeof inner.status === "string" ? inner.status : undefined,
    message: typeof inner.message === "string" ? inner.message : undefined,
  };
}

function isRetriableError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const info = extractGeminiError(raw);
  if (!info) return false;
  if (info.code !== undefined && RETRIABLE_HTTP_CODES.has(info.code)) return true;
  if (info.status && RETRIABLE_STATUSES.has(info.status)) return true;
  return false;
}

function friendlyCoachError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const info = extractGeminiError(raw);

  if (info?.code === 429 || info?.status === "RESOURCE_EXHAUSTED") {
    return "Вичерпано безкоштовну квоту Gemini API. Спробуй пізніше або підключи платний план у Google AI Studio.";
  }
  if (info?.code === 401 || info?.code === 403) {
    return "Невалідний або відсутній ключ Gemini API. Перевір значення GEMINI_API_KEY у .env.local.";
  }
  if (info?.code === 503 || info?.status === "UNAVAILABLE") {
    return "Сервіс Gemini тимчасово недоступний. Спробуй ще раз за кілька секунд.";
  }
  if (info?.code === 400) {
    return info.message
      ? `Запит відхилено Gemini: ${info.message}`
      : "Запит відхилено Gemini API.";
  }
  if (info?.message) return info.message;

  const fallback = raw.replace(/\s+/g, " ").trim();
  if (!fallback) return "Невідома помилка коментатора.";
  return fallback.length > 240 ? `${fallback.slice(0, 240)}…` : fallback;
}

function getApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_GENAI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    null
  );
}

function isValidColor(value: unknown): value is "white" | "black" {
  return value === "white" || value === "black";
}

function parseInput(payload: unknown): CommentInput | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.fen !== "string" || !p.fen) return null;
  if (!Array.isArray(p.pgnHistory)) return null;
  if (!isValidColor(p.playerColor)) return null;

  const pgnHistory = p.pgnHistory.filter(
    (s): s is string => typeof s === "string",
  );

  const input: CommentInput = {
    fen: p.fen,
    pgnHistory,
    playerColor: p.playerColor,
    audience: "player",
    mode: p.mode === "hint" ? "hint" : "comment",
  };

  if (p.level && typeof p.level === "object") {
    const lvl = p.level as Record<string, unknown>;
    if (
      typeof lvl.id === "number" &&
      typeof lvl.label === "string" &&
      typeof lvl.hint === "string"
    ) {
      input.level = { id: lvl.id, label: lvl.label, hint: lvl.hint };
    }
  }

  if (p.lastMove && typeof p.lastMove === "object") {
    const m = p.lastMove as Record<string, unknown>;
    if (
      typeof m.san === "string" &&
      typeof m.uci === "string" &&
      isValidColor(m.color)
    ) {
      input.lastMove = { san: m.san, uci: m.uci, color: m.color };
    }
  }

  if (p.engineInfo && typeof p.engineInfo === "object") {
    const e = p.engineInfo as Record<string, unknown>;
    if (typeof e.bestmove === "string" && isValidColor(e.color)) {
      input.engineInfo = {
        bestmove: e.bestmove,
        color: e.color,
        pv: Array.isArray(e.pv)
          ? e.pv.filter((s): s is string => typeof s === "string")
          : undefined,
        scoreCp: typeof e.scoreCp === "number" ? e.scoreCp : undefined,
        scoreMate: typeof e.scoreMate === "number" ? e.scoreMate : undefined,
      };
    }
  }

  return input;
}

type CommentatorConfig = {
  apiKey: string;
  model: string | undefined;
  temperature: number | undefined;
  maxTokensComment: number | undefined;
  maxTokensHint: number | undefined;
  thinkingBudget: number | undefined;
};

function readCommentatorConfig(apiKey: string): CommentatorConfig {
  const model = process.env.GEMINI_MODEL?.trim() || undefined;
  const temperatureRaw = Number(process.env.GEMINI_TEMPERATURE);
  const maxCommentRaw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_COMMENT);
  const maxHintRaw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_HINT);
  // Зворотна сумісність: загальний `GEMINI_MAX_OUTPUT_TOKENS` бере для коментаря.
  const maxLegacyRaw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);
  const thinkingRaw = Number(process.env.GEMINI_THINKING_BUDGET);

  return {
    apiKey,
    model,
    temperature: Number.isFinite(temperatureRaw) ? temperatureRaw : undefined,
    maxTokensComment: Number.isFinite(maxCommentRaw)
      ? maxCommentRaw
      : Number.isFinite(maxLegacyRaw)
        ? maxLegacyRaw
        : undefined,
    maxTokensHint: Number.isFinite(maxHintRaw) ? maxHintRaw : undefined,
    thinkingBudget: Number.isFinite(thinkingRaw) ? thinkingRaw : undefined,
  };
}

function configKey(cfg: CommentatorConfig): string {
  return [
    cfg.apiKey,
    cfg.model ?? "",
    cfg.temperature ?? "",
    cfg.maxTokensComment ?? "",
    cfg.maxTokensHint ?? "",
    cfg.thinkingBudget ?? "",
  ].join("|");
}

/**
 * Кешуємо інстанс коментатора між запитами (Node.js runtime тримає модулі
 * живими в межах інстансу). Це позбавляє нас повторної ініціалізації клієнта
 * та підтягує переваги implicit prompt caching на стороні Gemini.
 */
let cachedCommentator: { commentator: GeminiCommentator; key: string } | null =
  null;

function getCommentator(cfg: CommentatorConfig): GeminiCommentator {
  const key = configKey(cfg);
  if (cachedCommentator && cachedCommentator.key === key) {
    return cachedCommentator.commentator;
  }
  const commentator = new GeminiCommentator({
    apiKey: cfg.apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
    maxOutputTokensForComment: cfg.maxTokensComment,
    maxOutputTokensForHint: cfg.maxTokensHint,
    thinkingBudget: cfg.thinkingBudget,
  });
  cachedCommentator = { commentator, key };
  return commentator;
}

async function streamWithRetry(
  commentator: GeminiCommentator,
  input: CommentInput,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  signal: AbortSignal,
): Promise<void> {
  let attempt = 0;
  // Якщо помилка приходить ДО першого корисного чанка — пробуємо ще раз;
  // якщо вже почали стрімити текст — ретраю не робимо, щоб не дублювати UI.
  while (true) {
    attempt += 1;
    let firstChunkSent = false;
    try {
      for await (const chunk of commentator.comment(input)) {
        if (signal.aborted) return;
        if (chunk) {
          controller.enqueue(encoder.encode(chunk));
          firstChunkSent = true;
        }
      }
      return;
    } catch (err) {
      if (signal.aborted) return;
      if (firstChunkSent) throw err;
      if (attempt >= MAX_STREAM_ATTEMPTS) throw err;
      if (!isRetriableError(err)) throw err;
      const delay = RETRY_BASE_DELAY_MS + Math.random() * RETRY_JITTER_MS;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function POST(req: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Не задано GEMINI_API_KEY у змінних середовища. Створи .env.local і додай GEMINI_API_KEY=…",
      },
      { status: 500 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Невалідний JSON" }, { status: 400 });
  }

  const input = parseInput(payload);
  if (!input) {
    return NextResponse.json(
      { error: "Невалідні поля запиту (fen, pgnHistory, playerColor)" },
      { status: 400 },
    );
  }

  const commentator = getCommentator(readCommentatorConfig(apiKey));
  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await streamWithRetry(commentator, input, controller, encoder, signal);
        controller.close();
      } catch (err) {
        if (signal.aborted) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }
        const msg = friendlyCoachError(err);
        controller.enqueue(encoder.encode(`${COACH_ERROR_TAG}${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
