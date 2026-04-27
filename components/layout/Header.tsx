import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme";

const navItems = [
  { href: "/", label: "Головна" },
  { href: "/level-assessment", label: "Рівень" },
  { href: "/trainer", label: "Тренажер" },
  { href: "/learn", label: "Навчання" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-card/75 backdrop-blur-xl dark:bg-card/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-[3.75rem] sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 ring-1 ring-primary/15 transition-transform group-hover:scale-[1.03] sm:h-12 sm:w-14">
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              className="object-contain p-1"
              sizes="40px"
              priority
            />
          </span>
          <span className="leading-none">
            Chess{" "}
            <span className="font-medium text-muted-foreground">Trainer</span>
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <nav aria-label="Головна навігація">
            <ul className="flex items-center gap-0.5 rounded-full border border-border/60 bg-secondary/90 p-1 shadow-sm dark:bg-secondary/60">
              {navItems.map(({ href, label }, index) => (
                <li
                  key={href}
                  className={index === 0 ? "hidden sm:block" : undefined}
                >
                  <Link
                    href={href}
                    className="block rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:text-sm"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
