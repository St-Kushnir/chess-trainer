import type { Metadata } from "next";
import Link from "next/link";
import { DebutSideToggle } from "@/components/learn/DebutSideToggle";
import { DEBUT_SIDES } from "@/lib/learn/debutVideos";

export const metadata: Metadata = {
  title: "Дебюти",
  description:
    "Дебютні пастки та ідеї за білих і чорних — відео з короткими описами українською.",
};

export default function DebutsIndexPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <nav className="text-sm text-muted-foreground">
        <Link href="/learn" className="text-primary hover:underline">
          Навчання
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-foreground">Дебюти</span>
      </nav>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Дебюти
          </h1>
          <div
            className="mt-3 h-1 w-14 rounded-full bg-primary"
            aria-hidden
          />
        </div>
        <DebutSideToggle />
      </div>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Обери колір фігур: підбірка коротких відео про дебютні пастки та ідеї —
        з описом українською; відкрий картку й переглянь ролик прямо на сторінці.
      </p>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2">
        {DEBUT_SIDES.map(({ id, label, intro }) => (
          <li key={id}>
            <Link
              href={`/learn/debuts/${id}`}
              className="group flex h-full flex-col rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/50 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md dark:bg-card/70 dark:ring-border/40 dark:hover:border-primary/40"
            >
              <span className="text-xl font-semibold tracking-tight text-foreground">
                {label}
              </span>
              <span className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {intro}
              </span>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5">
                Відкрити список
                <span aria-hidden>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
