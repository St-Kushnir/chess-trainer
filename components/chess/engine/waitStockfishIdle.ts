import type { ChessEngine } from "./types";

/**
 * Дочекатися, поки `engine.isBusy()` стане false (наприклад після `stop()` і
 * приходу `bestmove` від воркера). Потрібно перед новим `go`, щоб не отримати
 * «зайнятий попереднім розрахунком».
 */
export async function waitStockfishIdle(
  engine: ChessEngine,
  maxMs = 3000,
): Promise<void> {
  const step = 8;
  const maxSteps = Math.ceil(maxMs / step);
  for (let i = 0; i < maxSteps; i++) {
    if (!engine.isBusy()) return;
    await new Promise((r) => setTimeout(r, step));
  }
}
