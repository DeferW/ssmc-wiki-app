import { Link } from "react-router-dom";
import type { ModuleDefinition } from "../modules/registry";
import { MAIN_PATH } from "../routes";

export function PlaceholderPage({ module }: { module: ModuleDefinition }) {
  return (
    <main className="page placeholder-page">
      <p className="eyebrow">MODULE SLOT // {module.code}</p>
      <h1>{module.title}</h1>
      <p>{module.summary}</p>
      <div className="placeholder-box">
        <strong>Слот модуля зарезервирован</strong>
        <span>Данный модуль находится в разработке.</span>
      </div>
      <Link className="button-link" to={MAIN_PATH}>← Вернуться на главную</Link>
    </main>
  );
}
