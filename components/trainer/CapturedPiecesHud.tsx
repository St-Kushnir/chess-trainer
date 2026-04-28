"use client";

import { useMemo, type ReactNode } from "react";
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
};

function formatLeadMagnitude(points: number): string {
  return `+${points}`;
}

export function CapturedPiecesHud({
  fen,
  historySan,
  playerColor,
  children,
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
    pieces: typeof theirsSorted,
    pieceColor: "w" | "b",
    aria: string,
    keyPrefix: string,
    /** Показувати «+N оч.» лише якщо цей рядок — у сторони, що веде в матеріалі. */
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
        className="flex w-full max-w-full flex-wrap items-center gap-x-2 gap-y-0 px-0.5 py-0.5"
        title={title}
      >
        <span className="sr-only">{aria}</span>
        <div
          className="-space-x-1 flex min-w-0 shrink items-center leading-none"
          aria-hidden
        >
          {pieces.length === 0 ? (
            <span className="text-[0.65rem] text-muted-foreground/60">—</span>
          ) : (
            pieces.map((pt, i) => (
              <span
                key={`${keyPrefix}-${i}-${pt}`}
                className="inline-flex select-none drop-shadow-sm"
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
      {children}
      {strip(
        "Моя здобич — фігури, які ви забрали",
        mineSorted,
        oppColor,
        "Моя здобич: фігури, які ви забрали",
        "m",
        myLeadMag,
        iLead ? "player" : null,
      )}
    </div>
  );
}
