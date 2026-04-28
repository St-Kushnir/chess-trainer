"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Arrow } from "react-chessboard";
import {
  ChessBoard,
  ENGINE_LEVELS,
  useStockfishEngine,
  type EngineLevel,
  type EngineMoveInfo,
  type PlayerColor,
  type StatusInfo,
} from "@/components/chess";
import { CoachPanel, useChessCoach } from "@/components/coach";
import type { CommentInput } from "@/lib/commentator";

const COLOR_OPTIONS: { id: PlayerColor; label: string; subtitle: string }[] = [
  { id: "white", label: "Білі", subtitle: "Ви ходите перші" },
  { id: "black", label: "Чорні", subtitle: "Бот починає партію" },
];

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const HINT_ARROW_COLOR = "rgba(45, 212, 191, 0.9)";

export function TrainerWorkspace() {
  const { engine, status: engineStatus } = useStockfishEngine();
  const [playerColor, setPlayerColor] = useState<PlayerColor>("white");
  const [level, setLevel] = useState<EngineLevel>(ENGINE_LEVELS[2]);
  const [boardKey, setBoardKey] = useState(0);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [lastEngineMove, setLastEngineMove] = useState<EngineMoveInfo | null>(
    null,
  );
  const [hintArrows, setHintArrows] = useState<Arrow[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);

  const [trainerEnabled, setTrainerEnabled] = useState(false);

  const coach = useChessCoach();

  const handleNewGame = useCallback(() => {
    setStatusInfo(null);
    setLastEngineMove(null);
    setHintArrows([]);
    setHintError(null);
    coach.reset();
    setBoardKey((k) => k + 1);
  }, [coach]);

  const handleColorChange = useCallback(
    (color: PlayerColor) => {
      setPlayerColor(color);
      handleNewGame();
    },
    [handleNewGame],
  );

  const handleLevelChange = useCallback(
    (next: EngineLevel) => {
      setLevel(next);
      handleNewGame();
    },
    [handleNewGame],
  );

  const opponent = engineStatus === "ready" ? engine : null;

  const isGameOver = useMemo(() => {
    if (!statusInfo) return false;
    return (
      statusInfo.status === "checkmate" ||
      statusInfo.status === "stalemate" ||
      statusInfo.status === "draw" ||
      statusInfo.status === "gameOver"
    );
  }, [statusInfo]);

  // Прибираємо стрілку-хінт, як тільки гравець зіграв (вона вже неактуальна).
  useEffect(() => {
    if (!statusInfo?.lastMove) return;
    if (statusInfo.lastMove.color !== playerColor) return;
    queueMicrotask(() => setHintArrows([]));
  }, [statusInfo?.lastMove, playerColor]);

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
   * Запускається після ходу бота: Stockfish → стрілка → коментар (mode=hint),
   * як кнопка «Що зробити?».
   */
  const runHintCommentary = useCallback(async () => {
    if (isGameOver || !opponent) return;
    setHintError(null);

    const context = buildContext();
    const sideToMove: PlayerColor =
      context.fen.split(" ")[1] === "w" ? "white" : "black";

    setHintBusy(true);
    try {
      const move = await opponent.bestMove({
        fen: context.fen,
        skill: 20,
        movetimeMs: 1500,
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

      await coach.ask({
        ...context,
        mode: "hint",
        engineInfo: {
          bestmove: move.bestmove,
          pv: move.pv,
          scoreCp: move.scoreCp,
          scoreMate: move.scoreMate,
          color: sideToMove,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не вдалося отримати підказку";
      setHintError(message);
    } finally {
      setHintBusy(false);
    }
  }, [buildContext, coach, isGameOver, opponent]);

  // Авто-тренер: тригеримо тільки після ходу бота (стало черга гравця).
  // Ключ — uci+довжина історії, щоб не повторно стріляти на той самий хід.
  const lastTriggeredKey = useRef<string | null>(null);

  useEffect(() => {
    if (!trainerEnabled) return;
    if (engineStatus !== "ready") return;
    if (!statusInfo || isGameOver) return;
    const last = statusInfo.lastMove;
    if (!last) return;
    if (last.color === playerColor) return;

    const key = `${last.color}:${last.uci}:${statusInfo.historySan.length}`;
    if (lastTriggeredKey.current === key) return;
    lastTriggeredKey.current = key;

    queueMicrotask(() => {
      void runHintCommentary();
    });
  }, [
    trainerEnabled,
    statusInfo,
    isGameOver,
    engineStatus,
    playerColor,
    runHintCommentary,
  ]);

  // Скидаємо лічильник тригерів при новій партії / зміні сторони / переключенні тренера.
  useEffect(() => {
    lastTriggeredKey.current = null;
  }, [boardKey, playerColor, trainerEnabled]);

  const handleToggleTrainer = useCallback(() => {
    setTrainerEnabled((prev) => {
      const next = !prev;
      if (!next) {
        coach.cancel();
        setHintBusy(false);
        setHintArrows([]);
        setHintError(null);
      }
      return next;
    });
  }, [coach]);

  const handleCoachReset = useCallback(() => {
    coach.reset();
    setHintError(null);
  }, [coach]);

  const coachPanel = (
    <CoachPanel
      text={coach.text}
      status={coach.status}
      error={hintError ?? coach.error}
      enabled={trainerEnabled}
      onToggle={handleToggleTrainer}
      onCancel={coach.cancel}
      onReset={handleCoachReset}
      busy={hintBusy}
    />
  );

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
      <div className="space-y-6">
        {/* Mobile-only copy: тренер над дошкою. */}
        <div className="lg:hidden">{coachPanel}</div>

        <ChessBoard
          key={boardKey}
          className="mx-auto w-full max-w-[min(100%,560px)] lg:mx-0"
          boardId="trainer-main"
          playerColor={playerColor}
          opponent={opponent}
          engineSkill={level.skill}
          engineMovetimeMs={level.movetimeMs}
          engineDepth={level.depth}
          suggestionArrows={hintArrows}
          onStatusChange={setStatusInfo}
          onEngineMove={setLastEngineMove}
        />
      </div>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40">
          <header className="flex items-center justify-between">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Партія
            </p>
            <button
              type="button"
              onClick={handleNewGame}
              className="rounded-md border border-border/80 bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              Нова
            </button>
          </header>
          <p
            className="mt-2 text-sm leading-relaxed text-muted-foreground"
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
            <div role="radiogroup" className="space-y-1.5">
              {ENGINE_LEVELS.map((opt) => {
                const active = level.id === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => handleLevelChange(opt)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/30"
                        : "border-border/80 bg-secondary text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Desktop-only copy: тренер у правій колонці під «Партія». */}
        <div className="hidden lg:block">{coachPanel}</div>
      </aside>
    </div>
  );
}
