import type { ComponentType } from "react";
import { EquipmentPage } from "./equipment/EquipmentPage";

export type ModuleDefinition = {
  id: string;
  path: string;
  title: string;
  shortTitle: string;
  summary: string;
  code: string;
  status: "active" | "planned";
  Component?: ComponentType;
};

export const modules: ModuleDefinition[] = [
  {
    id: "equipment",
    path: "/equipment",
    title: "Каталог снаряжения",
    shortTitle: "Снаряжение",
    summary: "Оружие, боезапас, броня, медицина и полевое оснащение морпехов.",
    code: "EQP-01",
    status: "active",
    Component: EquipmentPage,
  },
  {
    id: "weapon-builder",
    path: "/weapon-builder",
    title: "Конструктор оружия",
    shortTitle: "Конструктор",
    summary: "Совместимые обвесы и итоговые параметры оружейной сборки.",
    code: "WPN-02",
    status: "planned",
  },
  {
    id: "damage",
    path: "/damage",
    title: "Калькулятор урона",
    shortTitle: "Урон",
    summary: "Расчёт урона с учётом дистанции, брони и бронепробития.",
    code: "DMG-03",
    status: "planned",
  },
  {
    id: "compare",
    path: "/compare",
    title: "Сравнение предметов",
    shortTitle: "Сравнение",
    summary: "Несколько предметов и их важные характеристики на одном экране.",
    code: "CMP-04",
    status: "planned",
  },
  {
    id: "loadout",
    path: "/loadout",
    title: "Комплект бойца",
    shortTitle: "Комплект",
    summary: "Оружие, броня, пояс, подсумки и расходники в одной сборке.",
    code: "LDT-05",
    status: "planned",
  },
  {
    id: "chemistry",
    path: "/chemistry",
    title: "Химический планировщик",
    shortTitle: "Химия",
    summary: "Реагенты, реакции и пошаговый маршрут приготовления состава.",
    code: "CHM-06",
    status: "planned",
  },
];

export const activeModules = modules.filter(
  (module): module is ModuleDefinition & { Component: ComponentType } =>
    module.status === "active" && Boolean(module.Component),
);
