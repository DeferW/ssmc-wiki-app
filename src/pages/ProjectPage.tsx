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
          <strong>WORK IN PROGRESS</strong>
          <small>Проект активно развивается</small>
        </div>
      </section>

      <section className="project-overview" aria-label="Кратко о проекте">
        <article>
          <span>01 // КОМАНДА</span>
          <h2>Defer + Mechanica</h2>
          <p>Поддерживаем данные, сайт и постепенно добавляем новые модули.</p>
        </article>
        <article>
          <span>02 // СТАТУС</span>
          <h2>Открытая разработка</h2>
          <p>Проект ещё не закончен. Исправления, идеи и помощь приветствуются.</p>
        </article>
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
