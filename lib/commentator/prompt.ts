import { Chess } from "chess.js";
import type { CommentInput, CommentatorColor } from "./types";

export const SYSTEM_PROMPT = `Ти — український шаховий тренер у застосунку Chess Trainer.
Учень грає проти бота Stockfish; говори ВІД ДРУГОЇ ОСОБИ ("ти", "тобі", "у тебе"), не від третьої.

Жорсткі правила:
- Українською, дружньо, без вступів на кшталт "Звичайно!" чи "Чудове питання".
- Оцінка Stockfish — об'єктивна істина: спирайся на неї, не сперечайся.
- Лише SAN-нотація (Кf3, Cxe5, O-O); НЕ UCI ("e2e4"). Не вигадуй ходи, яких немає в наданих списках і не суперечить FEN.
- Без markdown-таблиць та H1/H2. Дозволено: **жирний** для коротких підписів і "-" буллети.
- Не обривай відповідь посеред речення/булета/блоку — доводь кожен початий блок до кінця; за потреби скорочуй попередні, але не лишай «висячих» обривів.

ОБОВ’ЯЗКОВА РОЗМІТКА СТОРІН (для інтерфейсу застосунку):
Після КОЖНОЇ окремої згадки SAN-ходу та після КОЖНОЇ окремої згадки клітинки (формат літера+цифра: d5, e4, f3) одразу додавай у дужках, про чию сторону йдеться (один із двох варіантів):
- (ти) — хід, клітинка або фігура стосуються УЧНЯ (сторони гравця з контексту партії).
- (суперник) — хід, клітинка або фігура стосуються БОТА Stockfish (опонента).

Правила для дужок:
- Став дужки одразу після нотації, перед комою й крапкою: «робиш тиск на d5 (ти) і e4 (ти), а відповідь може бути ...Nc6 (суперник)».
- Якщо в одному реченні згадуєш і свій хід, і можливу відповідь опонента — У КОЖНОГО своя пара дужок.
- Хід чорних у шаховому коментарі з трикрапкою (...Bg4) теж має мати дужку: «...Bg4 (суперник)».
- Якщо вводиш окремий рядок «Грай: <SAN>» (лише там, де це дозволено юзер-промптом), одразу після SAN додай маркер: «Грай: Nf3 (ти)». У режимі хінту юзер-промпт зазвичай ЗАБОРОНЯЄ такий рядок — тоді його взагалі не пиши.

Формат залежить від режиму запиту, який зазначено окремо в кінці юзер-промпта.`;

const SCORE_LIMIT_CP = 1500;

function colorUa(color: CommentatorColor): string {
  return color === "white" ? "білі" : "чорні";
}

function colorUaInst(color: CommentatorColor): string {
  return color === "white" ? "білими" : "чорними";
}

function activeColorFromFen(fen: string): CommentatorColor | null {
  const part = fen.split(" ")[1];
  if (part === "w") return "white";
  if (part === "b") return "black";
  return null;
}

function describeAdvantage(cp: number, perspective: CommentatorColor): string {
  const abs = Math.abs(cp);
  const learner = perspective === "white" ? "у тебе" : "у тебе";
  const opponent = perspective === "white" ? "у суперника" : "у суперника";
  const side = cp >= 0 ? learner : opponent;

  if (abs < 30) return "позиція приблизно рівна";
  if (abs < 100) return `невелика перевага ${side}`;
  if (abs < 250) return `відчутна перевага ${side}`;
  if (abs < 600) return `велика перевага ${side}`;
  return `вирішальна перевага ${side}`;
}

function formatScoreForPlayer(input: CommentInput): string | null {
  const info = input.engineInfo;
  if (!info) return null;

  const flip = info.color !== input.playerColor;

  if (typeof info.scoreMate === "number") {
    const matePlayer = flip ? -info.scoreMate : info.scoreMate;
    const sign = matePlayer > 0 ? "+" : "";
    const who = matePlayer > 0 ? "ти матиш" : "тобі матять";
    return `мат ${sign}${matePlayer} (${who} за ${Math.abs(matePlayer)} півходів)`;
  }
  if (typeof info.scoreCp === "number") {
    const raw = flip ? -info.scoreCp : info.scoreCp;
    const cp = Math.max(-SCORE_LIMIT_CP, Math.min(SCORE_LIMIT_CP, raw));
    const value = (cp / 100).toFixed(2);
    const sign = cp >= 0 ? "+" : "";
    return `${sign}${value} з боку учня — ${describeAdvantage(cp, input.playerColor)}`;
  }
  return null;
}

