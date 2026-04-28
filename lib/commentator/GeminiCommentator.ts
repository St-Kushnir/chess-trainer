import { GoogleGenAI } from "@google/genai";
import { buildPrompt, SYSTEM_PROMPT } from "./prompt";
import type { ChessCommentator, CommentInput } from "./types";

export type GeminiCommentatorOptions = {
  apiKey: string;
  /** За замовчуванням `gemini-2.5-flash` (безкоштовний тариф через AI Studio). */
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export class GeminiCommentator implements ChessCommentator {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(options: GeminiCommentatorOptions) {
    if (!options.apiKey) {
      throw new Error("GeminiCommentator: apiKey не передано");
    }
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gemini-2.5-flash";
    this.temperature = options.temperature ?? 0.5;
    this.maxOutputTokens = options.maxOutputTokens ?? 700;
  }

  async *comment(input: CommentInput): AsyncIterable<string> {
    const prompt = buildPrompt(input);
    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
      },
    });
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
    }
  }
}
