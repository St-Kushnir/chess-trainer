"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Star,
  ThumbsUp,
  X,
} from "lucide-react";
import type { MoveQuality } from "@/lib/chess/moveQuality";

const QUALITY_UA: Record<MoveQuality, string> = {
  brilliant: "Неймовірно",
  great: "Чудово",
  best: "Найкращий",
  excellent: "Відмінно",
  good: "Добре",
  book: "За теорією",
  inaccuracy: "Неточність",
  mistake: "Помилка",
  miss: "Хиба",
  blunder: "Груба помилка",
};

/** Діаметр бейджа — однаковий для іконки й порожнього слоту (без стрибків). */
const BADGE = "h-9 w-9 min-h-9 min-w-9";

export type MoveAnalysisEntry = {
  cpLost: number;
  quality: MoveQuality;
};

type MoveQualityPanelProps = {
  /** Останній проаналізований хід гравця (cpLost ≥ 0). */
  lastPlayer: MoveAnalysisEntry | null;
  /** Останній проаналізований хід бота (cpLost ≥ 0). */
  lastBot: MoveAnalysisEntry | null;
  /** Сума сантипішаків на користь гравця (+ = ти виграв у якості ходів). */
  partyCpBalance: number;
  loading: boolean;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  /** Унікальний префікс для `id` / `aria-controls`, якщо на сторінці два екземпляри. */
  instanceId?: string;
};

