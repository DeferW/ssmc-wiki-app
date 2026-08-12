import { Link } from "react-router-dom";
import { modules } from "../constants";

export function Home() {
  return (
    <main className="home-page">
      <video className="home-video" autoPlay muted loop playsInline aria-hidden="true">
        <source src={`${import.meta.env.BASE_URL}background-animation.webm`} type="video/webm" />
      </video>
      <div className="home-shade" aria-hidden="true" />
      <div className="page home-content">
        <section className="intro">
          <p className="eyebrow">USCM // SECURE DATABASE NODE</p>
          <h1>СИСТЕМА ПОЛЕВОЙ СПРАВКИ</h1>
          <p>Каталоги, расчёты, сравнения и конструкторы — всё, чему тесно внутри MediaWiki.</p>
        </section>
        <section className="module-grid" aria-label="Разделы приложения">
          {modules.map((module) => {
            const href = module.slug === "equipment" ? "/equipment" : `/tool/${module.slug}`;
            return (
              <Link className="module-card" to={href} key={module.slug}>
                {module.status && <span className="status">{module.status}</span>}
                <h2>{module.title}</h2>
                <p>{module.text}</p>
                <span className="card-link">[ ОТКРЫТЬ МОДУЛЬ ]</span>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
