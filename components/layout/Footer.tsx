import Link from "next/link";

const footerLinks = [
  { href: "/level-assessment", label: "Рівень" },
  { href: "/trainer", label: "Тренажер" },
  { href: "/learn", label: "Навчання" },
] as const;

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/80 bg-card/40 backdrop-blur-sm dark:bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md space-y-3">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Chess Trainer
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Онлайн-тренажер з підтримкою AI-агента: гра з ботом, навчання та
              оцінка рівня в одному інтерфейсі.
            </p>
          </div>
          <nav aria-label="Посилання в підвалі">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Розділи
            </p>
            <ul className="flex flex-col gap-2 text-sm sm:items-end">
              {footerLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-foreground/90 transition-colors hover:text-primary"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-10 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground sm:text-left">
          © {new Date().getFullYear()} Chess Trainer
        </div>
      </div>
    </footer>
  );
}
