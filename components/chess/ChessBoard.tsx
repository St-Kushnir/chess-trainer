"use client";

import { Chess, type Move, type Square } from "chess.js";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Arrow, PieceDropHandlerArgs } from "react-chessboard";
import { useChessSounds, type ChessSoundUrls } from "./useChessSounds";

type ChessBoardProps = {
  className?: string;
  /** Унікальний id, якщо на сторінці кілька дошок */
  boardId?: string;
  /** Кнопка скидання позиції */
  showNewGame?: boolean;
  /** Звукові ефекти на ходи (за замовчуванням ввімкнено) */
  enableSound?: boolean;
  /** Підсвічувати клітинки, куди може походити вибрана фігура */
  showLegalMoves?: boolean;
  /** Стрілки-підказки від AI / бота (відображаються поверх дошки) */
  suggestionArrows?: Arrow[];
  /** Дозволити користувачу малювати власні стрілки правою кнопкою (default: true) */
  allowUserArrows?: boolean;
  /** Перевизначення шляхів до mp3 (`move`, `mate`); за замовчуванням — `public/sounds/` */
  soundUrls?: ChessSoundUrls;
};

const HIGHLIGHT_COLORS = {
  selected: "rgba(45, 212, 191, 0.45)",
  lastMove: "rgba(245, 200, 66, 0.35)",
  legalDot:
    "radial-gradient(circle, rgba(15, 23, 42, 0.28) 22%, transparent 25%)",
  legalCapture:
    "radial-gradient(circle, transparent 58%, rgba(239, 91, 80, 0.55) 60%, transparent 70%)",
} as const;

export function ChessBoard({
  className = "",
  boardId = "chess-board",
  showNewGame = false,
  enableSound = true,
  showLegalMoves = true,
  suggestionArrows,
  allowUserArrows = true,
  soundUrls,
}: ChessBoardProps) {
  const game = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(() => game.fen());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null,
  );
  const playSound = useChessSounds(enableSound, soundUrls);

  const legalMoves = useMemo<Move[]>(() => {
    if (!showLegalMoves || !selectedSquare) return [];
    return game.moves({ square: selectedSquare, verbose: true });
  }, [game, fen, selectedSquare, showLegalMoves]); // eslint-disable-line react-hooks/exhaustive-deps

  const squareStyles = useMemo<Record<string, CSSProperties>>(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { background: HIGHLIGHT_COLORS.lastMove };
      styles[lastMove.to] = { background: HIGHLIGHT_COLORS.lastMove };
    }
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] ?? {}),
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
    return styles;
  }, [lastMove, selectedSquare, legalMoves]);

  const applyMove = useCallback(
    (from: Square, to: Square): boolean => {
      try {
        const move = game.move({ from, to, promotion: "q" });
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
        return true;
      } catch {
        return false;
      }
    },
    [game, playSound],
  );

  const handlePieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      if (!targetSquare) return false;
      return applyMove(sourceSquare as Square, targetSquare as Square);
    },
    [applyMove],
  );

  const handleSquareClick = useCallback(
    ({ piece, square }: { piece: { pieceType: string } | null; square: string }) => {
      const sq = square as Square;

      if (selectedSquare && selectedSquare !== sq) {
        const moved = applyMove(selectedSquare, sq);
        if (moved) return;
      }

      if (piece) {
        const turnIsWhite = game.turn() === "w";
        const pieceIsWhite = piece.pieceType.startsWith("w");
        if (turnIsWhite === pieceIsWhite) {
          setSelectedSquare(sq);
          return;
        }
      }
      setSelectedSquare(null);
    },
    [applyMove, game, selectedSquare],
  );

  const handleSquareRightClick = useCallback(() => {
    setSelectedSquare(null);
  }, []);

  const handleNewGame = useCallback(() => {
    game.reset();
    setFen(game.fen());
    setLastMove(null);
    setSelectedSquare(null);
  }, [game]);

  return (
    <div className={`space-y-3 ${className}`}>
      {showNewGame ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleNewGame}
            className="rounded-lg border border-border/80 bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Нова партія
          </button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-md ring-1 ring-border/40">
        <Chessboard
          options={{
            id: boardId,
            position: fen,
            onPieceDrop: handlePieceDrop,
            onSquareClick: handleSquareClick,
            onSquareRightClick: handleSquareRightClick,
            squareStyles,
            arrows: suggestionArrows ?? [],
            allowDrawingArrows: allowUserArrows,
            clearArrowsOnPositionChange: true,
            boardOrientation: "white",
            allowDragging: true,
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
