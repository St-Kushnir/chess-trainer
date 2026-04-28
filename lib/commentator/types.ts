export type CommentatorColor = "white" | "black";

export type CommentEngineInfo = {
  /** UCI рекомендований хід (наприклад, "e2e4"). */
  bestmove: string;
  /** Принципова варіація — найкраща лінія в UCI. */
  pv?: string[];
  /** Оцінка позиції в сантипішаках з боку, який щойно ходив. */
  scoreCp?: number;
  /** Мат у N півходів (додатний — ми матимо). */
  scoreMate?: number;
  /** Колір сторони, яка отримала цю оцінку (хто щойно зіграв). */
  color: CommentatorColor;
};

export type CommentLevel = {
  id: number;
  label: string;
  hint: string;
};

export type CommentMode = "comment" | "hint";

export type CommentInput = {
  /** Поточна позиція (FEN), уже ПІСЛЯ останнього ходу. */
  fen: string;
  /** Історія партії в SAN-нотації. */
  pgnHistory: string[];
  /** Чий бік користувач (для тону пояснень). */
  playerColor: CommentatorColor;
  /** Рівень суперника-бота (для адаптації пояснення). */
  level?: CommentLevel;
  /** Останній зроблений хід. */
  lastMove?: {
    san: string;
    uci: string;
    color: CommentatorColor;
  };
  /** Аналіз позиції від рушія (Stockfish), якщо вже є. */
  engineInfo?: CommentEngineInfo;
  /** Кому призначене пояснення: завжди користувачу. */
  audience?: "player";
  /** Режим: "comment" (загальний коментар) або "hint" (короткий фокус-хід). */
  mode?: CommentMode;
};

export interface ChessCommentator {
  /**
   * Повертає асинхронний ітератор шматків тексту з потоковою генерацією.
   * Кожен елемент — фрагмент рядка (без переносів додавати не потрібно).
   */
  comment(input: CommentInput): AsyncIterable<string>;
}
