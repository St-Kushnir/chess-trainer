import type { Metadata } from "next";
import { TrainerWorkspace } from "./trainer-workspace";

export const metadata: Metadata = {
  title: "Тренажер",
  description:
    "Гра з ботом Stockfish у браузері — вибір рівня, кольору і миттєві ходи без сервера.",
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
          Грайте проти Stockfish прямо у браузері: оберіть колір і рівень
          складності, далі робіть ходи перетягуванням або кліком. Бот відповідає
          сам.
        </p>
      </div>

      <TrainerWorkspace />
    </div>
  );
}
