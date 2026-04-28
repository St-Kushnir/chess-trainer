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
  /** Skill Level Stockfish 0..20 (за замовчуванням 20 — повна сила) */
  skill?: number;
  /** Обмеження часу на хід у мс. */
  movetimeMs?: number;
  /** Обмеження глибини. */
  depth?: number;
};

export interface ChessEngine {
  init(): Promise<void>;
  isReady(): boolean;
  bestMove(opts: SearchOptions): Promise<EngineMove>;
  stop(): void;
  destroy(): void;
}

export type EngineLevel = {
  id: number;
  label: string;
  /** Орієнтовний рівень для UI ("≈ 1200 ELO" тощо). */
  hint: string;
  skill: number;
  depth?: number;
  movetimeMs: number;
};

/**
 * Готові пресети для UI: 5 рівнів від новачка до майстра.
 * Skill Level + час на хід регулюють силу і UX-затримку.
 */
export const ENGINE_LEVELS: readonly EngineLevel[] = [
  {
    id: 1,
    label: "Новачок",
    hint: "≈ 800 ELO",
    skill: 0,
    depth: 5,
    movetimeMs: 250,
  },
  {
    id: 2,
    label: "Аматор",
    hint: "≈ 1200 ELO",
    skill: 5,
    depth: 8,
    movetimeMs: 450,
  },
  {
    id: 3,
    label: "Клубний гравець",
    hint: "≈ 1600 ELO",
    skill: 10,
    depth: 11,
    movetimeMs: 700,
  },
  {
    id: 4,
    label: "Сильний",
    hint: "≈ 2000 ELO",
    skill: 15,
    depth: 14,
    movetimeMs: 1100,
  },
  {
    id: 5,
    label: "Майстер",
    hint: "≈ 2400+ ELO",
    skill: 20,
    depth: 18,
    movetimeMs: 1800,
  },
] as const;
