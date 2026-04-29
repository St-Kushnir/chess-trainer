export type DebutSideId = "blacks" | "whites";

export type DebutVideoItem = {
  id: string;
  /** Ім'я файлу в `public/videos/{side}/` */
  file: string;
  title: string;
  description: string;
  /** Позначка для особливо корисного матеріалу (наприклад, сильна схема за білих) */
  recommended?: boolean;
};

const whites: DebutVideoItem[] = [
  {
    id: "strong-debut-scheme",
    file: "strong-debut-scheme.mp4",
    title: "Сильна схема дебюту за білих",
    description:
      "Структурований план розвитку фігур і типові ідеї — добре підходить, щоб закріпити «правильний» старт партії за білих.",
    recommended: true,
  },
  {
    id: "alien-gambit-caro-kann",
    file: "alien-gambit-in-caro-kann-defense.mp4",
    title: "«Інопланетний» гамбіт у захисті Каро-Канн",
    description:
      "Рідкісна продовження з незвичною ідеєю тиску; корисно бачити типові помилки чорних.",
  },
  {
    id: "winning-queen-2-knights",
    file: "winning-the-queen-in-the-2-knight-opening.mp4",
    title: "Виграш ферзя в дебюті двох коней",
    description:
      "Тактична тема: як використати розвиток у відкритті двох коней, щоб «піймати» ферзя.",
  },
  {
    id: "trap-tennison-gambit",
    file: "trap-in-tennisons-gambit.mp4",
    title: "Пастка в гамбіті Теннісона",
    description:
      "Коротка комбінаційна ідея після типових ходів — запам’ятай шаблон для бліцу й онлайн.",
  },
  {
    id: "legal-italian",
    file: "Legal-сheckmate-at-the-opening-of-the-Italian-game.mp4",
    title: "Мат Легаля на початку італійської партії",
    description:
      "Класичний італійський розвиток і як чорні можуть потрапити під матову сітку.",
  },
  {
    id: "sacrifice-knight-bishop-queen",
    file: "sacrifice-of-a-knight-and-bishop-for-a-queen.mp4",
    title: "Жертва коня й слона за ферзя",
    description:
      "Матеріальний розрахунок у дебюті: коли жертва фігур повністю окупається ферзем.",
  },
  {
    id: "checkmate-2-knights-opening",
    file: "сheckmate-in-the-2-knight-opening.mp4",
    title: "Мат у дебюті двох коней",
    description:
      "Швидкий наслідок у типовій розстановці — корисно для розуміння тактики центру.",
  },
  {
    id: "checkmate-scandinavian",
    file: "checkmate-in-Scandinavian-defense.mp4",
    title: "Мат проти скандинавського захисту",
    description:
      "Як білі карають неакуратну гру чорних у популярному відповіді dxe5.",
  },
  {
    id: "trap-karo-kann",
    file: "trap-in-karo-kan-defense.mp4",
    title: "Пастка в захисті Каро-Канн",
    description:
      "Типова помилка чорних і точне покарання з боку білих.",
  },
  {
    id: "trap-alapin",
    file: "trap-in-Alapins-debut.mp4",
    title: "Пастка в дебюті Аляпіна",
    description:
      "Ідеї сицилійського аляпінського варіанту та тактичний удар по королю.",
  },
  {
    id: "checkmate-bishops-opening-b7",
    file: "checkmate-in-the-bishops-opening-on-b7.mp4",
    title: "Мат у слоновому дебюті на b7",
    description:
      "Тема слабкого поля b7 і координації легких фігур у центральній структурі.",
  },
  {
    id: "winning-queen-grob",
    file: "winning-the-queen-in-Grobs-debut.mp4",
    title: "Виграш ферзя в дебюті Гробба",
    description:
      "Нестандартний початок g4 і як покарати надто самовпевнену відповідь суперника.",
  },
  {
    id: "trap-vienna-gambit",
    file: "trap-in-the-vienna-gambit.mp4",
    title: "Пастка у віденському гамбіті",
    description:
      "Енергійний розвиток і типові шахові «гачки» для суперника в віденській партії.",
  },
];

