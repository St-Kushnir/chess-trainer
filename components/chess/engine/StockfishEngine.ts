"use client";

import type { ChessEngine, EngineMove, SearchOptions } from "./types";

const DEFAULT_WORKER_URL = "/stockfish/stockfish.js";

type PartialInfo = {
  pv?: string[];
  scoreCp?: number;
  scoreMate?: number;
};

/**
 * Stockfish-WASM рушій, що працює у Web Worker.
 * Завантажується з `public/stockfish/` (lite single-threaded ≈ 7 МБ).
 *
 * Спілкування — за UCI-протоколом через postMessage.
 */
export class StockfishEngine implements ChessEngine {
  private worker: Worker | null = null;
  private ready = false;
  private busy = false;
  private currentResolver: ((move: EngineMove) => void) | null = null;
  private currentInfo: PartialInfo = {};
  private readonly workerUrl: string;

  constructor(workerUrl: string = DEFAULT_WORKER_URL) {
    this.workerUrl = workerUrl;
  }

  async init(): Promise<void> {
    if (this.worker) return;
    if (typeof window === "undefined") {
      throw new Error("StockfishEngine можна створювати лише в браузері");
    }
    const worker = new Worker(this.workerUrl);
    this.worker = worker;
    worker.addEventListener("message", (e) => {
      const line = typeof e.data === "string" ? e.data : "";
      this.onMessage(line);
    });

    await this.send("uci", "uciok");
    await this.send("ucinewgame");
    await this.send("isready", "readyok");
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  isBusy(): boolean {
    return this.busy;
  }

  async bestMove(opts: SearchOptions): Promise<EngineMove> {
    if (!this.worker) throw new Error("Stockfish ще не ініціалізовано");
    if (this.busy) throw new Error("Stockfish зайнятий попереднім розрахунком");
    this.busy = true;
    this.currentInfo = {};

    if (opts.limitStrength === true && opts.uciElo != null) {
      const elo = clamp(opts.uciElo, 1320, 3190);
      await this.send(`setoption name UCI_LimitStrength value true`);
      await this.send(`setoption name UCI_Elo value ${elo}`);
    } else {
      await this.send(`setoption name UCI_LimitStrength value false`);
      const skill = clamp(opts.skill ?? 20, 0, 20);
      await this.send(`setoption name Skill Level value ${skill}`);
    }

    await this.send(`position fen ${opts.fen}`);
    await this.send("isready", "readyok");

    const goCmd =
      typeof opts.depth === "number"
        ? `go depth ${opts.depth}`
        : `go movetime ${opts.movetimeMs ?? 1000}`;

    return new Promise<EngineMove>((resolve) => {
      this.currentResolver = (move) => {
        this.busy = false;
        this.currentResolver = null;
        resolve(move);
      };
      this.worker?.postMessage(goCmd);
    });
  }

  stop(): void {
    if (!this.worker || !this.busy) return;
    this.worker.postMessage("stop");
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.busy = false;
    this.currentResolver = null;
    this.currentInfo = {};
  }

  private send(cmd: string, waitFor?: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.worker) {
        resolve();
        return;
      }
      if (!waitFor) {
        this.worker.postMessage(cmd);
        resolve();
        return;
      }
      const handler = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : "";
        if (line.includes(waitFor)) {
          this.worker?.removeEventListener("message", handler);
          resolve();
        }
      };
      this.worker.addEventListener("message", handler);
      this.worker.postMessage(cmd);
    });
  }

  private onMessage(line: string): void {
    if (!line) return;

    if (line.startsWith("info")) {
      const cp = line.match(/\bscore cp (-?\d+)/);
      const mate = line.match(/\bscore mate (-?\d+)/);
      const pv = line.match(/\bpv (.+?)(?:\s+(?:bmc|hashfull|nps|time|nodes)|$)/);
      if (cp) this.currentInfo.scoreCp = parseInt(cp[1], 10);
      if (mate) this.currentInfo.scoreMate = parseInt(mate[1], 10);
      if (pv) this.currentInfo.pv = pv[1].trim().split(/\s+/);
      return;
    }

    if (line.startsWith("bestmove")) {
      const parts = line.split(/\s+/);
      const bestmove = parts[1] ?? "";
      this.currentResolver?.({
        bestmove,
        pv: this.currentInfo.pv,
        scoreCp: this.currentInfo.scoreCp,
        scoreMate: this.currentInfo.scoreMate,
      });
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