function IconShell({
  bgClass,
  children,
}: {
  bgClass: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex ${BADGE} shrink-0 items-center justify-center rounded-full text-white shadow-md ring-1 ring-black/20 dark:ring-white/15 ${bgClass}`}
      aria-hidden
    >
      {children}
    </span>
  );
}

function IconPlaceholder() {
  return (
    <span
      className={`inline-flex ${BADGE} shrink-0 rounded-full border border-dashed border-border/70 bg-muted/30 dark:bg-muted/20`}
      aria-hidden
    />
  );
}

function QualityIcon({ quality }: { quality: MoveQuality }) {
  const glyph =
    "select-none text-[13px] font-extrabold leading-none tracking-tight text-white";
  const icon = "size-4 shrink-0 text-white";

  switch (quality) {
    case "brilliant":
      return (
        <IconShell bgClass="bg-cyan-500">
          <span className={glyph}>!!</span>
        </IconShell>
      );
    case "great":
      return (
        <IconShell bgClass="bg-sky-500">
          <span className={glyph}>!</span>
        </IconShell>
      );
    case "best":
      return (
        <IconShell bgClass="bg-green-500">
          <Star className={icon} strokeWidth={2.75} fill="currentColor" />
        </IconShell>
      );
    case "excellent":
      return (
        <IconShell bgClass="bg-green-600">
          <ThumbsUp className={icon} strokeWidth={2.75} />
        </IconShell>
      );
    case "good":
      return (
        <IconShell bgClass="bg-emerald-600">
          <Check className={icon} strokeWidth={3} />
        </IconShell>
      );
    case "book":
      return (
        <IconShell bgClass="bg-amber-800">
          <BookOpen className={icon} strokeWidth={2.75} />
        </IconShell>
      );
    case "inaccuracy":
      return (
        <IconShell bgClass="bg-amber-500">
          <span className={glyph}>?!</span>
        </IconShell>
      );
    case "mistake":
      return (
        <IconShell bgClass="bg-orange-500">
          <span className={glyph}>?</span>
        </IconShell>
      );
    case "miss":
      return (
        <IconShell bgClass="bg-red-500">
          <X className={icon} strokeWidth={3} />
        </IconShell>
      );
    case "blunder":
      return (
        <IconShell bgClass="bg-red-600">
          <AlertTriangle className={icon} strokeWidth={2.75} />
        </IconShell>
      );
  }
}

function MoveRow({
  who,
  entry,
  isPlayer,
}: {
  who: string;
  entry: MoveAnalysisEntry | null;
  isPlayer: boolean;
}) {
  return (
    <div className="grid min-h-10 grid-cols-[auto_2.25rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0">
      <span
        className={`max-w-19 truncate text-[9px] font-semibold uppercase leading-tight tracking-wider ${
          isPlayer ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {who}
      </span>

      <div className="flex justify-center">
        {entry ? <QualityIcon quality={entry.quality} /> : <IconPlaceholder />}
      </div>

      <div className="min-h-9 min-w-0 flex flex-col justify-center gap-0.5">
        {entry ? (
          <>
            <p className="truncate text-xs font-medium leading-tight text-foreground transition-colors">
              {QUALITY_UA[entry.quality]}
            </p>
            <p className="text-[11px] tabular-nums leading-tight text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">
                {entry.cpLost > 0 ? `${isPlayer ? "−" : "+"}${entry.cpLost}` : "0"}
              </span>{" "}
              сп
            </p>
          </>
        ) : (
          <p className="text-xs tabular-nums leading-tight text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

export function MoveQualityPanel({
  lastPlayer,
  lastBot,
  partyCpBalance,
  loading,
  expanded,
  onExpandedChange,
  instanceId = "move-quality-panel",
}: MoveQualityPanelProps) {
  const bodyId = `${instanceId}-body`;
  const balanceStr = `${partyCpBalance > 0 ? "+" : ""}${partyCpBalance}`;
  const balanceColor =
    partyCpBalance > 0
      ? "text-green-600 dark:text-green-400"
      : partyCpBalance < 0
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <section
      className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40"
      aria-label="Якість ходів"
    >
      {/*
        ВАЖЛИВО: `truncate` на назві та підпису + короткий текст балансу.
        Інакше довжина балансу (`+5` → `+185`) міняла кількість рядків
        у шапці й дошка під панеллю стрибала вниз/вверх на мобільних
        після кожного ходу (бот робить хід → змінюється `partyCpBalance`).
      */}
      <header
        className={`flex items-start justify-between gap-2 ${
          !expanded ? "cursor-pointer rounded-lg outline-offset-2 hover:bg-muted/40" : ""
        }`}
        onClick={() => {
          if (!expanded) onExpandedChange(true);
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">
            Якість ходів за Stockfish
          </p>
          {!expanded ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              Баланс:{" "}
              <span className={`font-mono font-semibold tabular-nums ${balanceColor}`}>
                {balanceStr}
              </span>{" "}
              сп
            </p>
          ) : null}
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={`min-w-13 text-right text-[11px] tabular-nums text-muted-foreground ${
              loading ? "visible" : "invisible"
            }`}
            aria-live="polite"
          >
            Аналіз…
          </span>
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            className="rounded-md border border-border/80 bg-secondary p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${
                expanded ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>
        </div>
      </header>

      <div
        id={bodyId}
        className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
          expanded
            ? "mt-3 grid-rows-[1fr] opacity-100"
            : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
    

          <div className="space-y-1 rounded-xl bg-muted/25 px-2 py-2 ring-1 ring-border/40 dark:bg-muted/15 dark:ring-border/30">
            <MoveRow who="Твій хід" entry={lastPlayer} isPlayer={true} />
            <div className="mx-0.5 border-t border-border/50" />
            <MoveRow who="Хід бота" entry={lastBot} isPlayer={false} />
          </div>

          <div className="mt-3 border-t border-border/60 pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Баланс якості (сп)
            </p>
            <div className="mt-2 flex min-h-7 items-baseline justify-between gap-2 text-sm">
              <span className="text-foreground">Ти</span>
              <span className={`font-mono text-base font-semibold tabular-nums ${balanceColor}`}>
                {balanceStr}
              </span>
              <span className="text-foreground">Бот</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Позитивне — твої ходи загалом сильніші за помилки бота; негативне —
              навпаки.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
