export type EngineMove = {
  /** UCI-нотація: "e2e4", "e7e8q" тощо. */
  bestmove: string;
  /** Найкраща лінія (PV) у форматі UCI ходів. */
  pv?: string[];
  /** Оцінка позиції в сантипішаках з боку, який ходив. */
  scoreCp?: number;
  /** Мат у N півходів (додатний — ми матимо, відʼємний — нам матимуть). */
  scoreMate?: number;
};

export type SearchOptions = {
  fen: string;
  /** Skill Level Stockfish 0..20 (за замовчуванням 20 — повна сила). Ігнорується, якщо `limitStrength` + `uciElo`. */
  skill?: number;
  /** Обмеження часу на хід у мс. */
  movetimeMs?: number;
  /** Обмеження глибини. */
  depth?: number;
  /**
   * Обмежити силу за UCI_Elo (типовий діапазон Stockfish 1320–3190).
   * Якщо true і задано `uciElo`, опція Skill Level не застосовується.
   */
  limitStrength?: boolean;
  uciElo?: number;
};

export interface ChessEngine {
  init(): Promise<void>;
  isReady(): boolean;
  /** Чи виконується зараз `go` (після `stop` стан зникає з появою `bestmove`). */
  isBusy(): boolean;
  bestMove(opts: SearchOptions): Promise<EngineMove>;
  stop(): void;
  destroy(): void;
}

/** Пресет сили бота для тренажера (ELO → рушій — див. `botElo.ts`). */
export type EngineLevel = {
  id: number;
  label: string;
  /** Орієнтовний рівень для UI ("≈ 1200 ELO" тощо). */
  hint: string;
  skill: number;
  depth?: number;
  movetimeMs: number;
  /**
   * true — `UCI_LimitStrength` + `uciElo` (зазвичу id ≥ 1320).
   * false — лише Skill Level + movetime/depth.
   */
  useUciEloLimit: boolean;
  /** Значення UCI_Elo (якщо `useUciEloLimit`). */
  uciElo?: number;
};
