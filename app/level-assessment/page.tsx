import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Визначення рівня",
  description: "Оцінка шахового рівня та слабких місць для подальшого тренування.",
};

export default function LevelAssessmentPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Визначення рівня
        </h1>
        <div
          className="mt-3 h-1 w-14 rounded-full bg-primary"
          aria-hidden
        />
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Тут з&apos;явиться сценарій діагностики (тести, партії, питання) та
          інтеграція з AI-агентом для підсумку й плану розвитку.
        </p>
      </div>
      <div className="mt-10 max-w-2xl rounded-2xl border border-border/80 bg-card/90 p-8 text-sm leading-relaxed text-muted-foreground shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40">
        Робоча область для діагностики — контент з&apos;явиться на наступних
        ітераціях.
      </div>
    </div>
  );
}
