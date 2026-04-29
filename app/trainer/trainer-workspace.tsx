"use client";

import { Chess, type Move, type Square } from "chess.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Arrow } from "react-chessboard";
import {
  ChessBoard,
  DEFAULT_BOT_ELO,
  engineLevelFromBotElo,
  useStockfishEngine,
  waitStockfishIdle,
  type EngineMove,
  type EngineMoveInfo,
  type PlayerColor,
  type StatusInfo,
} from "@/components/chess";
import {
  CoachPanel,
  useChessCoach,
  type CoachSideTag,
  type CoachStatus,
} from "@/components/coach";
import type { CommentInput } from "@/lib/commentator";
import { analyzeMoveQuality, type MoveQuality } from "@/lib/chess/moveQuality";
import { CapturedPiecesHud } from "@/components/trainer/CapturedPiecesHud";
import { EloLevelScrollPicker } from "@/components/trainer/EloLevelScrollPicker";
import { MoveQualityPanel } from "@/components/trainer/MoveQualityPanel";

const COLOR_OPTIONS: { id: PlayerColor; label: string; subtitle: string }[] = [
  { id: "white", label: "Білі", subtitle: "Ви ходите перші" },
  { id: "black", label: "Чорні", subtitle: "Бот починає партію" },
];

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const HINT_ARROW_COLOR = "rgba(45, 212, 191, 0.9)";
const PREVIEW_ARROW_COLOR = "rgba(245, 200, 66, 0.9)";

