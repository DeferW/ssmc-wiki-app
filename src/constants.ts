export const DATA_ROOT =
  "https://raw.githubusercontent.com/DeferW/ssmc-wiki-data/main/data/";
export const DATA_URL = `${DATA_ROOT}equipment-catalog.json`;

export const CATEGORY_ORDER = [
  "Оружие",
  "Боеприпасы и взрывчатка",
  "Обвесы",
  "Ближний бой",
  "Броня",
  "Экипировка",
  "Медицина",
  "Снаряжение",
  "Другое",
] as const;

export const ADMIN_DRAFT_KEY = "ssmc-equipment-admin-overrides-v1";
export const ADMIN_API_URL =
  "https://ssmc-wiki-admin-api.24dfffer.workers.dev/api/overrides";

export const modules = [
  {
    slug: "equipment",
    title: "Снаряжение",
    text: "Оружие, боеприпасы, обвесы и остальное оснащение морпехов.",
  },
  {
    slug: "weapon-builder",
    title: "Конструктор оружия",
    text: "Выбор оружия, совместимых обвесов и итоговых характеристик сборки.",
    status: "Запланировано",
  },
  {
    slug: "damage",
    title: "Калькулятор урона",
    text: "Урон на выбранной дистанции с falloff, бронёй и бронепробитием.",
    status: "Запланировано",
  },
  {
    slug: "compare",
    title: "Сравнение",
    text: "Несколько предметов рядом без прыжков между вкладками вики.",
    status: "Запланировано",
  },
  {
    slug: "loadout",
    title: "Комплект бойца",
    text: "Оружие, броня, пояс, подсумки и расходники в одной сборке.",
    status: "Запланировано",
  },
  {
    slug: "chemistry",
    title: "Химический планировщик",
    text: "Расчёт реагентов и пошаговый маршрут приготовления.",
    status: "Запланировано",
  },
];