const blacks: DebutVideoItem[] = [
  {
    id: "fried-liver-counter-1",
    file: "fried-liver-counter-attack-1.mp4",
    title: "Контратака «смаженої печінки» (частина 1)",
    description:
      "Як чорні відповідають на небезпечну атаку білих у італійській системі — базові ідеї.",
  },
  {
    id: "fried-liver-counter-2",
    file: "fried-liver-counter-attack-2.mp4",
    title: "Контратака «смаженої печінки» (частина 2)",
    description:
      "Продовження розбору: типові ходи білих і точні відповіді чорних.",
  },
  {
    id: "queens-sacrifice",
    file: "queens-sacrifice.mp4",
    title: "Жертва ферзя в дебюті",
    description:
      "Зухвала комбінація: коли відмова від ферзя веде до мату або вирішального переваги.",
  },
  {
    id: "trap-central-opening",
    file: "trap in the central opening.mp4",
    title: "Пастка в центральному дебюті",
    description:
      "Типові ходи в відкритих початках e4/e5 і як чорні ставлять пастку в центрі.",
  },
  {
    id: "trap-baby-mat",
    file: "trap-against-baby-mat.mp4",
    title: "Пастка проти «дитячого» мату",
    description:
      "Як чорні покарають надто ранню загрозу мату та перехоплять ініціативу.",
  },
  {
    id: "traxler-counterattack",
    file: "traxlers-counterattack.mp4",
    title: "Контратака Тракслера",
    description:
      "Відома відповідь чорних у двокінному захисті проти жертви на f7.",
  },
  {
    id: "trap-e4-e5",
    file: "trap-at-the-opening-e4-e5.mp4",
    title: "Пастка після 1.e4 e5",
    description:
      "Класична відкрита структура і тактичний удар, якщо білі зіграли неточно.",
  },
  {
    id: "trap-d4-e5",
    file: "trap-in-the-opening-on-d4-e5.mp4",
    title: "Пастка в розстановці d4 / e5",
    description:
      "Ідеї для чорних у напіввідкритих структурах з центральним тиском.",
  },
  {
    id: "englund-gambit-1",
    file: "trap-in-the Englund-Gambit-1.mp4",
    title: "Пастка в гамбіті Еглунда (частина 1)",
    description:
      "Рідкісний гамбіт чорних і типові помилки білих у практиці.",
  },
  {
    id: "englund-gambit-2",
    file: "trap-in-the Englund-Gambit-2.mp4",
    title: "Пастка в гамбіті Еглунда (частина 2)",
    description:
      "Додаткові варіанти та завершення тактичної ідеї.",
  },
  {
    id: "trap-stafford-gambit",
    file: "trap-in-the-stafford-gambit.mp4",
    title: "Пастка у гамбіті Стаффорда",
    description:
      "Швидкий контргамбіт чорних після 1.e4 e5 2.Nf3 Nc6 3.Bc4 — хитрі розгалуження.",
  },
  {
    id: "gangster-gambit",
    file: "gangster-gambit.mp4",
    title: "«Гангстерський» гамбіт",
    description:
      "Агресивний підхід чорних із нестандартним розвитком і матовими загрозами.",
  },
];

export const DEBUT_SIDES: {
  id: DebutSideId;
  label: string;
  shortLabel: string;
  intro: string;
}[] = [
  {
    id: "whites",
    label: "Білі",
    shortLabel: "білих",
    intro:
      "Дебютні ідеї та пастки, коли ти граєш білими фігурами — від класики до рідкісних гамбітів.",
  },
  {
    id: "blacks",
    label: "Чорні",
    shortLabel: "чорних",
    intro:
      "Як чорні карають помилки суперника, контратакують і будують контргамбіти на першій дошці.",
  },
];

export function debutVideosForSide(side: DebutSideId): DebutVideoItem[] {
  return side === "whites" ? whites : blacks;
}

export function debutSideLabel(side: DebutSideId): string {
  return DEBUT_SIDES.find((s) => s.id === side)?.label ?? side;
}

export function isDebutSideId(value: string): value is DebutSideId {
  return value === "blacks" || value === "whites";
}

/** URL до файлу в `public/videos` з коректним кодуванням імені. */
export function debutVideoPublicUrl(side: DebutSideId, file: string): string {
  const encoded = file
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/videos/${side}/${encoded}`;
}
