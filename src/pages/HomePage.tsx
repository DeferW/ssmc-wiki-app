import { Link } from "react-router-dom";
import { modules } from "../modules/registry";

export function HomePage() {
  return (
    <main className="home-page">
      <video className="home-video" autoPlay muted loop playsInline disablePictureInPicture disableRemotePlayback aria-hidden="true">
        <source src={`${import.meta.env.BASE_URL}background-animation.webm`} type="video/webm" />
      </video>
      <div className="home-shade" aria-hidden="true" />
      <div className="home-content">
        <section className="home-intro">
          <p className="eyebrow">USCM // SECURE DATABASE NODE</p>
          <h1>Система полевой справки</h1>
          <p>Каталоги, расчёты и конструкторы для личного состава Space Stories Marine Corps.</p>
        </section>

        <section className="module-grid" aria-label="Модули базы данных">
          {modules.map((module, index) => (
            <Link className={`module-card is-${module.status}`} to={module.path} key={module.id}>
              <span className="module-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="module-code">{module.code}</span>
              {module.status === "planned" && <span className="status">В разработке</span>}
              <h2>{module.title}</h2>
              <p>{module.summary}</p>
              <span className="module-action">
                [ ОТКРЫТЬ МОДУЛЬ ]
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
