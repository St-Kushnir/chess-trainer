import { Chess, type Square } from "chess.js";
import type { ChessEngine, EngineMove } from "@/components/chess/engine";

/** Якість ходу за втратою сантипішаків (як на chess.com / Lichess, без AI). */
export type MoveQuality =
  | "brilliant"
  | "great"
  | "best"
  | "excellent"
  | "good"
  | "book"
  | "inaccuracy"
  | "mistake"
  | "miss"
  | "blunder";

export type MoveQualityAnalysis = {
  cpLost: number;
  quality: MoveQuality;
  playedWasBest: boolean;
};

const ANALYSIS_SKILL = 20;

/** Матеріал: перевага білих у сантипішаках (Q=900, R=500, …). */
const PIECE_CP: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/** Сума (білі) − (чорні) у сп за розстановкою з FEN. */
function materialAdvantageWhiteFromFen(fen: string): number {
  const placement = fen.split(" ")[0] ?? "";
  let sum = 0;
  for (const ch of placement) {
    if (ch === "/") continue;
    if (ch >= "1" && ch <= "9") continue;
    const lower = ch.toLowerCase();
    const v = PIECE_CP[lower] ?? 0;
    if (ch === lower) sum -= v;
    else sum += v;
  }
  return sum;
}

/**
 * Втрата якості за матеріалом після ходу (не залежить від глибини пошуку).
 * Порівнюємо позиції після найкращого й після фактичного ходу.
 */
function materialCpLostForMover(
  mover: "w" | "b",
  matAfterBest: number,
  matAfterPlayed: number,
): number {
  if (mover === "w") {
    return Math.max(0, Math.round(matAfterBest - matAfterPlayed));
  }
  return Math.max(0, Math.round(matAfterPlayed - matAfterBest));
}

function applyUci(game: Chess, uciRaw: string): boolean {
  const u = uciRaw.trim().toLowerCase();
  if (u.length < 4) return false;
  const from = u.slice(0, 2) as Square;
  const to = u.slice(2, 4) as Square;
  const promotion =
    u.length > 4 ? (u.slice(4, 5) as "q" | "r" | "b" | "n") : undefined;
  try {
    const m = game.move({
      from,
      to,
      promotion: promotion ?? "q",
    });
    return !!m;
  } catch {
    return false;
  }
}

const MATE_BASE = 32000;
const MATE_STEP = 80;

/**
 * Оцінка з точки зору сторони, що ходить у переданій позиції
 * (Stockfish UCI повертає cp/mate саме від side-to-move).
 */
function evalSideToMoveCentipawns(m: EngineMove): number {
  if (m.scoreMate != null && m.scoreMate !== 0) {
    const n = m.scoreMate;
    if (n > 0) return MATE_BASE - n * MATE_STEP;
    return -MATE_BASE - Math.abs(n) * MATE_STEP;
  }
  return m.scoreCp ?? 0;
}

/**
 * Те саме значення, але приведене до точки зору білих.
 * Корисно щоб напряму порівнювати оцінки двох позицій із однаковим
 * (або різним) side-to-move.
 */
function evalWhiteCentipawns(m: EngineMove, sideToMove: "w" | "b"): number {
  const side = evalSideToMoveCentipawns(m);
  return sideToMove === "w" ? side : -side;
}

function uciFirstFour(uci: string): string {
  return uci.trim().toLowerCase().slice(0, 4);
}

/**
 * Пороги вирівняні з Lichess / chess.com:
 *  ~0 сп       → найкращий
 *  до 10 сп    → відмінно (≈ best)
 *  до 50 сп    → добре
 *  до 100 сп   → неточність (?!)
 *  до 200 сп   → помилка (?)
 *  ≥ 200 сп    → груба помилка (??)
 *
 * Окремий щабель «miss» лишаємо в типі для майбутнього (наприклад, для
 * пропущеної тактики), але звичайна централайз-втрата у нього не потрапляє.
 */
export function cpLostToQuality(cpLost: number, playedWasBest: boolean): MoveQuality {
  if (playedWasBest && cpLost <= 5) return "best";
  if (cpLost <= 0) return "best";
  if (cpLost < 10) return "excellent";
  if (cpLost < 50) return "good";
  if (cpLost < 100) return "inaccuracy";
  if (cpLost < 200) return "mistake";
  return "blunder";
}

/**
 * Centipawn loss для сторони, що щойно зіграла: порівняння оцінки після
 * найкращого ходу (skill 20) з оцінкою після фактичного ходу.
 */
export async function analyzeMoveQuality(
  engine: ChessEngine,
  fenBeforeMove: string,
  uciPlayed: string,
  opts: { movetimeMs?: number; depth?: number } = {},
): Promise<MoveQualityAnalysis> {
  const movetimeMs = opts.movetimeMs ?? 220;
  const depth = opts.depth;

  const root = new Chess(fenBeforeMove);
  const mover = root.turn();

  const best = await engine.bestMove({
    fen: fenBeforeMove,
    skill: ANALYSIS_SKILL,
    movetimeMs: depth ? undefined : movetimeMs,
    depth,
  });
  const bestUciRaw = (best.bestmove ?? "").trim();
  if (!bestUciRaw || bestUciRaw === "(none)") {
    return { cpLost: 0, quality: "best", playedWasBest: true };
  }

  const playedWasBest =
    uciFirstFour(uciPlayed) === uciFirstFour(bestUciRaw);

  const gBest = new Chess(fenBeforeMove);
  if (!applyUci(gBest, bestUciRaw)) {
    return { cpLost: 0, quality: "best", playedWasBest: true };
  }
  const fenAfterBest = gBest.fen();

  const gPlayed = new Chess(fenBeforeMove);
  if (!applyUci(gPlayed, uciPlayed)) {
    return { cpLost: 0, quality: "best", playedWasBest: true };
  }
  const fenAfterPlayed = gPlayed.fen();

  const mBest = await engine.bestMove({
    fen: fenAfterBest,
    skill: ANALYSIS_SKILL,
    movetimeMs: depth ? undefined : movetimeMs,
    depth,
  });
  const mPlayed = await engine.bestMove({
    fen: fenAfterPlayed,
    skill: ANALYSIS_SKILL,
    movetimeMs: depth ? undefined : movetimeMs,
    depth,
  });

  /**
   * Після зробленого ходу сторона, що ходить, — опонент того, хто щойно
   * грав. UCI повертає score від side-to-move, тому беремо це до уваги
   * при зведенні оцінок до спільної (білої) POV.
   */
  const sideAfter: "w" | "b" = mover === "w" ? "b" : "w";

  const wBest = evalWhiteCentipawns(mBest, sideAfter);
  const wPlayed = evalWhiteCentipawns(mPlayed, sideAfter);

  /**
   * Втрата завжди невідʼємна для сторони, що щойно ходила.
   * Для білих: чим менший білий eval після зіграного — тим гірше.
   * Для чорних — навпаки.
   */
  const engineCpLost =
    mover === "w"
      ? Math.max(0, Math.round(wBest - wPlayed))
      : Math.max(0, Math.round(wPlayed - wBest));

  const matBest = materialAdvantageWhiteFromFen(fenAfterBest);
  const matPlayed = materialAdvantageWhiteFromFen(fenAfterPlayed);
  const materialCpLost = materialCpLostForMover(mover, matBest, matPlayed);

  /** Рушій на малій глибині недобачує тактику; матеріал дає нижню межу втрати. */
  const cpLost = Math.max(engineCpLost, materialCpLost);

  const quality = cpLostToQuality(cpLost, playedWasBest);

  return { cpLost, quality, playedWasBest };
}
