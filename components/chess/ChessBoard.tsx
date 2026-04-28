"use client";

import { Chess, type Move, type Square } from "chess.js";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Chessboard } from "react-chessboard";
import type { Arrow, PieceDropHandlerArgs } from "react-chessboard";
import type { ChessEngine, EngineMove } from "./engine";
import { useChessSounds, type ChessSoundUrls } from "./useChessSounds";

export type PlayerColor = "white" | "black";

export type GameStatus =
  | "waiting"
  | "playing"
  | "thinking"
  | "checkmate"
  | "stalemate"
  | "draw"
  | "gameOver";

export type LastMoveInfo = {
  san: string;
  uci: string;
  color: PlayerColor;
};

export type StatusInfo = {
  status: GameStatus;
  turn: PlayerColor;
  fen: string;
  inCheck: boolean;
  lastMove?: LastMoveInfo;
  /** Уся історія партії в SAN. */
  historySan: string[];
  winner?: PlayerColor | "draw";
};

export type EngineMoveInfo = EngineMove & {
  /** Колір сторони, яка щойно зіграла (тобто бот). */
  color: PlayerColor;
};

type ChessBoardProps = {
  className?: string;
  /** Унікальний id, якщо на сторінці кілька дошок */
  boardId?: string;
  /** Зовнішня кнопка "Нова партія" в самій дошці */
  showNewGame?: boolean;
  /** Звукові ефекти на ходи */
  enableSound?: boolean;
  /** Підсвічувати клітинки, куди може походити вибрана фігура */
  showLegalMoves?: boolean;
  /** Стрілки-підказки від AI / бота */
  suggestionArrows?: Arrow[];
  /** Тимчасові стрілки-превʼю з тексту тренера. */
  previewArrows?: Arrow[];
  /** Тимчасові підсвітки клітинок з тексту тренера. */
  previewSquares?: Square[];
  /** Дозволити користувачу малювати стрілки правою кнопкою */
  allowUserArrows?: boolean;
  /** Перевизначення шляхів до mp3 (`move`, `mate`) */
  soundUrls?: ChessSoundUrls;
  /**
   * Колір користувача, якщо грає проти бота.
   * Якщо вказано — дошка автоматично орієнтується на гравця і
   * блокує перетягування чужих фігур.
   */
  playerColor?: PlayerColor | null;
  /** Рушій-суперник. Якщо вказаний, бот ходить, коли черга не гравця. */
  opponent?: ChessEngine | null;
  /** Stockfish Skill Level (0–20). За замовчуванням 20. */
  engineSkill?: number;
  /** Час на хід рушія в мс. */
  engineMovetimeMs?: number;
  /** Глибина пошуку (взаємовиключно з `engineMovetimeMs`). */
  engineDepth?: number;
  /** Колбек статусу партії після кожного ходу. */
  onStatusChange?: (info: StatusInfo) => void;
  /** Колбек із сирим аналізом рушія, коли бот робить хід. */
  onEngineMove?: (info: EngineMoveInfo) => void;
};

const HIGHLIGHT_COLORS = {
  selected: "rgba(45, 212, 191, 0.45)",
  lastMove: "rgba(245, 200, 66, 0.35)",
  previewSquare: "rgba(45, 212, 191, 0.3)",
  legalDot:
    "radial-gradient(circle, rgba(15, 23, 42, 0.28) 22%, transparent 25%)",
  legalCapture:
    "radial-gradient(circle, transparent 58%, rgba(239, 91, 80, 0.55) 60%, transparent 70%)",
} as const;

const COLOR_TO_SHORT: Record<PlayerColor, "w" | "b"> = {
  white: "w",
  black: "b",
};

function turnToColor(turn: "w" | "b"): PlayerColor {
  return turn === "w" ? "white" : "black";
}

