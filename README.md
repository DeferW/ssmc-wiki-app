# SSMC Wiki

SSMC Wiki — неофициальная модульная база данных и набор веб-инструментов для
**Space Stories Marine Corps**. Проект состоит из двух репозиториев:
[`ssmc-wiki-data`](https://github.com/DeferW/ssmc-wiki-data) собирает данные из
исходников игры, а [`ssmc-wiki-app`](https://github.com/DeferW/ssmc-wiki-app)
публикует сайт и работает с готовыми контрактами.

- [Планы и TODO](https://github.com/DeferW/ssmc-wiki-app/blob/main/docs/ROADMAP.md)
- [Руководство контрибьютора](https://github.com/DeferW/ssmc-wiki-app/blob/main/docs/CONTRIBUTOR_GUIDE.md)

## Роль репозитория

`ssmc-wiki-app` — клиентское React-приложение. Оно загружает опубликованные JSON
и ассеты, проверяет поддерживаемую версию схемы, выполняет пользовательские
расчёты и отображает независимые модули. Приложение не разбирает игровые YAML,
локализацию или внутренние отчёты сборщика.

## Общая архитектура

```text
исходники игры + config
            ↓
ssmc-wiki-data/scripts/<module>
read → resolve → normalize → validate → publish
            ↓
ssmc-wiki-data/data/<module-id>
публичный JSON-контракт + ассеты
            ↓ точная замена при deploy
ssmc-wiki-app/public/data + config/catalog-overrides.json
            ↓ npm run data:overrides
          dist/data
            ↓
loader + types → логика модуля → UI
            ↓
GitHub Pages → пользователь
```

`data/<module-id>/` — граница между репозиториями. При deploy приложения свежий
`data/` полностью заменяет `public/data/`, затем приложение применяет свой
`config/catalog-overrides.json`; поэтому редакторские решения не меняют данные
сборщика, а удалённые сборщиком файлы не остаются в публикации. Браузер получает сайт, JSON и ассеты с одного GitHub
Pages-адреса и не обращается к GitHub Raw при открытии обычных модулей.
Административная запись выполняется отдельно через серверный Worker, который
читает текущий файл и его SHA авторизованным GitHub token.

## Архитектура приложения

```text
src/modules/<module-id>/   изолированные модули и их предметная логика
src/modules/registry.tsx   метаданные, статусы и маршруты модулей
src/data/                  общая граница загрузки данных
src/pages/                 общие страницы приложения
src/admin/                 административная граница
src/styles/                общие, модульные и адаптивные стили
public/                    статические файлы и deploy-снимок data
config/                    редакторские overrides приложения
scripts/                   подготовка deploy-снимка данных
.github/workflows/         проверки, сборка и публикация Pages
```

Модуль создаётся в `src/modules/<module-id>/` и регистрируется с маршрутом
`/module/<module-id>`. Он самостоятельно владеет типами публичного контракта,
загрузкой, проверкой `schemaVersion`, вычислениями, состоянием, компонентами и
тестами. Registry и общая оболочка только подключают модуль.

## Контракт и изменения

Если интерфейсу не хватает игровой характеристики, она сначала добавляется в
публичный контракт `ssmc-wiki-data`, затем поддерживается приложением. Generated
JSON не импортируется в JavaScript bundle и не редактируется вручную.
Единственное редакторское наложение каталога хранится в
`config/catalog-overrides.json` и применяется только к deploy-снимку.

Ломающее изменение типа, структуры или смысла поля получает новую
`schemaVersion`. Сначала публикуется совместимый набор данных, затем приложение,
которое умеет его читать. Подробные правила находятся в руководстве
контрибьютора.

## Локальная проверка

Требуются Node.js 22 и npm.

```powershell
npm ci
npm run dev
```

Перед pull request:

```powershell
npm run lint
npm run test
npm run build
```

Для проверки с реальными данными нужен одноразовый `public/data/` из соседнего
`ssmc-wiki-data/data/` либо локальный HTTP-сервер и соответствующий
`VITE_<MODULE>_DATA_ROOT`. `public/data/` игнорируется Git и не является
источником истины. После копирования снимка выполните `npm run data:overrides`.