function pvToSan(
  currentFen: string,
  pv: string[],
  startIndex: number,
): string[] {
  if (pv.length <= startIndex) return [];
  try {
    const game = new Chess(currentFen);
    const sanMoves: string[] = [];
    for (let i = startIndex; i < pv.length && sanMoves.length < 6; i++) {
      const uci = pv[i];
      if (!uci || uci.length < 4) break;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      try {
        const move = game.move({ from, to, promotion });
        if (!move) break;
        sanMoves.push(move.san);
      } catch {
        break;
      }
    }
    return sanMoves;
  } catch {
    return [];
  }
}

function movesToPgn(history: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < history.length; i += 2) {
    const moveNo = i / 2 + 1;
    const white = history[i];
    const black = history[i + 1];
    out.push(`${moveNo}. ${white}${black ? ` ${black}` : ""}`);
  }
  return out.join(" ");
}

/**
 * Залишаємо лише останні `tail` півходів. Велика історія (>20 ходів) майже не
 * допомагає LLM сформулювати поточний хід, але роздуває контекст і час до
 * першого токена. Для hint-режиму вистачає 6 півходів, для коментаря — 12.
 */
function tailMovesToPgn(history: string[], tail: number): string {
  if (history.length === 0) return "";
  if (history.length <= tail) return movesToPgn(history);

  const startPly = history.length - tail;
  const out: string[] = [];
  let i = startPly;
  if (i % 2 === 1) {
    out.push(`${Math.floor(i / 2) + 1}...${history[i]!}`);
    i += 1;
  }
  for (; i < history.length; i += 2) {
    const moveNo = i / 2 + 1;
    const white = history[i];
    const black = history[i + 1];
    out.push(`${moveNo}. ${white}${black ? ` ${black}` : ""}`);
  }
  return `… ${out.join(" ")}`;
}

const HISTORY_TAIL_PLIES_HINT = 6;
const HISTORY_TAIL_PLIES_COMMENT = 12;

