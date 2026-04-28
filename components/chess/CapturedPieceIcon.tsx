"use client";

import type { Color, PieceSymbol } from "chess.js";
import { defaultPieces } from "react-chessboard";

type CapturedPieceIconProps = {
  pieceType: PieceSymbol;
  color: Color;
  className?: string;
};

/**
 * Ті самі векторні фігури, що й на дошці (`react-chessboard` / cburnett) —
 * однаковий вигляд на всіх платформах.
 */
export function CapturedPieceIcon({
  pieceType,
  color,
  className = "inline-block h-[1.35em] w-[1.35em] shrink-0 align-middle sm:h-[1.55em] sm:w-[1.55em]",
}: CapturedPieceIconProps) {
  if (pieceType === "k") return null;

  const key = `${color}${pieceType.toUpperCase()}` as keyof typeof defaultPieces;
  const Piece = defaultPieces[key];
  if (!Piece) return null;

  return (
    <span className={className} aria-hidden>
      <Piece svgStyle={{ width: "100%", height: "100%", display: "block" }} />
    </span>
  );
}
