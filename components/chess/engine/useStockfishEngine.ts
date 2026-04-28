"use client";

import { useEffect, useState } from "react";
import { StockfishEngine } from "./StockfishEngine";

export type StockfishStatus = "loading" | "ready" | "error";

/**
 * Створює один екземпляр Stockfish на життєвий цикл компонента.
 * Завершує Worker при unmount.
 */
export function useStockfishEngine() {
  const [engine, setEngine] = useState<StockfishEngine | null>(null);
  const [status, setStatus] = useState<StockfishStatus>("loading");

  useEffect(() => {
    const instance = new StockfishEngine();
    let cancelled = false;
    instance
      .init()
      .then(() => {
        if (cancelled) {
          instance.destroy();
          return;
        }
        setEngine(instance);
        setStatus("ready");
      })
      .catch((err) => {
        console.error("Stockfish init failed", err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      instance.destroy();
      setEngine(null);
    };
  }, []);

  return { engine, status };
}
