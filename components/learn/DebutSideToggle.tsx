import Link from "next/link";
import { DEBUT_SIDES } from "@/lib/learn/debutVideos";
import type { DebutSideId } from "@/lib/learn/debutVideos";

type Props = {
  /** Який колір зараз обрано; якщо `null` — обидва пункти в нейтральному стані (сторінка вибору). */
  activeSide?: DebutSideId | null;
};

export function DebutSideToggle({ activeSide = null }: Props) {
  return (
    <div
      className="inline-flex shrink-0 rounded-full border border-border/60 bg-secondary/90 p-1 shadow-sm dark:bg-secondary/60"
      role="tablist"
      aria-label="Колір фігур у дебютах"
    >
      {DEBUT_SIDES.map(({ id, label }) => {
        const isActive = activeSide === id;
        return (
          <Link
            key={id}
            href={`/learn/debuts/${id}`}
            role="tab"
            aria-selected={isActive}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/50 dark:bg-card/90"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
