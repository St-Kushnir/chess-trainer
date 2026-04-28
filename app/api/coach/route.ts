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

  const model = process.env.GEMINI_MODEL?.trim() || undefined;
  const temperatureRaw = Number(process.env.GEMINI_TEMPERATURE);
  const maxTokensRaw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS);

  const commentator = new GeminiCommentator({
    apiKey,
    model,
    temperature: Number.isFinite(temperatureRaw) ? temperatureRaw : undefined,
    maxOutputTokens: Number.isFinite(maxTokensRaw) ? maxTokensRaw : undefined,
  });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of commentator.comment(input)) {
          if (chunk) controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
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
