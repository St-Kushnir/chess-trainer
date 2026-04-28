"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme";

const navItems = [
  { href: "/trainer", label: "Тренажер" },
  { href: "/learn", label: "Навчання" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const currentItem = useMemo(() => {
    return navItems.find((item) => item.href === pathname) ?? navItems[0];
  }, [pathname]);

  useEffect(() => {
    queueMicrotask(() => {
      setIsMobileMenuOpen(false);
    });
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-card/75 backdrop-blur-xl dark:bg-card/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-15 sm:px-8">
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
            <div className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-nav-menu"
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-secondary/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-card dark:bg-secondary/60"
              >
                {currentItem.label}
                <ChevronDown
                  aria-hidden
                  size={14}
                  className={`transition-transform duration-200 ${
                    isMobileMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <ul
                id="mobile-nav-menu"
                className={`absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-44 rounded-xl border border-border/70 bg-card/95 p-1 shadow-lg ring-1 ring-border/40 backdrop-blur-sm transition-all duration-200 ${
                  isMobileMenuOpen
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none -translate-y-1 opacity-0"
                }`}
              >
                {navItems.map(({ href, label }) => {
                  const isActive = pathname === href;

                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`block rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }`}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <ul className="hidden items-center gap-0.5 rounded-full border border-border/60 bg-secondary/90 p-1 shadow-sm dark:bg-secondary/60 sm:flex">
              {navItems.map(({ href, label }) => {
                const isActive = pathname === href;

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`block rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-card text-foreground"
                          : "text-muted-foreground hover:bg-card hover:text-foreground"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
