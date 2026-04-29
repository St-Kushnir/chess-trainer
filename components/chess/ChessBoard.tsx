"use client";

import { Chess, type Move, type Square } from "chess.js";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Chessboard,
  defaultPieces,
  type Arrow,
  type PieceDropHandlerArgs,
  type PieceRenderObject,
} from "react-chessboard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CapturedPieceIcon } from "./CapturedPieceIcon";
import type { ChessEngine, EngineMove } from "./engine";
import { waitStockfishIdle } from "./engine";
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
  /** Глибина пошуку (якщо задана — `movetime` не передається в `go`). */
  engineDepth?: number;
  /** Обмеження сили через UCI_Elo (разом з `engineUciElo`). */
  engineUseUciEloLimit?: boolean;
  engineUciElo?: number;
  /** Колбек статусу партії після кожного ходу. */
  onStatusChange?: (info: StatusInfo) => void;
  /** Колбек із сирим аналізом рушія, коли бот робить хід. */
  onEngineMove?: (info: EngineMoveInfo) => void;
  /**
   * Коли гравець починає хід (вибір фігури, drag, ПКМ) або зіграв свій хід —
   * зовнішній шар може прибрати стрілки-підказки / превʼю з тексту тренера.
   */
  onDismissBoardOverlays?: () => void;
  /** Між рамкою дошки та кнопками перемотування (наприклад, «моя здобич» на мобільному). */
  betweenBoardAndNav?: ReactNode;
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

/** Затемнення клітинки короля під шахом (не мат). */
const CHECK_KING_SQUARE_OVERLAY: CSSProperties = {
  boxShadow: "inset 0 0 56px 16px hsl(var(--destructive) / 0.42)",
};

const KING_MATE_FILL = "hsl(var(--destructive))";
const KING_STALEMATE_FILL = "hsl(var(--muted-foreground))";

const COLOR_TO_SHORT: Record<PlayerColor, "w" | "b"> = {
  white: "w",
  black: "b",
};

function turnToColor(turn: "w" | "b"): PlayerColor {
  return turn === "w" ? "white" : "black";
}

const FILES = "abcdefgh" as const;

/** Клітинка короля заданого кольору (w/b). */
function kingSquareForColor(game: Chess, color: "w" | "b"): Square | null {
  const board = game.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = board[row]?.[col];
      if (p?.type === "k" && p.color === color) {
        const rank = 8 - row;
        return `${FILES[col]}${rank}` as Square;
      }
    }
  }
  return null;
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

