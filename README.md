# SSMC Wiki

SSMC Wiki — неофициальная модульная база данных и набор веб-инструментов для
**Space Stories Marine Corps**. [`ssmc-wiki-data`](https://github.com/DeferW/ssmc-wiki-data)
собирает данные из исходников игры, а этот репозиторий публикует сайт и работает
с готовыми контрактами.

- [Планы и TODO](https://github.com/DeferW/ssmc-wiki-app/blob/main/docs/ROADMAP.md)
- [Руководство контрибьютора](https://github.com/DeferW/ssmc-wiki-app/blob/main/docs/CONTRIBUTOR_GUIDE.md)

## Архитектура

```text
ssmc-wiki-data/data
        ↓ точная замена при deploy
public/data → dist/data
        ↓
config + loader + types → логика → UI модуля
        ↓
router + registry → пользователь
```

```text
src/modules/<module-id>/   изолированные модули
src/modules/registry.tsx   метаданные и маршруты модулей
src/data/                  общая граница загрузки данных
src/pages/                 общие страницы
src/admin/                 административная граница
src/styles/                общие и адаптивные стили
public/                    статические файлы и deploy-снимок data
```

Модуль создаётся в `src/modules/<module-id>/`, регистрируется с маршрутом
`/module/<module-id>` и самостоятельно владеет типами, проверкой контракта,
вычислениями, состоянием и интерфейсом. Сайт не разбирает игровые YAML и не
использует внутренние отчёты сборщика.

Deploy загружает `data/` из `ssmc-wiki-data`, полностью заменяет им
`public/data/`, собирает приложение и публикует единый GitHub Pages-артефакт.
Пользователь получает JSON и ассеты с того же адреса, что и сайт; `public/data/`
не редактируется и не коммитится вручную.
