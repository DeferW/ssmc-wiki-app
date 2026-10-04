import { Fragment } from "react";
import changelogSource from "../../CHANGELOG.md?raw";
import { parseChangelog, pendingRelease } from "./changelog";

const CHANGELOG_URL = "https://github.com/DeferW/ssmc-wiki-app/blob/main/CHANGELOG.md";
const SHOWN_RELEASES = 3;
const changeNotes = import.meta.glob<string>("../../.changes/*.md", { query: "?raw", import: "default", eager: true });
const pending = pendingRelease(changeNotes, __APP_VERSION__);
const changelog = [
  ...(pending ? [pending] : []),
  ...parseChangelog(changelogSource).filter((entry) => entry.version).slice(0, SHOWN_RELEASES),
];

/** Renders `code` spans; the changelog uses no other inline Markdown. */
function inlineText(text: string) {
  return text.split("`").map((part, index) => (
    index % 2 ? <code key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>
  ));
}

const repositories = [
  {
    code: "DATA",
    title: "Сборщик данных",
    description: "Извлекает игровые данные и готовит каталоги для модулей сайта.",
    url: "https://github.com/DeferW/ssmc-wiki-data",
  },
  {
    code: "APP",
    title: "Веб-приложение",
    description: "Показывает каталоги, расчёты и остальные пользовательские инструменты.",
    url: "https://github.com/DeferW/ssmc-wiki-app",
  },
];

export function ProjectPage() {
  return (
    <main className="project-page">
      <section className="project-hero">
        <div>
          <p className="eyebrow">SSMC // PROJECT INFO</p>
          <h1>О проекте</h1>
          <p className="project-lead">
            SSMC Tactical Database — неофициальный веб-инструмент для игроков
            Space Stories Marine Corps: справочники, планировщики и расчёты в одном месте.
          </p>
        </div>
        <div className="project-status" aria-label="Статус проекта">
          <span>STATUS</span>
          <strong>RELEASE {__APP_VERSION__}</strong>
          <small>Проект в режиме поддержки{__APP_COMMIT__ && <> · сборка <code>{__APP_COMMIT__}</code></>}</small>
        </div>
      </section>

      <section className="project-overview" aria-label="Кратко о проекте">
        <article>
          <span>01 // КОМАНДА</span>
          <h2>Defer + Mechanica</h2>
          <p>Поддерживаем данные и сайт актуальными, исправляем найденные ошибки.</p>
        </article>
        <article>
          <span>02 // СТАТУС</span>
          <h2>Режим поддержки</h2>
          <p>Основные идеи воплощены. В дальнейшем возможны обновления и новые полезные модули.</p>
        </article>
      </section>

      <section className="project-changelog" aria-labelledby="project-changelog-title">
        <header>
          <p className="eyebrow">CHANGELOG</p>
          <h2 id="project-changelog-title">Что нового</h2>
        </header>
        <div>
          {changelog.map((entry, index) => (
            <details key={entry.version ?? "unreleased"} open={index === 0 || (index === 1 && !changelog[0].version)}>
              <summary>
                <strong>{entry.version ?? "Не выпущено"}</strong>
                <span>{entry.version ? entry.date : `уже на сайте, войдёт в ${entry.nextVersion}`}</span>
              </summary>
              {entry.intro && <p>{inlineText(entry.intro)}</p>}
              {entry.items.length > 0 && <ul>{entry.items.map((item) => <li key={item}>{inlineText(item)}</li>)}</ul>}
            </details>
          ))}
        </div>
        <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">[ ПОЛНЫЙ ЖУРНАЛ НА GITHUB ↗ ]</a>
      </section>

      <section className="project-repositories">
        <header>
          <p className="eyebrow">SOURCE ACCESS</p>
          <h2>Репозитории проекта</h2>
        </header>
        <div>
          {repositories.map((repository) => (
            <a href={repository.url} target="_blank" rel="noreferrer" key={repository.code}>
              <span>{repository.code}</span>
              <h3>{repository.title}</h3>
              <p>{repository.description}</p>
              <strong>[ ОТКРЫТЬ НА GITHUB ↗ ]</strong>
            </a>
          ))}
        </div>
      </section>

      <aside className="project-contact">
        <div>
          <span>FEEDBACK CHANNEL</span>
          <h2>Нашли баг или есть предложение?</h2>
          <p>Свободно пишите в группе Discord проекта SSMC или лично Defer.</p>
        </div>
        <code>discord // defer2.0</code>
      </aside>
    </main>
  );
}
