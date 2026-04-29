"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChessBoard } from "@/components/chess/ChessBoard";
import type { PlayerColor } from "@/components/chess";
import {
  capturesForPlayer,
  playerMaterialAdvantage,
  sortCapturedTypes,
} from "@/lib/chess/capturedMaterial";
import { CapturedPieceIcon } from "@/components/chess/CapturedPieceIcon";

type CapturedPiecesHudProps = {
  fen: string;
  historySan: string[];
  playerColor: PlayerColor;
  children: ReactNode;
  /**
   * На мобільному: ряд «моя здобич» між дошкою та кнопками історії (десктоп — як раніше під усім блоком).
   */
  mineAboveHistoryOnMobile?: boolean;
};

function formatLeadMagnitude(points: number): string {
  return `+${points}`;
}

function isChessBoardElement(
  el: unknown,
): el is ReactElement<{ betweenBoardAndNav?: ReactNode }> {
  if (!isValidElement(el)) return false;
  const type = el.type as { displayName?: string } | string | undefined;
  if (el.type === ChessBoard) return true;
  if (typeof type === "function" || typeof type === "object")
    return (type as { displayName?: string })?.displayName === "ChessBoard";
  return false;
}

/** Рекурсивно передає `betweenBoardAndNav` у перший вкладений `ChessBoard`. */
function injectBetweenBoardAndNav(
  node: ReactNode,
  slot: ReactNode,
): ReactNode {
  if (!isValidElement(node)) return node;
  if (isChessBoardElement(node)) {
    return cloneElement(node, { betweenBoardAndNav: slot });
  }
  const ch = (node.props as { children?: ReactNode }).children;
  if (ch === undefined || ch === null) return node;
  const next = Children.map(ch, (c) => injectBetweenBoardAndNav(c, slot));
  return cloneElement(node, {}, next);
}

export function CapturedPiecesHud({
  fen,
  historySan,
  playerColor,
  children,
  mineAboveHistoryOnMobile = false,
}: CapturedPiecesHudProps) {
  const { theirsSorted, mineSorted, advantage, oppColor, myColor } =
    useMemo(() => {
      const { mine, theirs } = capturesForPlayer(historySan, playerColor);
      const opp: "w" | "b" = playerColor === "white" ? "b" : "w";
      const me: "w" | "b" = playerColor === "white" ? "w" : "b";
      return {
        theirsSorted: sortCapturedTypes(theirs),
        mineSorted: sortCapturedTypes(mine),
        advantage: playerMaterialAdvantage(fen, playerColor),
        oppColor: opp,
        myColor: me,
      };
    }, [fen, historySan, playerColor]);

  const strip = (
    title: string,
    pieces: typeof mineSorted,
    pieceColor: "w" | "b",
    aria: string,
    keyPrefix: string,
    leadMagnitude: number | null,
    leadFor: "player" | "opponent" | null,
  ) => {
    const scoreEl =
      leadMagnitude != null && leadMagnitude > 0 && leadFor ? (
        <span
          className="shrink-0 text-sm font-bold tabular-nums leading-none text-foreground sm:text-base"
          title={
            leadFor === "player"
              ? "Ваша матеріальна перевага на дошці"
              : "Матеріальна перевага суперника на дошці"
          }
        >
          {formatLeadMagnitude(leadMagnitude)}
        </span>
      ) : null;

    return (
      <div
        // ВАЖЛИВО: фіксована висота + `flex-nowrap` + `overflow-hidden`.
        // Без цього зростання списку забраних фігур іноді переносило рядок
        // (`flex-wrap`) і смуга додавала +2rem → дошка стрибала вниз.
        className="flex h-8 w-full max-w-full flex-nowrap items-center gap-x-2 overflow-hidden px-0.5 py-0.5 sm:h-9"
        title={title}
      >
        <span className="sr-only">{aria}</span>
        <div
          className="-space-x-1 flex min-w-0 flex-1 items-center leading-none"
          aria-hidden
        >
          {pieces.length === 0 ? (
            <span className="text-[0.65rem] text-muted-foreground/60">—</span>
          ) : (
            pieces.map((pt, i) => (
              <span
                key={`${keyPrefix}-${i}-${pt}`}
                className="inline-flex shrink-0 select-none drop-shadow-sm"
              >
                <CapturedPieceIcon pieceType={pt} color={pieceColor} />
              </span>
            ))
          )}
        </div>
        {scoreEl}
      </div>
    );
  };

  const oppLeads = advantage < 0;
  const iLead = advantage > 0;
  const oppLeadMag = oppLeads ? Math.abs(advantage) : null;
  const myLeadMag = iLead ? advantage : null;

  const mineStrip = strip(
    "Моя здобич — фігури, які ви забрали",
    mineSorted,
    oppColor,
    "Моя здобич: фігури, які ви забрали",
    "m",
    myLeadMag,
    iLead ? "player" : null,
  );

  const mineSlotMobile = (
    <div className="mx-auto w-full max-w-[min(100%,560px)] md:hidden">
      {mineStrip}
    </div>
  );

  const layeredChildren = mineAboveHistoryOnMobile
    ? injectBetweenBoardAndNav(children, mineSlotMobile)
    : children;

  return (
    <div className="w-full max-w-full space-y-0.5 text-foreground">
      {strip(
        "Його здобич — фігури, які забрав суперник",
        theirsSorted,
        myColor,
        "Його здобич: фігури, які забрав суперник",
        "t",
        oppLeadMag,
        oppLeads ? "opponent" : null,
      )}
      {layeredChildren}
      {mineAboveHistoryOnMobile ? (
        <div className="mt-0.5 hidden max-w-full md:block">{mineStrip}</div>
      ) : (
        mineStrip
      )}
    </div>
  );
}