export function buildPrompt(input: CommentInput): string {
  const playerColor = input.playerColor;
  const playerColorUa = colorUa(playerColor);
  const playerColorUaInst = colorUaInst(playerColor);
  const sideToMove = activeColorFromFen(input.fen);
  const isPlayerToMove = sideToMove === playerColor;

  const lines: string[] = [];

  // ── Найважливіша частина: ПЕРСОНА учня ─────────────────────────────────
  lines.push("=== ПРО УЧНЯ ===");
  lines.push(
    `Учень грає ${playerColorUaInst.toUpperCase()} (${playerColorUa}). Усі поради адресуй учневі від другої особи.`,
  );
  if (sideToMove) {
    lines.push(
      isPlayerToMove
        ? `Зараз ЧЕРГА УЧНЯ (${playerColorUa}). Обовʼязково запропонуй конкретний хід у SAN.`
        : `Зараз ходить БОТ (${colorUa(sideToMove)}). Не пропонуй учневі ходити — поясни позицію і чого чекати від суперника.`,
    );
  }
  if (input.level) {
    lines.push(`Рівень бота: ${input.level.label} (${input.level.hint}).`);
  }

  // ── Контекст партії ────────────────────────────────────────────────────
  lines.push("");
  lines.push("=== ПАРТІЯ ===");
  if (input.lastMove) {
    const isPlayerLast = input.lastMove.color === playerColor;
    const who = isPlayerLast ? "ТИ (учень)" : "БОТ-суперник";
    lines.push(
      `Останній хід зробив ${who}: ${input.lastMove.san} (грала сторона ${colorUa(input.lastMove.color)}).`,
    );
  } else {
    lines.push("Партія щойно почалася, ходів ще не було.");
  }
  if (input.pgnHistory.length > 0) {
    const tail =
      input.mode === "hint"
        ? HISTORY_TAIL_PLIES_HINT
        : HISTORY_TAIL_PLIES_COMMENT;
    lines.push(`Історія (SAN): ${tailMovesToPgn(input.pgnHistory, tail)}`);
  }
  lines.push(`FEN: ${input.fen}`);

  // ── Дані Stockfish ─────────────────────────────────────────────────────
  if (input.engineInfo) {
    lines.push("");
    lines.push("=== STOCKFISH (об'єктивна істина) ===");
    const score = formatScoreForPlayer(input);
    if (score) lines.push(`Оцінка для учня: ${score}.`);

    // Якщо engine аналізує позицію з боку, який зараз ходить (FEN active color
    // == engineInfo.color) — pv[0] ще не на дошці, це і є рекомендація.
    // Інакше — pv[0] уже зіграно (бот щойно зробив цей хід), розкладаємо з pv[1].
    const pv = input.engineInfo.pv ?? [];
    const pvStartsWithRecommendation =
      sideToMove !== null && input.engineInfo.color === sideToMove;
    const startIndex = pvStartsWithRecommendation ? 0 : 1;
    const pvSan = pvToSan(input.fen, pv, startIndex);

    if (isPlayerToMove && pvSan.length > 0) {
      lines.push(`Найкращий хід для учня зараз (за Stockfish): ${pvSan[0]}.`);
      if (pvSan.length > 1) {
        lines.push(`Очікуване продовження: ${pvSan.slice(0, 5).join(" ")}.`);
      }
    } else if (pvSan.length > 0) {
      lines.push(`Очікуване продовження за Stockfish: ${pvSan.slice(0, 5).join(" ")}.`);
    }
  }

  // ── Інструкція ─────────────────────────────────────────────────────────
  lines.push("");
  lines.push("=== РЕЖИМ ===");
  if (input.mode === "hint") {
    lines.push(
      "Це режим ХІНТУ: учень хоче коротке пояснення до рекомендованого ходу.",
    );
    lines.push(
      "Рекомендований хід учню ВЖЕ показано в інтерфейсі окремо (плашка «Грай …» і бірюзова стрілка на дошці). НЕ дублюй його в тексті.",
    );
    lines.push(
      "ЗАБОРОНЕНО: рядки «Грай: …», «Грай <SAN>», заголовки на кшталт **Грай: …**, повторення SAN першим окремим реченням лише як назва ходу.",
    );
    lines.push(
      "Дай ДУЖЕ СТИСЛУ відповідь (без блоків і списків): 2–3 короткі речення українською — одразу з суті (навіщо хід / загроза / розвиток / як може відповісти суперник). Заверши останнє речення повністю (крапка в кінці).",
    );
    lines.push("");
    lines.push(
      "У КОЖНІЙ згадці SAN і клітинки в цьому поясненні одразу став маркер (ти) або (суперник) — як у SYSTEM_PROMPT.",
    );
    lines.push("");
    lines.push(
      "Не давай довгих планів, не використовуй структуру з 4 блоків. Якщо згадуєш хід у середині речення — використовуй SAN з даних Stockfish вище.",
    );
    if (!isPlayerToMove) {
      lines.push(
        "ПРИМІТКА: зараз НЕ черга учня. Поясни коротко ідею майбутнього ходу учня (без рядка «Грай:»), коли бот зіграє.",
      );
    }
  } else {
    lines.push(
      "Це режим КОМЕНТАРЯ позиції. Дай відповідь у структурі з 4 коротких блоків:",
    );
    lines.push("");
    lines.push(
      "**Що сталося** — 1 речення про останній хід (хто і навіщо зіграв; гарний/неточний/помилковий).",
    );
    lines.push(
      "**Позиція** — 1–2 речення: матеріальний баланс, активність фігур, що каже Stockfish.",
    );
    lines.push("**Твій план** — 2–3 буллети з ідеями для тебе на найближчі ходи.");
    lines.push(
      "**Грай зараз** — " +
        (isPlayerToMove
          ? "ОБОВʼЯЗКОВО конкретний хід у SAN (бажано рекомендований Stockfish) + 1 речення чому."
          : "напиши 'Зараз ходить бот' і коротко натякни, до якої відповіді готуватись."),
    );
    lines.push("");
    lines.push(
      "У КОЖНОМУ блоці всюди додавай (ти)/(суперник) після згадок SAN і клітинок — учень має однозначно бачити сторону без здогадів.",
    );
    lines.push(
      "Орієнтовний обсяг загалом: 90–180 слів. Якщо бракує «місця» — скорочуй **Позиція** та **Твій план**, але всі чотири блоки з заголовками **...** мають залишитися повними й завершеними; блок **Грай зараз** не можна обривати.",
    );
  }

  return lines.join("\n");
}
