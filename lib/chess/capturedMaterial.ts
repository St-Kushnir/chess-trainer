import { Chess, type Color, type PieceSymbol } from "chess.js";

export type CapturePlayerColor = "white" | "black";

/** Класичні «очки» фігур (пішак = 1). */
export const MATERIAL_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const ORDER: PieceSymbol[] = ["q", "r", "b", "n", "p"];

export function sortCapturedTypes(pieces: PieceSymbol[]): PieceSymbol[] {
  return [...pieces].sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b),
  );
}

/** Взяті білими / чорними (тип фігури жертви без кольору в SAN). */
export function replayCaptureTokens(historySan: string[]): {
  whiteTook: PieceSymbol[];
  blackTook: PieceSymbol[];
} {
  const g = new Chess();
  const whiteTook: PieceSymbol[] = [];
  const blackTook: PieceSymbol[] = [];
  for (const san of historySan) {
    const m = g.move(san);
    if (!m?.captured || m.captured === "k") continue;
    const c = m.captured as PieceSymbol;
    if (m.color === "w") whiteTook.push(c);
    else blackTook.push(c);
  }
  return { whiteTook, blackTook };
}

export function capturesForPlayer(
  historySan: string[],
  playerColor: CapturePlayerColor,
): { mine: PieceSymbol[]; theirs: PieceSymbol[] } {
  const { whiteTook, blackTook } = replayCaptureTokens(historySan);
  if (playerColor === "white") {
    return { mine: whiteTook, theirs: blackTook };
  }
  return { mine: blackTook, theirs: whiteTook };
}

export function materialOnBoardByColor(fen: string): {
  white: number;
  black: number;
} {
  const g = new Chess(fen);
  const board = g.board();
  let white = 0;
  let black = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = board[row]?.[col];
      if (!p || p.type === "k") continue;
      const v = MATERIAL_VALUES[p.type];
      if (p.color === "w") white += v;
      else black += v;
    }
  }
  return { white, black };
}

/** Перевага гравця: сума його фігур на дошці мінус сума фігур суперника (очки). */
export function playerMaterialAdvantage(
  fen: string,
  playerColor: CapturePlayerColor,
): number {
  const { white, black } = materialOnBoardByColor(fen);
  if (playerColor === "white") return white - black;
  return black - white;
}

const GLYPH_OFFSET: Record<PieceSymbol, number> = {
  k: 0,
  q: 1,
  r: 2,
  b: 3,
  n: 4,
  p: 5,
};

/** Unicode-фігура в оригінальному кольорі (для взятих). */
export function pieceGlyph(pieceType: PieceSymbol, color: Color): string {
  if (pieceType === "k") return "";
  const base = color === "w" ? 0x2654 : 0x265a;
  return String.fromCodePoint(base + GLYPH_OFFSET[pieceType]);
}