function stripSanDecor(s: string): string {
  return s.replace(/[!?+#]+$/u, "").trim();
}

function sanEquivalent(a: string, b: string): boolean {
  return stripSanDecor(a) === stripSanDecor(b);
}

function applyUciMove(game: Chess, uci: string): boolean {
  const u = uci.trim().toLowerCase();
  if (u.length < 4) return false;
  try {
    const from = u.slice(0, 2) as Square;
    const to = u.slice(2, 4) as Square;
    const promotion =
      u.length > 4 ? (u.slice(4, 5) as "q" | "r" | "b" | "n") : undefined;
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

function findVerboseSan(
  game: Chess,
  san: string,
  moverColor: PlayerColor | null,
): Move | null {
  const moves = game.moves({ verbose: true });
  for (const m of moves) {
    if (!sanEquivalent(san, m.san)) continue;
    const mc: PlayerColor = m.color === "w" ? "white" : "black";
    if (moverColor !== null && mc !== moverColor) continue;
    return m;
  }
  try {
    const tmp = new Chess(game.fen());
    const mv = tmp.move(san);
    if (!mv) return null;
    const mc: PlayerColor = mv.color === "w" ? "white" : "black";
    if (moverColor !== null && mc !== moverColor) return null;
    return mv;
  } catch {
    return null;
  }
}

/** Остання позиція `\b${square}\b` у тексті (для превʼю клітинки при кількох фігурах на полі призначення). */
function lastSquareMentionIndex(text: string, square: string): number {
  const sq = square.toLowerCase();
  const re = new RegExp(`\\b${sq}\\b`, "gi");
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) last = m.index;
  return last;
}

/**
 * Якщо кілька ходів ведуть на `target`, обираємо:
 * 1) збіг із першим відповідним ходом опонента в PV після підказки;
 * 2) кандидат, чий `from` згадано в тексті останнім перед токеном (наприклад «коня на f6» → **d7**);
 * 3) взяття; 4) стабільний порядок за `from`.
 */
function pickOpponentMoveToSquare(
  afterPlayer: Chess,
  target: Square,
  opts: {
    fenBeforeHint: string;
    hint: Arrow;
    pvUci: string[] | null | undefined;
    textLookback: string;
  },
): Move {
  const moves = afterPlayer
    .moves({ verbose: true })
    .filter((m) => m.to === target);
  if (moves.length <= 1) return moves[0]!;

  const { fenBeforeHint, hint, pvUci, textLookback } = opts;

  const game = new Chess(fenBeforeHint);
  const hintMove = game.move({
    from: hint.startSquare as Square,
    to: hint.endSquare as Square,
    promotion: "q",
  });
  if (hintMove && pvUci?.length) {
    let pi = 0;
    const u0 = pvUci[0]?.toLowerCase();
    const hintUci = `${hintMove.from}${hintMove.to}`.toLowerCase();
    if (u0 && u0.slice(0, 4) === hintUci.slice(0, 4)) pi = 1;
    const next = pvUci[pi];
    if (next && next.length >= 4) {
      const u = next.toLowerCase();
      const from = u.slice(0, 2) as Square;
      const to = u.slice(2, 4) as Square;
      if (to === target) {
        const hit = moves.find((m) => m.from === from && m.to === to);
        if (hit) return hit;
      }
    }
  }

  let best = moves[0]!;
  let bestIdx = -1;
  for (const m of moves) {
    const idx = lastSquareMentionIndex(textLookback, m.from);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = m;
    }
  }
  if (bestIdx >= 0) return best;

  const capture = moves.find((m) => m.captured);
  if (capture) return capture;

  return [...moves].sort((a, b) => a.from.localeCompare(b.from))[0]!;
}

/** Шукаємо SAN уздовж PV Stockfish після підказаного ходу (учень / суперник у варіанті). */
function findSanAlongHintPv(
  fenBeforeHint: string,
  hint: Arrow,
  pvUci: string[],
  san: string,
  targetMover: PlayerColor,
): Move | null {
  if (!pvUci.length) return null;
  const game = new Chess(fenBeforeHint);
  const from = hint.startSquare as Square;
  const to = hint.endSquare as Square;
  const hintMove = game.move({ from, to, promotion: "q" });
  if (!hintMove) return null;

  let pi = 0;
  const u0 = pvUci[0]?.toLowerCase();
  const hintUci = `${hintMove.from}${hintMove.to}`.toLowerCase();
  if (u0 && u0.slice(0, 4) === hintUci.slice(0, 4)) {
    pi = 1;
  }

  for (; pi < Math.min(pvUci.length, 28); pi++) {
    const turn: PlayerColor = game.turn() === "w" ? "white" : "black";
    if (turn === targetMover) {
      const hit = findVerboseSan(game, san, targetMover);
      if (hit) return hit;
    }
    if (!applyUciMove(game, pvUci[pi])) break;
  }

  const finalTurn: PlayerColor = game.turn() === "w" ? "white" : "black";
  if (finalTurn === targetMover) {
    return findVerboseSan(game, san, targetMover);
  }
  return null;
}

/** Скільки мілісекунд показувати смугу з результатом на дошці. */
const GAME_END_BANNER_MS = 5000;

/**
 * Скільки разів підряд новий хід бота може настати під час завантаження
 * підказки до того, як AI-тренер сам себе вимикає (захист від «зависання» на
 * повільних мережах). Низький ELO бота може ходити швидше за TTFT Gemini, тож
 * поріг має бути терплячим.
 */
const TRAINER_STALE_LIMIT = 6;

function isTerminalTrainerStatus(status: StatusInfo["status"]): boolean {
  return (
    status === "checkmate" ||
    status === "stalemate" ||
    status === "draw" ||
    status === "gameOver"
  );
}

/** Текст смуги після завершення партії (мат / пат / інша нічия). */
function gameEndBannerCopy(
  statusInfo: StatusInfo,
  playerColor: PlayerColor,
): { title: string; subtitle?: string } {
  const s = statusInfo.status;
  if (s === "checkmate") {
    const winner = statusInfo.winner;
    if (winner && winner !== "draw" && winner === playerColor) {
      return { title: "Ви перемогли через мат" };
    }
    return { title: "Вам поставили мат" };
  }
  if (s === "stalemate") {
    const playerStalemated = statusInfo.turn === playerColor;
    return {
      title: playerStalemated
        ? "Нічия, у вас не залишилось ходів"
        : "Нічия, у суперника не залишилось ходів",
    };
  }
  if (s === "draw") {
    return {
      title: "Нічия",
      subtitle: "Партія завершилась нічиєю",
    };
  }
  return { title: "Партія завершена" };
}

export function TrainerWorkspace() {
  const { engine, status: engineStatus } = useStockfishEngine();
  const {
    engine: analysisEngineRaw,
    status: analysisEngineStatus,
  } = useStockfishEngine();
  const [playerColor, setPlayerColor] = useState<PlayerColor>("white");
  /** Орієнтовний ELO бота (200…2400, крок 200) → пресет Stockfish. */
  const [botElo, setBotElo] = useState(DEFAULT_BOT_ELO);
  const level = useMemo(() => engineLevelFromBotElo(botElo), [botElo]);
  const [boardKey, setBoardKey] = useState(0);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [lastEngineMove, setLastEngineMove] = useState<EngineMoveInfo | null>(
    null,
  );
  const [hintArrows, setHintArrows] = useState<Arrow[]>([]);
  /** PV української підказки Stockfish (UCI), для превʼю SAN у варіанті після ходу учня. */
  const [hintPvUci, setHintPvUci] = useState<string[] | null>(null);
  const [coachPreviewArrows, setCoachPreviewArrows] = useState<Arrow[]>([]);
  const [coachPreviewSquares, setCoachPreviewSquares] = useState<Square[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const [isPartyPanelOpen, setIsPartyPanelOpen] = useState(true);
  const [isMoveQualityOpen, setIsMoveQualityOpen] = useState(false);
  const [gameEndBanner, setGameEndBanner] = useState<{
    title: string;
    subtitle?: string;
  } | null>(null);

  const statusInfoRef = useRef<StatusInfo | null>(null);
  const playerColorRef = useRef(playerColor);

  useLayoutEffect(() => {
    statusInfoRef.current = statusInfo;
    playerColorRef.current = playerColor;
  });

  /** Другий Stockfish — лише аналіз якості ходів, без конфлікту з ходом бота. */
  const [partyCpBalance, setPartyCpBalance] = useState(0);
  const [lastPlayerAnalysis, setLastPlayerAnalysis] = useState<{
    cpLost: number;
    quality: MoveQuality;
  } | null>(null);
  const [lastBotAnalysis, setLastBotAnalysis] = useState<{
    cpLost: number;
    quality: MoveQuality;
  } | null>(null);
  const [moveAnalysisLoading, setMoveAnalysisLoading] = useState(false);
  /** Окремі лічильники, щоб аналіз гравця і бота не скасовував один одного. */
  const playerAnalysisGenRef = useRef(0);
  const botAnalysisGenRef = useRef(0);
  /** К-сть незавершених аналізів — для глобального індикатора «Аналіз…». */
  const pendingAnalysisCountRef = useRef(0);
  const lastAnalyzedPlyKeyRef = useRef<string | null>(null);

  const [trainerEnabled, setTrainerEnabled] = useState(false);
  /** Бірюзова стрілка + PV після ходу бота без увімкненого AI-тренера. */
  const [hintArrowEnabled, setHintArrowEnabled] = useState(false);
  const hintArrowEnabledRef = useRef(false);

  useEffect(() => {
    hintArrowEnabledRef.current = hintArrowEnabled;
  }, [hintArrowEnabled]);

  const coach = useChessCoach();

  /** Синхронно зі стейтом — для `runHintCommentary` без застарілих замикань. */
  const hintBusyRef = useRef(false);
  const coachStatusRef = useRef<CoachStatus>("idle");
  const trainerEnabledRef = useRef(false);

  useLayoutEffect(() => {
    hintBusyRef.current = hintBusy;
    coachStatusRef.current = coach.status;
    trainerEnabledRef.current = trainerEnabled;
  }, [hintBusy, coach.status, trainerEnabled]);

  /** Скільки разів підряд новий хід бота настав, поки ще йшло завантаження підказки. */
  const trainerStaleWhileLoadingStreakRef = useRef(0);
  /** Скасовує застарілі `runHintCommentary` після нового тригера. */
  const hintCommentaryGenRef = useRef(0);

  const handleNewGame = useCallback(() => {
    setStatusInfo(null);
    setLastEngineMove(null);
    setHintArrows([]);
    setHintPvUci(null);
    setCoachPreviewArrows([]);
    setCoachPreviewSquares([]);
    setHintError(null);
    coach.reset();
    trainerStaleWhileLoadingStreakRef.current = 0;
    hintCommentaryGenRef.current += 1;
    playerAnalysisGenRef.current += 1;
    botAnalysisGenRef.current += 1;
    pendingAnalysisCountRef.current = 0;
    lastAnalyzedPlyKeyRef.current = null;
    setPartyCpBalance(0);
    setLastPlayerAnalysis(null);
    setLastBotAnalysis(null);
    setMoveAnalysisLoading(false);
    setIsMoveQualityOpen(false);
    setGameEndBanner(null);
    setBoardKey((k) => k + 1);
  }, [coach]);

  const handleColorChange = useCallback(
    (color: PlayerColor) => {
      setPlayerColor(color);
      handleNewGame();
    },
    [handleNewGame],
  );

  const prevBotEloRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevBotEloRef.current;
    if (prev === null) {
      prevBotEloRef.current = botElo;
      return;
    }
    if (prev === botElo) return;
    prevBotEloRef.current = botElo;
    const hadMoves = (statusInfoRef.current?.historySan?.length ?? 0) > 0;
    if (hadMoves) {
      queueMicrotask(() => handleNewGame());
    }
  }, [botElo, handleNewGame]);

  const opponent = engineStatus === "ready" ? engine : null;
  const analysisEngine =
    analysisEngineStatus === "ready" ? analysisEngineRaw : null;

  // Аналіз якості останнього ходу (Stockfish, skill 20) — окремий worker.
  useEffect(() => {
    if (!analysisEngine || !statusInfo?.lastMove) return;

    const hist = statusInfo.historySan;
    if (hist.length === 0) return;

    const lm = statusInfo.lastMove;
    const plyKey = `${boardKey}:${hist.length}:${lm.uci}`;
    if (lastAnalyzedPlyKeyRef.current === plyKey) return;
    lastAnalyzedPlyKeyRef.current = plyKey;

    const g = new Chess();
    for (let i = 0; i < hist.length - 1; i++) {
      g.move(hist[i]!);
    }
    const fenBefore = g.fen();
    const uci = lm.uci;

    const moverIsPlayer = lm.color === playerColor;
    const genRef = moverIsPlayer ? playerAnalysisGenRef : botAnalysisGenRef;
    const gen = ++genRef.current;
    pendingAnalysisCountRef.current += 1;
    queueMicrotask(() => setMoveAnalysisLoading(true));

    void (async () => {
      try {
        await waitStockfishIdle(analysisEngine);
        if (gen !== genRef.current) return;
        const r = await analyzeMoveQuality(analysisEngine, fenBefore, uci, {
          movetimeMs: 280,
          depth: 15,
        });
        if (gen !== genRef.current) return;
        const entry = { cpLost: r.cpLost, quality: r.quality };
        if (moverIsPlayer) {
          setLastPlayerAnalysis(entry);
        } else {
          setLastBotAnalysis(entry);
        }
        setPartyCpBalance((b) => b + (moverIsPlayer ? -r.cpLost : r.cpLost));
      } catch {
        // Не чистимо рядки при помилці — лишимо попередню оцінку.
      } finally {
        pendingAnalysisCountRef.current = Math.max(
          0,
          pendingAnalysisCountRef.current - 1,
        );
        if (pendingAnalysisCountRef.current === 0) {
          setMoveAnalysisLoading(false);
        }
      }
    })();
  }, [analysisEngine, boardKey, playerColor, statusInfo]);

  const isGameOver = useMemo(() => {
    if (!statusInfo) return false;
    return (
      statusInfo.status === "checkmate" ||
      statusInfo.status === "stalemate" ||
      statusInfo.status === "draw" ||
      statusInfo.status === "gameOver"
    );
  }, [statusInfo]);

  const gameEndScheduleKey = useMemo(() => {
    if (!statusInfo) return null;
    if (!isTerminalTrainerStatus(statusInfo.status)) return null;
    return `${boardKey}:${statusInfo.status}:${statusInfo.fen}:${statusInfo.historySan.length}`;
  }, [boardKey, statusInfo?.fen, statusInfo?.status, statusInfo?.historySan.length]); // eslint-disable-line react-hooks/exhaustive-deps -- chess state via fen/ply, not object identity

  useEffect(() => {
    if (!gameEndScheduleKey) {
      queueMicrotask(() => setGameEndBanner(null));
      return;
    }
    const si = statusInfoRef.current;
    const pc = playerColorRef.current;
    if (!si || !isTerminalTrainerStatus(si.status)) return;

    queueMicrotask(() => setGameEndBanner(gameEndBannerCopy(si, pc)));
    const id = window.setTimeout(() => setGameEndBanner(null), GAME_END_BANNER_MS);
    return () => window.clearTimeout(id);
  }, [gameEndScheduleKey]);

  const statusText = useMemo(() => {
    if (engineStatus === "loading") return "Завантажую Stockfish…";
    if (engineStatus === "error") return "Не вдалося завантажити рушій";
    if (!statusInfo) {
      return playerColor === "white"
        ? "Ваш хід білими"
        : "Бот починає білими";
    }
    if (statusInfo.status === "checkmate") {
      const winner = statusInfo.winner;
      const playerWon = winner === playerColor;
      return playerWon ? "Мат! Ви виграли" : "Мат. Бот переміг";
    }
    if (statusInfo.status === "stalemate") return "Пат — нічия";
    if (statusInfo.status === "draw") return "Нічия";
    if (statusInfo.status === "gameOver") return "Партія завершена";
    if (statusInfo.inCheck) {
      return statusInfo.turn === playerColor ? "Вам шах" : "Ви оголосили шах";
    }
    return statusInfo.turn === playerColor ? "Ваш хід" : "Бот думає…";
  }, [engineStatus, playerColor, statusInfo]);

  const buildContext = useCallback((): CommentInput => {
    const lastEngineMatchesLastMove =
      lastEngineMove &&
      statusInfo?.lastMove &&
      lastEngineMove.color === statusInfo.lastMove.color;

    return {
      fen: statusInfo?.fen ?? STARTING_FEN,
      pgnHistory: statusInfo?.historySan ?? [],
      playerColor,
      level: { id: level.id, label: level.label, hint: level.hint },
      lastMove: statusInfo?.lastMove,
      engineInfo: lastEngineMatchesLastMove
        ? {
            bestmove: lastEngineMove.bestmove,
            pv: lastEngineMove.pv,
            scoreCp: lastEngineMove.scoreCp,
            scoreMate: lastEngineMove.scoreMate,
            color: lastEngineMove.color,
          }
        : undefined,
    };
  }, [lastEngineMove, level, playerColor, statusInfo]);

  /**
   * Stockfish → бірюзова стрілка на дошці + PV (для превʼю в коментарі).
   */
  const runStockfishHint =
    useCallback(async (): Promise<
      { ok: true; move: EngineMove } | { ok: false }
    > => {
      if (isGameOver || !opponent) return { ok: false };
      setHintError(null);
      const context = buildContext();
      try {
        // Швидкий хінт: спершу обмежуємось ~600мс, але дозволяємо рушію
        // зупинитись раніше (depth 14 на простих позиціях). Це дає TTFT-економію
        // ≈ 900мс перед стартом стріму від Gemini.
        const move = await opponent.bestMove({
          fen: context.fen,
          skill: 20,
          movetimeMs: 600,
          depth: 14,
        });

        const uci = move.bestmove;
        if (!uci || uci === "(none)") {
          throw new Error("Рушій не повернув ходу");
        }

        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        setHintArrows([
          { startSquare: from, endSquare: to, color: HINT_ARROW_COLOR },
        ]);
        setHintPvUci(move.pv ?? null);

        return { ok: true, move };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Не вдалося отримати підказку";
        setHintError(message);
        return { ok: false };
      }
    }, [buildContext, isGameOver, opponent]);

  /**
   * Після ходу бота: Stockfish → стрілка → стрім коментаря Gemini (mode=hint).
   * Якщо під час стріму знову зіграв бот — скасовуємо попередній запит і
   * починаємо новий; 3 такі переривання підряд — вимикаємо тренера.
   */
  const runHintCommentary = useCallback(async () => {
    if (isGameOver || !opponent) return;

    const wasLoading =
      coachStatusRef.current === "streaming" || hintBusyRef.current;

    if (trainerEnabledRef.current && wasLoading) {
      trainerStaleWhileLoadingStreakRef.current += 1;
      if (trainerStaleWhileLoadingStreakRef.current >= TRAINER_STALE_LIMIT) {
        trainerStaleWhileLoadingStreakRef.current = 0;
        hintCommentaryGenRef.current += 1;
        setTrainerEnabled(false);
        coach.cancel();
        opponent.stop();
        await waitStockfishIdle(opponent);
        setHintBusy(false);
        setHintError(null);
        coach.reset();
        return;
      }
    } else if (trainerEnabledRef.current) {
      trainerStaleWhileLoadingStreakRef.current = 0;
    }

    const gen = ++hintCommentaryGenRef.current;
    coach.cancel();
    opponent.stop();
    await waitStockfishIdle(opponent);

    setHintBusy(true);
    try {
      if (gen !== hintCommentaryGenRef.current) return;
      const result = await runStockfishHint();
      if (gen !== hintCommentaryGenRef.current) return;
      if (!result.ok) return;

      const context = buildContext();
      const sideToMove: PlayerColor =
        context.fen.split(" ")[1] === "w" ? "white" : "black";

      if (gen !== hintCommentaryGenRef.current) return;
      await coach.ask({
        ...context,
        mode: "hint",
        engineInfo: {
          bestmove: result.move.bestmove,
          pv: result.move.pv,
          scoreCp: result.move.scoreCp,
          scoreMate: result.move.scoreMate,
          color: sideToMove,
        },
      });
      if (gen === hintCommentaryGenRef.current) {
        trainerStaleWhileLoadingStreakRef.current = 0;
      }
    } catch (err) {
      if (gen === hintCommentaryGenRef.current) {
        const message =
          err instanceof Error ? err.message : "Не вдалося отримати підказку";
        setHintError(message);
      }
    } finally {
      if (gen === hintCommentaryGenRef.current) {
        setHintBusy(false);
      }
    }
  }, [buildContext, coach, isGameOver, opponent, runStockfishHint]);

  // Авто-тренер: тригеримо тільки після ходу бота (стало черга гравця).
  // Ключ — uci+довжина історії, щоб не повторно стріляти на той самий хід.
  const lastTriggeredKey = useRef<string | null>(null);

  useEffect(() => {
    if (!trainerEnabled && !hintArrowEnabled) return;
    if (engineStatus !== "ready") return;
    if (!statusInfo || isGameOver) return;
    const last = statusInfo.lastMove;
    if (!last) return;
    if (last.color === playerColor) return;

    const key = `${last.color}:${last.uci}:${statusInfo.historySan.length}`;
    if (lastTriggeredKey.current === key) return;
    lastTriggeredKey.current = key;

    queueMicrotask(() => {
      if (trainerEnabled) {
        void runHintCommentary();
      } else {
        void runStockfishHint();
      }
    });
  }, [
    trainerEnabled,
    hintArrowEnabled,
    statusInfo,
    isGameOver,
    engineStatus,
    playerColor,
    runHintCommentary,
    runStockfishHint,
  ]);

  // Скидаємо лічильник тригерів при новій партії / зміні сторони / режимах підказки.
  useEffect(() => {
    lastTriggeredKey.current = null;
  }, [boardKey, playerColor, trainerEnabled, hintArrowEnabled]);

  const handleToggleTrainer = useCallback(() => {
    setTrainerEnabled((prev) => {
      const next = !prev;
      trainerStaleWhileLoadingStreakRef.current = 0;
      if (!next) {
        hintCommentaryGenRef.current += 1;
        coach.cancel();
        opponent?.stop();
        setHintBusy(false);
        setHintError(null);
        if (!hintArrowEnabledRef.current) {
          setHintArrows([]);
          setHintPvUci(null);
        }
      }
      return next;
    });
  }, [coach, opponent]);

  const handleCoachReset = useCallback(() => {
    coach.reset();
    setHintError(null);
  }, [coach]);

  const handleCoachClearPreview = useCallback(() => {
    setCoachPreviewArrows([]);
    setCoachPreviewSquares([]);
  }, []);

  /** Підказка Stockfish + жовті превʼю з тексту тренера — при взаємодії з дошкою. */
  const dismissBoardOverlays = useCallback(() => {
    setHintArrows([]);
    setHintPvUci(null);
    setCoachPreviewArrows([]);
    setCoachPreviewSquares([]);
  }, []);

  // Прибираємо стрілку-хінт і превʼю тренера, як тільки гравець зіграв.
  useEffect(() => {
    if (!statusInfo?.lastMove) return;
    if (statusInfo.lastMove.color !== playerColor) return;
    queueMicrotask(() => dismissBoardOverlays());
  }, [
    dismissBoardOverlays,
    playerColor,
    statusInfo?.historySan?.length,
    statusInfo?.lastMove,
    statusInfo?.lastMove?.uci,
  ]);

  /**
   * Намагаємось зіграти запропонований хід гравця (з `hintArrows[0]`) на копії
   * поточної позиції. Повертаємо гру вже на черзі опонента, або null.
   */
  const simulateAfterPlayerHint = useCallback((): Chess | null => {
    const currentFen = statusInfo?.fen ?? STARTING_FEN;
    if (hintArrows.length === 0) return null;
    const recommended = hintArrows[0];
    const startSquare = recommended.startSquare as Square | undefined;
    const endSquare = recommended.endSquare as Square | undefined;
    if (!startSquare || !endSquare) return null;
    const game = new Chess(currentFen);
    const sideToMove: PlayerColor =
      currentFen.split(" ")[1] === "w" ? "white" : "black";
    if (sideToMove !== playerColor) return null;
    try {
      const played = game.move({
        from: startSquare,
        to: endSquare,
        promotion: "q",
      });
      if (!played) return null;
      return game;
    } catch {
      return null;
    }
  }, [hintArrows, playerColor, statusInfo?.fen]);

  const handleCoachPreviewSquare = useCallback(
    (
      square: string,
      isOpponentContext: boolean,
      textBeforeToken: string,
    ) => {
      const target = square as Square;
      setCoachPreviewArrows([]);
      setCoachPreviewSquares([target]);

      // Жовту стрілку малюємо ЛИШЕ якщо в реченні йдеться про хід опонента.
      if (!isOpponentContext) return;

      const recommended = hintArrows[0];
      if (recommended && recommended.endSquare === square) return;

      const afterPlayer = simulateAfterPlayerHint();
      if (!afterPlayer) return;

      const opponentMoves = afterPlayer
        .moves({ verbose: true })
        .filter((m) => m.to === target);
      if (opponentMoves.length === 0) return;

      const currentFen = statusInfo?.fen ?? STARTING_FEN;
      const hint = hintArrows[0];
      const best =
        opponentMoves.length === 1
          ? opponentMoves[0]
          : hint
            ? pickOpponentMoveToSquare(afterPlayer, target, {
                fenBeforeHint: currentFen,
                hint,
                pvUci: hintPvUci,
                textLookback: textBeforeToken,
              })
            : (opponentMoves.find((m) => m.captured) ??
              [...opponentMoves].sort((a, b) =>
                a.from.localeCompare(b.from),
              )[0]);

      setCoachPreviewSquares([best.from, best.to]);
      setCoachPreviewArrows([
        {
          startSquare: best.from,
          endSquare: best.to,
          color: PREVIEW_ARROW_COLOR,
        },
      ]);
    },
    [hintArrows, hintPvUci, simulateAfterPlayerHint, statusInfo?.fen],
  );

  const handleCoachPreviewMove = useCallback(
    (san: string, sideTag: CoachSideTag) => {
      const currentFen = statusInfo?.fen ?? STARTING_FEN;
      const normalizedSan = san
        .trim()
        .replace(/^[\s.…]+/u, "")
        .replace(/[!?]+$/g, "");

      const opponentColor: PlayerColor =
        playerColor === "white" ? "black" : "white";

      const preferredMover: PlayerColor | null =
        sideTag === "player"
          ? playerColor
          : sideTag === "opponent"
            ? opponentColor
            : null;

      const sideOfMove = (color: "w" | "b"): PlayerColor =>
        color === "w" ? "white" : "black";

      const showMovePreview = (move: Move) => {
        const mover = sideOfMove(move.color);
        const isOpponentMove = mover !== playerColor;
        setCoachPreviewSquares([move.from, move.to]);
        setCoachPreviewArrows(
          isOpponentMove
            ? [
                {
                  startSquare: move.from,
                  endSquare: move.to,
                  color: PREVIEW_ARROW_COLOR,
                },
              ]
            : [],
        );
      };

      const tryStrict = (game: Chess): Move | null =>
        preferredMover !== null
          ? findVerboseSan(game, normalizedSan, preferredMover)
          : null;

      let found = tryStrict(new Chess(currentFen));
      if (found) {
        showMovePreview(found);
        return;
      }

      const afterPlayer = simulateAfterPlayerHint();
      if (afterPlayer) {
        found = tryStrict(afterPlayer);
        if (found) {
          showMovePreview(found);
          return;
        }
      }

      const hint = hintArrows[0];
      if (hintPvUci?.length && hint && preferredMover !== null) {
        const alongPv = findSanAlongHintPv(
          currentFen,
          hint,
          hintPvUci,
          normalizedSan,
          preferredMover,
        );
        if (alongPv) {
          showMovePreview(alongPv);
          return;
        }
      }

      if (
        sideTag === null &&
        hintPvUci?.length &&
        hintArrows[0]
      ) {
        const asPlayer = findSanAlongHintPv(
          currentFen,
          hintArrows[0],
          hintPvUci,
          normalizedSan,
          playerColor,
        );
        if (asPlayer) {
          showMovePreview(asPlayer);
          return;
        }
        const asOpp = findSanAlongHintPv(
          currentFen,
          hintArrows[0],
          hintPvUci,
          normalizedSan,
          opponentColor,
        );
        if (asOpp) {
          showMovePreview(asOpp);
          return;
        }
      }

      if (preferredMover !== null) return;

      try {
        const game = new Chess(currentFen);
        const move = game.move(normalizedSan);
        if (move) {
          showMovePreview(move);
          return;
        }
      } catch {
        /* не валідний SAN */
      }

      if (afterPlayer) {
        try {
          const move = afterPlayer.move(normalizedSan);
          if (move) showMovePreview(move);
        } catch {
          /* ignore */
        }
      }
    },
    [
      hintArrows,
      hintPvUci,
      playerColor,
      simulateAfterPlayerHint,
      statusInfo?.fen,
    ],
  );

  const coachPanel = (
    <CoachPanel
      text={coach.text}
      status={coach.status}
      error={hintError ?? coach.error}
      enabled={trainerEnabled}
      onToggle={handleToggleTrainer}
      onReset={handleCoachReset}
      busy={hintBusy}
      onPreviewSquare={handleCoachPreviewSquare}
      onPreviewMove={handleCoachPreviewMove}
      onClearPreview={handleCoachClearPreview}
    />
  );

  return (
    <div className="mt-6 grid min-w-0 gap-4 md:mt-10 md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
      <div className="min-w-0 space-y-2 md:space-y-6">
        {/* Mobile: якість ходів над тренером; дошка нижче. */}
        <div className="space-y-2 px-1 min-w-0 md:px-0 lg:hidden">
          <MoveQualityPanel
            lastPlayer={lastPlayerAnalysis}
            lastBot={lastBotAnalysis}
            partyCpBalance={partyCpBalance}
            loading={moveAnalysisLoading}
            expanded={isMoveQualityOpen}
            onExpandedChange={setIsMoveQualityOpen}
            instanceId="mq-mobile"
          />
          {coachPanel}
        </div>

        <CapturedPiecesHud
          fen={statusInfo?.fen ?? STARTING_FEN}
          historySan={statusInfo?.historySan ?? []}
          playerColor={playerColor}
          mineAboveHistoryOnMobile
        >
          <div className="relative mx-auto w-full max-w-none md:max-w-[min(100%,560px)] lg:mx-0">
            <ChessBoard
              key={boardKey}
              className="w-full"
              boardId="trainer-main"
              playerColor={playerColor}
              opponent={opponent}
              engineSkill={level.skill}
              engineMovetimeMs={level.movetimeMs}
              engineDepth={level.depth}
              engineUseUciEloLimit={level.useUciEloLimit}
              engineUciElo={level.uciElo}
              suggestionArrows={hintArrows}
              previewArrows={coachPreviewArrows}
              previewSquares={coachPreviewSquares}
              onStatusChange={setStatusInfo}
              onEngineMove={setLastEngineMove}
              onDismissBoardOverlays={dismissBoardOverlays}
            />
            {gameEndBanner ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 border-y border-white/15 bg-black/58 py-3 shadow-inner backdrop-blur-[3px] dark:bg-black/68"
                role="status"
                aria-live="polite"
              >
                <p className="px-4 text-center text-sm font-semibold leading-snug text-white sm:text-base">
                  {gameEndBanner.title}
                </p>
                {gameEndBanner.subtitle ? (
                  <p className="mt-1 px-4 text-center text-xs font-medium leading-snug text-white/85 sm:text-sm">
                    {gameEndBanner.subtitle}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </CapturedPiecesHud>
      </div>

      <aside className="space-y-6 px-1 md:px-0">
        <section className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40">
          <header
            className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-2 ${
              !isPartyPanelOpen
                ? "cursor-pointer rounded-lg outline-offset-2 hover:bg-muted/40"
                : ""
            }`}
            onClick={() => {
              if (!isPartyPanelOpen) setIsPartyPanelOpen(true);
            }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="shrink-0 text-sm font-semibold tracking-tight text-foreground">
                Партія
              </p>
              {!isPartyPanelOpen ? (
                <span
                  className="min-w-0 truncate rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-foreground ring-1 ring-primary/25"
                  title={`${level.label} ${level.hint}`}
                >
                  <span className="text-muted-foreground"> {level.hint}</span>
                </span>
              ) : null}
            </div>
            <div
              className="flex shrink-0 items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handleNewGame}
                className="rounded-md border border-border/80 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Нова
              </button>
              <button
                type="button"
                onClick={() => setIsPartyPanelOpen((prev) => !prev)}
                aria-expanded={isPartyPanelOpen}
                aria-controls="party-panel-content"
                className="rounded-md border border-border/80 bg-secondary p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${
                    isPartyPanelOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </button>
            </div>
          </header>

          <div
            id="party-panel-content"
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
              isPartyPanelOpen
                ? "mt-2 grid-rows-[1fr] opacity-100"
                : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0">
              <p
                className="text-sm leading-relaxed text-muted-foreground"
                aria-live="polite"
              >
                {statusText}
              </p>

              <div className="mt-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Сторона
                </p>
                <div role="radiogroup" className="grid grid-cols-2 gap-2">
                  {COLOR_OPTIONS.map((opt) => {
                    const active = playerColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleColorChange(opt.id)}
                        className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          active
                            ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/30"
                            : "border-border/80 bg-secondary text-foreground hover:bg-muted"
                        }`}
                      >
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {opt.subtitle}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Рівень бота
                </p>
                <EloLevelScrollPicker value={botElo} onChange={setBotElo} />
              </div>

              <div className="mt-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Підказка рушія
                </p>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/80 bg-secondary px-3 py-2.5 text-sm transition-colors hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={hintArrowEnabled}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setHintArrowEnabled(on);
                      if (!on) {
                        setHintArrows([]);
                        setHintPvUci(null);
                        setHintError(null);
                      }
                    }}
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-border text-primary accent-primary"
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      Стрілка найкращого ходу
                    </span>
                  </span>
                </label>
                {!trainerEnabled && hintError ? (
                  <p className="mt-2 text-xs text-destructive">{hintError}</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Desktop-only copy: тренер у правій колонці під «Партія». */}
        <div className="hidden lg:block">{coachPanel}</div>

        {/* Desktop: якість ходів під AI-тренером у правій колонці. */}
        <div className="hidden lg:block">
          <MoveQualityPanel
            lastPlayer={lastPlayerAnalysis}
            lastBot={lastBotAnalysis}
            partyCpBalance={partyCpBalance}
            loading={moveAnalysisLoading}
            expanded={isMoveQualityOpen}
            onExpandedChange={setIsMoveQualityOpen}
            instanceId="mq-desktop"
          />
        </div>
      </aside>
    </div>
  );
}