function moveNeedsPromotionChoice(game: Chess, from: Square, to: Square): boolean {
  const opts = game.moves({ square: from, verbose: true });
  return opts.some((m) => m.to === to && Boolean(m.promotion));
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
  engineUseUciEloLimit = false,
  engineUciElo,
  onStatusChange,
  onEngineMove,
  onDismissBoardOverlays,
  betweenBoardAndNav,
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
  /** 0 … N: скільки SAN-ходів з поточної партії показати (N = повна позиція). */
  const [viewMoveCount, setViewMoveCount] = useState(0);
  const [promotionPick, setPromotionPick] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const playSound = useChessSounds(enableSound, soundUrls);

  const isPlayerTurn = useMemo(() => {
    if (!playerColor) return true;
    return game.turn() === COLOR_TO_SHORT[playerColor];
  }, [game, fen, playerColor]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Клік тримає пріоритет; hover — лише без вибору; drag завжди показує перетягувану фігуру. */
  const activeLegalSquare =
    dragSourceSquare ?? selectedSquare ?? hoverSquare;

  const historySanList = useMemo(() => game.history(), [fen]); // eslint-disable-line react-hooks/exhaustive-deps -- `fen` updates when the stable `game` ref mutates

  const historyFullLen = historySanList.length;
  const isViewingPast = viewMoveCount < historyFullLen;

  const boardFen = useMemo(() => {
    if (viewMoveCount >= historyFullLen) return game.fen();
    const g = new Chess();
    for (let i = 0; i < viewMoveCount; i++) {
      g.move(historySanList[i]!);
    }
    return g.fen();
  }, [viewMoveCount, historyFullLen, historySanList, game]);

  const positionChess = useMemo(() => new Chess(boardFen), [boardFen]);

  const effectiveLastMove = useMemo(() => {
    if (!isViewingPast) return lastMove;
    if (viewMoveCount === 0) return null;
    const g = new Chess();
    for (let i = 0; i < viewMoveCount; i++) {
      g.move(historySanList[i]!);
    }
    const v = g.history({ verbose: true });
    const m = v[v.length - 1];
    if (!m) return null;
    return { from: m.from as Square, to: m.to as Square };
  }, [isViewingPast, viewMoveCount, historySanList, lastMove]);

  const legalMoves = useMemo<Move[]>(() => {
    if (isViewingPast) return [];
    if (!showLegalMoves || !activeLegalSquare) return [];
    return game.moves({ square: activeLegalSquare, verbose: true });
  }, [fen, activeLegalSquare, showLegalMoves, isViewingPast]); // eslint-disable-line react-hooks/exhaustive-deps -- `fen` updates when the stable `game` ref mutates

  const squareStyles = useMemo<Record<string, CSSProperties>>(() => {
    const styles: Record<string, CSSProperties> = {};
    if (effectiveLastMove) {
      styles[effectiveLastMove.from] = {
        background: HIGHLIGHT_COLORS.lastMove,
      };
      styles[effectiveLastMove.to] = {
        background: HIGHLIGHT_COLORS.lastMove,
      };
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
    if (positionChess.inCheck() && !positionChess.isCheckmate()) {
      const sq = kingSquareForColor(positionChess, positionChess.turn());
      if (sq) {
        styles[sq] = {
          ...(styles[sq] ?? {}),
          ...CHECK_KING_SQUARE_OVERLAY,
        };
      }
    }
    return styles;
  }, [
    effectiveLastMove,
    activeLegalSquare,
    legalMoves,
    previewSquares,
    positionChess,
  ]);

  const pieces = useMemo((): PieceRenderObject => {
    const g = positionChess;
    if (g.isStalemate()) {
      return {
        ...defaultPieces,
        wK: (props) => defaultPieces.wK({ ...props, fill: KING_STALEMATE_FILL }),
        bK: (props) => defaultPieces.bK({ ...props, fill: KING_STALEMATE_FILL }),
      };
    }
    if (g.isCheckmate()) {
      const mated = g.turn();
      if (mated === "w") {
        return {
          ...defaultPieces,
          wK: (props) => defaultPieces.wK({ ...props, fill: KING_MATE_FILL }),
        };
      }
      return {
        ...defaultPieces,
        bK: (props) => defaultPieces.bK({ ...props, fill: KING_MATE_FILL }),
      };
    }
    return defaultPieces;
  }, [positionChess]);

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
        setViewMoveCount(game.history().length);
        const mover: PlayerColor = turnToColor(move.color);
        if (!playerColor || mover === playerColor) {
          onDismissBoardOverlays?.();
        }
        return true;
      } catch {
        return false;
      }
    },
    [game, playSound, onStatusChange, clearDragState, playerColor, onDismissBoardOverlays],
  );

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      clearDragState();
      if (!targetSquare) return false;
      if (isViewingPast) return false;
      if (promotionPick) return false;
      if (playerColor && !isPlayerTurn) return false;
      const from = sourceSquare as Square;
      const to = targetSquare as Square;
      onDismissBoardOverlays?.();
      if (moveNeedsPromotionChoice(game, from, to)) {
        setPromotionPick({ from, to });
        return false;
      }
      return applyMove(from, to);
    },
    [
      applyMove,
      clearDragState,
      game,
      isPlayerTurn,
      isViewingPast,
      playerColor,
      promotionPick,
      onDismissBoardOverlays,
    ],
  );

  const handleMouseOverSquare = useCallback(
    ({ piece, square }: { piece: { pieceType: string } | null; square: string }) => {
      if (isViewingPast) return;
      if (isDraggingRef.current) return;
      if (playerColor && !isPlayerTurn) return;
      const sq = square as Square;
      if (!canActivatePiece(game, piece, playerColor, isPlayerTurn)) return;
      setHoverSquare(sq);
    },
    [game, isPlayerTurn, playerColor, isViewingPast],
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
      if (isViewingPast) return;
      if (isSparePiece || !square) return;
      if (playerColor && !isPlayerTurn) return;
      if (!canActivatePiece(game, piece, playerColor, isPlayerTurn)) return;
      onDismissBoardOverlays?.();
      setHoverSquare(null);
      isDraggingRef.current = true;
      setDragSourceSquare(square as Square);
    },
    [game, isPlayerTurn, playerColor, isViewingPast, onDismissBoardOverlays],
  );

  const handleSquareClick = useCallback(
    ({
      piece,
      square,
    }: {
      piece: { pieceType: string } | null;
      square: string;
    }) => {
      if (promotionPick) {
        setPromotionPick(null);
        setSelectedSquare(null);
        setHoverSquare(null);
        return;
      }
      if (isViewingPast) return;
      if (playerColor && !isPlayerTurn) return;
      const sq = square as Square;

      if (selectedSquare && selectedSquare !== sq) {
        onDismissBoardOverlays?.();
        if (moveNeedsPromotionChoice(game, selectedSquare, sq)) {
          setPromotionPick({ from: selectedSquare, to: sq });
          setSelectedSquare(null);
          setHoverSquare(null);
          return;
        }
        const moved = applyMove(selectedSquare, sq);
        if (moved) return;
      }

      if (piece && canActivatePiece(game, piece, playerColor, isPlayerTurn)) {
        onDismissBoardOverlays?.();
        setSelectedSquare(sq);
        return;
      }
      setSelectedSquare(null);
    },
    [
      applyMove,
      game,
      isPlayerTurn,
      isViewingPast,
      playerColor,
      promotionPick,
      selectedSquare,
      onDismissBoardOverlays,
    ],
  );

  const handleSquareRightClick = useCallback(() => {
    onDismissBoardOverlays?.();
    setSelectedSquare(null);
    setHoverSquare(null);
  }, [onDismissBoardOverlays]);

  const handleNewGame = useCallback(() => {
    opponent?.stop();
    game.reset();
    setFen(game.fen());
    setLastMove(null);
    setSelectedSquare(null);
    setHoverSquare(null);
    clearDragState();
    setBotThinking(false);
    setViewMoveCount(0);
    setPromotionPick(null);
    onStatusChange?.(deriveStatus(game));
  }, [clearDragState, game, opponent, onStatusChange]);

  useEffect(() => {
    if (!opponent || !playerColor) return;
    if (isViewingPast) return;
    if (game.isGameOver()) return;
    if (isPlayerTurn) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setBotThinking(true);
    });

    void (async () => {
      try {
        await waitStockfishIdle(opponent);
        if (cancelled) return;
        const useUciLimit = engineUseUciEloLimit && engineUciElo != null;
        const move = await opponent.bestMove({
          fen,
          skill: engineSkill,
          movetimeMs:
            engineDepth !== undefined && engineDepth !== null
              ? undefined
              : engineMovetimeMs,
          depth: engineDepth,
          ...(useUciLimit
            ? { limitStrength: true as const, uciElo: engineUciElo }
            : { limitStrength: false as const }),
        });
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
      } catch (err) {
        if (!cancelled) {
          console.error("Engine bestMove error", err);
        }
      } finally {
        if (!cancelled) setBotThinking(false);
      }
    })();

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
    engineUseUciEloLimit,
    engineUciElo,
    applyMove,
    onEngineMove,
    game,
    isViewingPast,
  ]);

  const orientation: PlayerColor = playerColor ?? "white";

  return (
    <div className={className}>
      {/*
        «Бот думає» / «Нова партія» — поверх дошки (absolute), без окремої
        смуги з фіксованою висотою, щоб не залишати порожній зазор на тренажері.
      */}
      {/*
        `aspect-square` фіксує висоту = ширині ще ДО того, як `react-chessboard`
        всередині відмірить себе через ResizeObserver. Без цього у момент
        ремаунту/зміни ширини контейнера дошка на мить мала меншу висоту й
        видавала «стрибки фігур» / зміщення (особливо помітно на мобільних).
      */}
      <div className="relative aspect-square overflow-hidden rounded-xl border border-border/80 bg-card shadow-md ring-1 ring-border/40 touch-none">
        {promotionPick ? (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/45 px-4 py-6 backdrop-blur-[2px]"
            role="dialog"
            aria-modal
            aria-labelledby="promotion-dialog-title"
          >
            <p
              id="promotion-dialog-title"
              className="text-center text-sm font-semibold text-white"
            >
              На що перетворити пішака?
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/25 bg-card/95 shadow-md ring-1 ring-border/40 transition hover:bg-muted sm:h-16 sm:w-16"
                  onClick={() => {
                    if (!promotionPick) return;
                    const { from, to } = promotionPick;
                    setPromotionPick(null);
                    void applyMove(from, to, p);
                  }}
                >
                  <CapturedPieceIcon
                    pieceType={p}
                    color={game.turn()}
                    className="h-11 w-11 sm:h-12 sm:w-12"
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-xs font-medium text-white/85 underline-offset-2 hover:underline"
              onClick={() => setPromotionPick(null)}
            >
              Скасувати
            </button>
          </div>
        ) : null}
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
            pieces,
            position: boardFen,
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
            allowDragging:
              !isViewingPast && (!playerColor || isPlayerTurn) && !promotionPick,
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
      {betweenBoardAndNav ?? null}
      <div className="mx-auto mt-3 flex w-full max-w-[min(100%,560px)] items-stretch justify-between gap-3 px-1 max-md:mt-2 max-md:gap-2">
        <button
          type="button"
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-border/80 bg-secondary py-2 text-foreground shadow-sm ring-1 ring-border/40 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-35 max-md:min-h-9 max-md:rounded-lg max-md:py-1"
          aria-label="Попередній хід"
          title="Попередній хід"
          disabled={viewMoveCount <= 0}
          onClick={() =>
            setViewMoveCount((c) => Math.max(0, c - 1))
          }
        >
          <ChevronLeft className="h-11 w-11 shrink-0 sm:h-12 sm:w-12 max-md:h-7 max-md:w-7" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-border/80 bg-secondary py-2 text-foreground shadow-sm ring-1 ring-border/40 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-35 max-md:min-h-9 max-md:rounded-lg max-md:py-1"
          aria-label="Наступний хід"
          title="Наступний хід"
          disabled={viewMoveCount >= historyFullLen}
          onClick={() =>
            setViewMoveCount((c) => Math.min(historyFullLen, c + 1))
          }
        >
          <ChevronRight className="h-11 w-11 shrink-0 sm:h-12 sm:w-12 max-md:h-7 max-md:w-7" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

ChessBoard.displayName = "ChessBoard";
