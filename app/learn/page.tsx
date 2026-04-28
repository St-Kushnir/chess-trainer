import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Навчання",
  description:
    "Уроки, матеріали та опція визначення рівня для покращення гри в шахи.",
};

export default function LearnPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Навчання
        </h1>
        <div
          className="mt-3 h-1 w-14 rounded-full bg-primary"
          aria-hidden
        />
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Тут з&apos;явиться єдиний простір для навчання: каталог тем, сценарії
          практики та окрема опція для визначення твого поточного рівня.
        </p>
      </div>

      <div className="mt-10 grid max-w-4xl gap-5 sm:grid-cols-2">
        <section className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Каталог уроків
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Підбірка тем, пояснень і практичних завдань. Контент цього блоку
            буде додано на наступних ітераціях.
          </p>
        </section>

        <section
          id="level-assessment"
          className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40"
        >
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Визначення рівня
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Окрема опція в межах навчання: діагностика сильних і слабких сторін
            гри для персональних рекомендацій від AI.
          </p>
        </section>
      </div>
    </div>
  );
}
