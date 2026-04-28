import type { EngineLevel } from "./types";

/** Мінімальне / максимальне орієнтовне ELO бота та крок у UI. */
export const BOT_ELO_MIN = 200;
export const BOT_ELO_MAX = 2400;
export const BOT_ELO_STEP = 200;

/** Усі допустимі значення ELO для вибору (200 … 2400 крок 200). */
export const BOT_ELO_OPTIONS: readonly number[] = Object.freeze(
  Array.from(
    { length: (BOT_ELO_MAX - BOT_ELO_MIN) / BOT_ELO_STEP + 1 },
    (_, i) => BOT_ELO_MIN + i * BOT_ELO_STEP,
  ),
);

/** За замовчуванням — «клубний» діапазон. */
export const DEFAULT_BOT_ELO = 1600;

/**
 * У стандартному Stockfish `UCI_Elo` зазвичай не нижче ~1320.
 * Нижче цього — лише Skill Level + обмеження часу на хід (без `go depth`).
 */
export const STOCKFISH_UCI_ELO_MIN = 1320;
const STOCKFISH_UCI_ELO_MAX = 3190;

type Anchor = { elo: number; skill: number; depth: number; movetimeMs: number };

/**
 * Якорі для інтерполяції skill / depth / movetime.
 * Для ELO < 1320 глибина в грі не використовується — сила задається коротшим
 * `movetime` + низьким Skill; NNUE без цього залишається «лютим» навіть на 200.
 */
const ANCHORS: readonly Anchor[] = [
  { elo: 200, skill: 0, depth: 1, movetimeMs: 22 },
  { elo: 400, skill: 0, depth: 2, movetimeMs: 38 },
  { elo: 800, skill: 1, depth: 3, movetimeMs: 80 },
  { elo: 1200, skill: 3, depth: 6, movetimeMs: 170 },
  { elo: 1600, skill: 10, depth: 11, movetimeMs: 700 },
  { elo: 2000, skill: 15, depth: 14, movetimeMs: 1100 },
  { elo: 2400, skill: 20, depth: 18, movetimeMs: 1800 },
];

/** Мінімальний `go movetime` для слабких пресетів (коротше — слабше, в межах стабільності WASM). */
const MOVETIME_MS_MIN = 18;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Найближче допустиме значення на сітці 200 … 2400 крок 200. */
export function snapBotElo(elo: number): number {
  const k = Math.round((elo - BOT_ELO_MIN) / BOT_ELO_STEP);
  return clamp(BOT_ELO_MIN + k * BOT_ELO_STEP, BOT_ELO_MIN, BOT_ELO_MAX);
}

/**
 * Пресет Stockfish для орієнтовного ELO суперника (лінійна інтерполяція між якорями).
 */
export function enginePresetForBotElo(elo: number): {
  skill: number;
  depth?: number;
  movetimeMs: number;
} {
  const e = clamp(elo, ANCHORS[0]!.elo, ANCHORS[ANCHORS.length - 1]!.elo);

  let i = 0;
  while (i < ANCHORS.length - 1 && ANCHORS[i + 1]!.elo <= e) {
    i += 1;
  }

  if (i >= ANCHORS.length - 1) {
    const last = ANCHORS[ANCHORS.length - 1]!;
    return { skill: last.skill, depth: last.depth, movetimeMs: last.movetimeMs };
  }

  const a = ANCHORS[i]!;
  const b = ANCHORS[i + 1]!;
  if (e <= a.elo) {
    return { skill: a.skill, depth: a.depth, movetimeMs: a.movetimeMs };
  }
  if (e >= b.elo) {
    return { skill: b.skill, depth: b.depth, movetimeMs: b.movetimeMs };
  }

  const t = (e - a.elo) / (b.elo - a.elo);
  const skill = clamp(Math.round(lerp(a.skill, b.skill, t)), 0, 20);
  const depth = clamp(Math.round(lerp(a.depth, b.depth, t)), 1, 30);
  const movetimeMs = clamp(
    Math.round(lerp(a.movetimeMs, b.movetimeMs, t)),
    MOVETIME_MS_MIN,
    5000,
  );
  return { skill, depth, movetimeMs };
}

/** Повний об'єкт рівня для тренажера / API коуча. */
export function engineLevelFromBotElo(elo: number): EngineLevel {
  const e = snapBotElo(elo);
  const p = enginePresetForBotElo(e);

  if (e >= STOCKFISH_UCI_ELO_MIN) {
    return {
      id: e,
      label: `${e}`,
      hint: `≈ ${e} ELO`,
      skill: p.skill,
      depth: p.depth,
      movetimeMs: p.movetimeMs,
      useUciEloLimit: true,
      uciElo: Math.min(Math.max(e, STOCKFISH_UCI_ELO_MIN), STOCKFISH_UCI_ELO_MAX),
    };
  }

  return {
    id: e,
    label: `${e}`,
    hint: `≈ ${e} ELO`,
    skill: p.skill,
    movetimeMs: p.movetimeMs,
    depth: undefined,
    useUciEloLimit: false,
  };
}