/** Чи можна «активувати» фігуру (клік / hover / початок drag) для підсвітки ходів. */
function canActivatePiece(
  game: Chess,
  piece: { pieceType: string } | null,
  playerColor: PlayerColor | null,
  isPlayerTurn: boolean,
): piece is { pieceType: string } {
  if (playerColor && !isPlayerTurn) return false;
  if (!piece) return false;
  const turnIsWhite = game.turn() === "w";
  const pieceIsWhite = piece.pieceType.startsWith("w");
  if (turnIsWhite !== pieceIsWhite) return false;
  if (playerColor) {
    const playerIsWhite = playerColor === "white";
    if (pieceIsWhite !== playerIsWhite) return false;
  }
  return true;
}

function deriveStatus(game: Chess, lastMove?: LastMoveInfo): StatusInfo {
  const turn = turnToColor(game.turn());
  const fen = game.fen();
  const inCheck = game.inCheck();
  const historySan = game.history();

  const base = { turn, fen, inCheck, lastMove, historySan } as const;

  if (game.isCheckmate()) {
    const winner: PlayerColor = turn === "white" ? "black" : "white";
    return { status: "checkmate", ...base, winner };
  }
  if (game.isStalemate()) {
    return { status: "stalemate", ...base, winner: "draw" };
  }
  if (game.isDraw()) {
    return { status: "draw", ...base, winner: "draw" };
  }
  if (game.isGameOver()) {
    return { status: "gameOver", ...base };
  }
  return { status: "playing", ...base };
}

