import type { Metadata } from "next";
import { ChessBoard } from "@/components/chess";

export const metadata: Metadata = {
  title: "Тренажер",
  description: "Гра з ботом та інтерактивне тренування в реальному часі.",
};

export default function TrainerPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Тренажер
        </h1>
        <div className="mt-3 h-1 w-14 rounded-full bg-primary" aria-hidden />
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Перетягуйте або клацайте по фігурі — підсвітяться легальні ходи. Права
          кнопка миші малює стрілку для нотаток.
        </p>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
        <ChessBoard
          className="mx-auto w-full max-w-[min(100%,560px)] lg:mx-0"
          boardId="trainer-main"
          showNewGame
        />
        <aside className="rounded-2xl border border-border/80 bg-card/90 p-6 text-sm leading-relaxed text-muted-foreground shadow-sm ring-1 ring-border/50 dark:bg-card/70 dark:ring-border/40">
          <p className="font-medium text-foreground">Підказки та бот</p>
          <p className="mt-2">
            Блок для оцінки позиції, ходу бота і коментарів агента — підключимо
            після інтеграції двигуна та API.
          </p>
        </aside>
      </div>
    </div>
  );
}
