import Link from "next/link";

const sections = [
  {
    href: "/level-assessment",
    title: "Визначення рівня",
    description:
      "Діагностика сильних і слабких сторін гри — основа для персональних рекомендацій від AI.",
    step: "01",
  },
  {
    href: "/trainer",
    title: "Тренажер",
    description:
      "Швидкий старт: гра з ботом та тренування без зайвих кроків.",
    step: "02",
  },
  {
    href: "/learn",
    title: "Навчання",
    description:
      "Уроки, теми та матеріали для поступового зростання рейтингу й розуміння позицій.",
    step: "03",
  },
] as const;

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.45)]" />
          AI-агент поруч під час гри та навчання
        </p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-[1.1]">
          Шаховий онлайн-тренажер{" "}
          <span className="text-primary">нового покоління</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Оцінка рівня, партії з ботом і структуровані матеріали — у спокійному,
          зручному для довгих сесій інтерфейсі.
        </p>
      </div>

      <ul className="mx-auto mt-16 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {sections.map(({ href, title, description, step }) => (
          <li key={href}>
            <Link
              href={href}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)] ring-1 ring-border/40 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_20px_48px_-16px_hsl(var(--primary)/0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_16px_40px_-12px_rgba(0,0,0,0.65)] dark:ring-border/30 dark:hover:border-primary/40 dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.5),0_24px_56px_-12px_hsl(var(--primary)/0.12)]"
            >
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold tabular-nums text-primary ring-1 ring-primary/15">
                {step}
              </span>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </span>
              <span className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {description}
              </span>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5">
                Перейти
                <span aria-hidden>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
