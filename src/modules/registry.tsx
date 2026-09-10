import { lazy, type ComponentType } from "react";
import { modulePath } from "../routes";

const EquipmentPage = lazy(() => import("./equipment/EquipmentPage").then((module) => ({ default: module.EquipmentPage })));
const ChemistryPage = lazy(() => import("./chemistry/ChemistryPage").then((module) => ({ default: module.ChemistryPage })));
const DamagePage = lazy(() => import("./damage/DamagePage").then((module) => ({ default: module.DamagePage })));
const MapPage = lazy(() => import("./maps/MapPage").then((module) => ({ default: module.MapPage })));

export type ModuleDefinition = {
  id: string;
  path: string;
  title: string;
  summary: string;
  code: string;
  status: "active" | "planned";
  Component?: ComponentType;
};

export const modules: ModuleDefinition[] = [
  {
    id: "equipment",
    path: modulePath("equipment"),
    title: "Каталог снаряжения",
    summary: "Оружие, боезапас, броня, медицина и полевое оснащение морпехов.",
    code: "EQP-01",
    status: "active",
    Component: EquipmentPage,
  },
  {
    id: "maps",
    path: modulePath("maps"),
    title: "Игровые карты",
    summary: "Тактические карты, зоны обстрела и расположение разного снаряжения",
    code: "MAP-02",
    status: "active",
    Component: MapPage,
  },
  {
    id: "chemistry",
    path: modulePath("chemistry"),
    title: "Химический планировщик",
    summary: "Реагенты, реакции и пошаговый маршрут приготовления состава.",
    code: "CHM-03",
    status: "active",
    Component: ChemistryPage,
  },
  {
    id: "damage",
    path: modulePath("damage"),
    title: "Калькулятор урона",
    summary: "Расчёт урона с учётом дистанции, брони и бронепробития.",
    code: "DMG-04",
    status: "active",
    Component: DamagePage,
  },
  {
    id: "explosions",
    path: modulePath("explosions"),
    title: "Симулятор взрывов",
    summary: "Радиус, урон и воздействие взрывчатки на разных дистанциях.",
    code: "EXP-05",
    status: "planned",
  },
  {
    id: "loadout",
    path: modulePath("loadout"),
    title: "Комплект бойца",
    summary: "Оружие, броня, пояс, подсумки и расходники в одной сборке, на одном фото.",
    code: "LDT-06",
    status: "planned",
  },
];

export const activeModules = modules.filter(
  (module): module is ModuleDefinition & { Component: ComponentType } =>
    module.status === "active" && Boolean(module.Component),
);

export const plannedModules = modules.filter(
  (module) => module.status === "planned",
);
