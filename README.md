# SSMC Wiki App

Модульное веб-приложение для инструментов Space Stories Marine Corps.

## Структура

```text
src/
  modules/
    registry.tsx       единый реестр модулей
    equipment/         рабочий каталог снаряжения
  pages/               главная, заглушки и 404
  styles/              базовая тема и стили отдельных экранов
  admin/               изолированная граница будущей админ-версии
```

Новый модуль добавляется отдельной папкой и одной записью в `modules/registry.tsx`.
Каталог загружает публичный контракт `data/catalog/catalog.json` из
`DeferW/ssmc-wiki-data` и не использует технический `index.json`.

Для локального источника данных можно определить:

```bash
VITE_CATALOG_DATA_ROOT=http://localhost:8080/data/catalog/
```

Значение обязано оканчиваться `/`.

## Команды

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
```

Административная зона пока не подключена к маршрутам. Требования к её будущей
защите описаны в `src/admin/README.md`.
