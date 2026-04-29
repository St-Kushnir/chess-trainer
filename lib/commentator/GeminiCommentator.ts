import { GoogleGenAI } from "@google/genai";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt";
import type { ChessCommentator, CommentInput, CommentMode } from "./types";

export type GeminiCommentatorOptions = {
  apiKey: string;
  /** За замовчуванням `gemini-2.5-flash` (безкоштовний тариф через AI Studio). */
  model?: string;
  temperature?: number;
  /**
   * Стеля токенів для режиму `comment` (4 структурних блоки).
   * Хінт — окремо у `maxOutputTokensForHint`.
   */
  maxOutputTokensForComment?: number;
  /** Стеля токенів для режиму `hint` (1 SAN + 2–3 речення). */
  maxOutputTokensForHint?: number;
  /**
   * Бюджет «думання» Gemini 2.5 (сантипотрібних токенів CoT перед першим
   * текстом). 0 — вимкнути thinking (швидкий TTFT). -1 — динамічний (default
   * Gemini SDK). За замовчуванням ставимо 0, бо для шахових коментарів
   * thinking даємо ~1–3 с до першого токена і прибуткує мало.
   */
  thinkingBudget?: number;
};

const DEFAULT_THINKING_BUDGET = 0;

export class GeminiCommentator implements ChessCommentator {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxOutputTokensForComment: number;
  private readonly maxOutputTokensForHint: number;
  private readonly thinkingBudget: number;

  constructor(options: GeminiCommentatorOptions) {
    if (!options.apiKey) {
      throw new Error("GeminiCommentator: apiKey не передано");
    }
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gemini-2.5-flash";
    this.temperature = options.temperature ?? 0.5;
    this.maxOutputTokensForComment = options.maxOutputTokensForComment ?? 1024;
    this.maxOutputTokensForHint = options.maxOutputTokensForHint ?? 256;
    this.thinkingBudget = options.thinkingBudget ?? DEFAULT_THINKING_BUDGET;
  }

  private maxTokensFor(mode: CommentMode | undefined): number {
    return mode === "hint"
      ? this.maxOutputTokensForHint
      : this.maxOutputTokensForComment;
  }

  async *comment(input: CommentInput): AsyncIterable<string> {
    const prompt = buildPrompt(input);
    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: this.temperature,
        maxOutputTokens: this.maxTokensFor(input.mode),
        thinkingConfig: { thinkingBudget: this.thinkingBudget },
      },
    });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }
}