export function ChessBoard({
  className = "",
  boardId = "chess-board",
  showNewGame = false,
  enableSound = true,
  showLegalMoves = true,
  suggestionArrows,
  previewArrows,
  previewSquares,
  allowUserArrows = true,
  soundUrls,
  playerColor = null,
  opponent = null,
  engineSkill = 20,
  engineMovetimeMs = 1000,
  engineDepth,
  onStatusChange,
  onEngineMove,
}: ChessBoardProps) {
  const game = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(() => game.fen());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  /** Клітинка під курсором (підказка ходів без кліку). */
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  /** Під час drag бібліотека шле mouseover по цільових клітинках — не оновлюємо hover. */
  const isDraggingRef = useRef(false);
  const [dragSourceSquare, setDragSourceSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const [botThinking, setBotThinking] = useState(false);
  const playSound = useChessSounds(enableSound, soundUrls);

  const isPlayerTurn = useMemo(() => {
    if (!playerColor) return true;
    return game.turn() === COLOR_TO_SHORT[playerColor];
  }, [game, fen, playerColor]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Клік тримає пріоритет; hover — лише без вибору; drag завжди показує перетягувану фігуру. */
  const activeLegalSquare =
    dragSourceSquare ?? selectedSquare ?? hoverSquare;

  const legalMoves = useMemo<Move[]>(() => {
    if (!showLegalMoves || !activeLegalSquare) return [];
    return game.moves({ square: activeLegalSquare, verbose: true });
  }, [game, fen, activeLegalSquare, showLegalMoves]); // eslint-disable-line react-hooks/exhaustive-deps

  const squareStyles = useMemo<Record<string, CSSProperties>>(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { background: HIGHLIGHT_COLORS.lastMove };
      styles[lastMove.to] = { background: HIGHLIGHT_COLORS.lastMove };
    }
    if (activeLegalSquare) {
      styles[activeLegalSquare] = {
        ...(styles[activeLegalSquare] ?? {}),
        background: HIGHLIGHT_COLORS.selected,
      };
    }
    for (const move of legalMoves) {
      const isCapture = move.isCapture() || move.isEnPassant();
      styles[move.to] = {
        ...(styles[move.to] ?? {}),
        background: isCapture
          ? HIGHLIGHT_COLORS.legalCapture
          : HIGHLIGHT_COLORS.legalDot,
        cursor: "pointer",
      };
    }
    for (const square of previewSquares ?? []) {
      styles[square] = {
        ...(styles[square] ?? {}),
        background: "rgba(45, 212, 191, 0.55)",
        boxShadow: "inset 0 0 0 3px rgba(45, 212, 191, 0.95)",
      };
    }
    return styles;
  }, [lastMove, activeLegalSquare, legalMoves, previewSquares]);

  const arrows = useMemo(() => {
    const hints = suggestionArrows ?? [];
    const previews = previewArrows ?? [];
    if (hints.length === 0) return previews;
    if (previews.length === 0) return hints;
    return [...hints, ...previews];
  }, [previewArrows, suggestionArrows]);

  const clearDragState = useCallback(() => {
    isDraggingRef.current = false;
    setDragSourceSquare(null);
  }, []);

  useEffect(() => {
    if (!dragSourceSquare) return;
    const end = () => {
      clearDragState();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragSourceSquare, clearDragState]);

  const applyMove = useCallback(
    (
      from: Square,
      to: Square,
      promotion: "q" | "r" | "b" | "n" = "q",
    ): boolean => {
      try {
        const move = game.move({ from, to, promotion });
        if (!move) return false;

        if (game.isCheckmate()) {
          playSound("mate");
        } else if (game.isGameOver()) {
          playSound("gameEnd");
        } else if (game.inCheck()) {
          playSound("check");
        } else if (move.isKingsideCastle() || move.isQueensideCastle()) {
          playSound("castle");
        } else if (move.isCapture() || move.isEnPassant()) {
          playSound("capture");
        } else {
          playSound("move");
        }

        setFen(game.fen());
        setLastMove({ from: move.from, to: move.to });
        setSelectedSquare(null);
        setHoverSquare(null);
        clearDragState();
        onStatusChange?.(
          deriveStatus(game, {
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ""}`,
            color: turnToColor(move.color),
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
    [game, playSound, onStatusChange, clearDragState],
  );

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      clearDragState();
      if (!targetSquare) return false;
      if (playerColor && !isPlayerTurn) return false;
      return applyMove(sourceSquare as Square, targetSquare as Square);
    },
    [applyMove, clearDragState, isPlayerTurn, playerColor],
  );

  const handleMouseOverSquare = useCallback(
    ({ piece, square }: { piece: { pieceType: string } | null; square: string }) => {
      if (isDraggingRef.current) return;
      if (playerColor && !isPlayerTurn) return;
      const sq = square as Square;
      if (!canActivatePiece(game, piece, playerColor, isPlayerTurn)) return;
      setHoverSquare(sq);
    },
    [game, isPlayerTurn, playerColor],
  );

  const handleMouseOutSquare = useCallback(
    ({ square }: { square: string }) => {
      if (isDraggingRef.current) return;
      const sq = square as Square;
      setHoverSquare((prev) => (prev === sq ? null : prev));
    },
    [],
  );

  const handlePieceDrag = useCallback(
    ({
      isSparePiece,
      piece,
      square,
    }: {
      isSparePiece: boolean;
      piece: { pieceType: string };
      square: string | null;
    }) => {
      if (isSparePiece || !square) return;
      if (playerColor && !isPlayerTurn) return;
      if (!canActivatePiece(game, piece, playerColor, isPlayerTurn)) return;
      setHoverSquare(null);
      isDraggingRef.current = true;
      setDragSourceSquare(square as Square);
    },
    [game, isPlayerTurn, playerColor],
  );

  const handleSquareClick = useCallback(
    ({
      piece,
      square,
    }: {
      piece: { pieceType: string } | null;
      square: string;
    }) => {
      if (playerColor && !isPlayerTurn) return;
      const sq = square as Square;

      if (selectedSquare && selectedSquare !== sq) {
        const moved = applyMove(selectedSquare, sq);
        if (moved) return;
      }

      if (piece && canActivatePiece(game, piece, playerColor, isPlayerTurn)) {
        setSelectedSquare(sq);
        return;
      }
      setSelectedSquare(null);
    },
    [applyMove, game, isPlayerTurn, playerColor, selectedSquare],
  );

  const handleSquareRightClick = useCallback(() => {
    setSelectedSquare(null);
    setHoverSquare(null);
  }, []);

  const handleNewGame = useCallback(() => {
    opponent?.stop();
    game.reset();
    setFen(game.fen());
    setLastMove(null);
    setSelectedSquare(null);
    setHoverSquare(null);
    clearDragState();
    setBotThinking(false);
    onStatusChange?.(deriveStatus(game));
  }, [clearDragState, game, opponent, onStatusChange]);

  useEffect(() => {
    if (!opponent || !playerColor) return;
    if (game.isGameOver()) return;
    if (isPlayerTurn) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setBotThinking(true);
    });

    opponent
      .bestMove({
        fen,
        skill: engineSkill,
        movetimeMs: engineDepth ? undefined : engineMovetimeMs,
        depth: engineDepth,
      })
      .then((move) => {
        if (cancelled) return;
        const uci = move.bestmove;
        if (!uci || uci === "(none)") return;
        const from = uci.slice(0, 2) as Square;
        const to = uci.slice(2, 4) as Square;
        const promotion = (uci.length > 4 ? uci.slice(4, 5) : "q") as
          | "q"
          | "r"
          | "b"
          | "n";
        const botColor: PlayerColor = playerColor === "white" ? "black" : "white";
        const applied = applyMove(from, to, promotion);
        if (applied) {
          onEngineMove?.({ ...move, color: botColor });
        }
      })
      .catch((err) => {
        console.error("Engine bestMove error", err);
      })
      .finally(() => {
        if (!cancelled) setBotThinking(false);
      });

    return () => {
      cancelled = true;
      opponent.stop();
    };
  }, [
    fen,
    isPlayerTurn,
    opponent,
    playerColor,
    engineSkill,
    engineMovetimeMs,
    engineDepth,
    applyMove,
    onEngineMove,
    game,
  ]);

  const orientation: PlayerColor = playerColor ?? "white";

  return (
    <div className={className}>
      {/*
        «Бот думає» / «Нова партія» — поверх дошки (absolute), без окремої
        смуги з фіксованою висотою, щоб не залишати порожній зазор на тренажері.
      */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-md ring-1 ring-border/40 touch-none">
        {botThinking ? (
          <div
            className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-2 rounded-md border border-border/60 bg-card/95 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm dark:bg-card/90"
            aria-live="polite"
          >
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Бот думає…
          </div>
        ) : null}
        {showNewGame ? (
          <div className="absolute left-2 top-2 z-10">
            <button
              type="button"
              onClick={handleNewGame}
              className="rounded-lg border border-border/80 bg-secondary px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Нова партія
            </button>
          </div>
        ) : null}
        <Chessboard
          options={{
            id: boardId,
            position: fen,
            onPieceDrop: handlePieceDrop,
            onPieceDrag: handlePieceDrag,
            onMouseOverSquare: handleMouseOverSquare,
            onMouseOutSquare: handleMouseOutSquare,
            onSquareClick: handleSquareClick,
            onSquareRightClick: handleSquareRightClick,
            squareStyles,
            arrows,
            allowDrawingArrows: allowUserArrows,
            clearArrowsOnPositionChange: true,
            boardOrientation: orientation,
            allowDragging: !playerColor || isPlayerTurn,
            showNotation: true,
            lightSquareStyle: { backgroundColor: "var(--metal-100)" },
            darkSquareStyle: { backgroundColor: "var(--turquoise-600)" },
            arrowOptions: {
              color: "rgba(45, 212, 191, 0.85)",
              secondaryColor: "rgba(99, 102, 241, 0.8)",
              tertiaryColor: "rgba(239, 91, 80, 0.85)",
              arrowLengthReducerDenominator: 8,
              sameTargetArrowLengthReducerDenominator: 4,
              arrowWidthDenominator: 5,
              activeArrowWidthMultiplier: 0.9,
              opacity: 0.9,
              activeOpacity: 0.5,
              arrowStartOffset: 0,
            },
            boardStyle: { width: "100%", maxWidth: "100%" },
          }}
        />
      </div>
    </div>
  );
}
