import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Навчання",
  description: "Уроки та матеріали для покращення гри в шахи.",
};

export default function LearnPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Навчання
        </h1>
        <div
          className="mt-3 h-1 w-14 rounded-full bg-primary"
          aria-hidden
        />
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Тут з&apos;явиться каталог тем, уроків і зав&apos;язка на AI для
          пояснень і домашніх завдань.
        </p>
      </div>
      <div className="mt-10 max-w-2xl rounded-2xl border border-border/80 bg-card/90 p-8 text-sm leading-relaxed text-muted-foreground shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40">
        Каталог уроків і матеріалів буде додано на наступних ітераціях.
      </div>
    </div>
  );
}
