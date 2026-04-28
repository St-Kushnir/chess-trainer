#!/usr/bin/env node
/**
 * Копіює Stockfish lite single-threaded WASM-рушій з node_modules
 * у `public/stockfish/`, щоб він віддавався як статика і завантажувався
 * у Web Worker на клієнті.
 *
 * Викликається через `postinstall` після `npm install` і вручну
 * через `npm run setup:engine`.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourceDir = join(root, "node_modules", "stockfish", "bin");
const destDir = join(root, "public", "stockfish");

const FILES = [
  ["stockfish-18-lite-single.js", "stockfish.js"],
  ["stockfish-18-lite-single.wasm", "stockfish.wasm"],
];

function safeCopy(srcRel, destRel) {
  const src = join(sourceDir, srcRel);
  const dest = join(destDir, destRel);
  if (!existsSync(src)) {
    console.warn(`[setup-engine] Файл не знайдено: ${src}. Пропускаю.`);
    return;
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) {
    return;
  }
  copyFileSync(src, dest);
  console.log(`[setup-engine] Скопійовано ${srcRel} → public/stockfish/${destRel}`);
}

if (!existsSync(sourceDir)) {
  console.warn(
    "[setup-engine] node_modules/stockfish/bin не існує (можливо, depencies ще не встановлені). Пропускаю.",
  );
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const [src, dest] of FILES) safeCopy(src, dest);
