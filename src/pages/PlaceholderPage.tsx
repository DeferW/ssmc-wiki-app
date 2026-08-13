import { Link, useParams } from "react-router-dom";
import { modules } from "../modules/registry";
import { NotFoundPage } from "./NotFoundPage";

export function PlaceholderPage() {
  const { moduleId } = useParams();
  const module = modules.find((candidate) => candidate.id === moduleId);
  if (!module) return <NotFoundPage />;

  return (
    <main className="page placeholder-page">
      <p className="eyebrow">MODULE SLOT // {module.code}</p>
      <h1>{module.title}</h1>
      <p>{module.summary}</p>
      <div className="placeholder-box">
        <strong>Слот модуля зарезервирован</strong>
        <span>Его интерфейс и данные будут подключены независимо от каталога снаряжения.</span>
      </div>
      <Link className="button-link" to="/">← Вернуться на главную</Link>
    </main>
  );
}
