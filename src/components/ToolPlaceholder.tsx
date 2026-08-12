import { Link, useParams } from "react-router-dom";
import { modules } from "../constants";
import { NotFound } from "./NotFound";

export function ToolPlaceholder() {
  const { slug } = useParams();
  const tool = modules.find((item) => item.slug === slug);
  if (!tool) return <NotFound />;
  return (
    <main className="page placeholder-page">
      <p className="eyebrow">Макет раздела</p>
      <h1>{tool.title}</h1>
      <p>{tool.text}</p>
      <div className="placeholder-box">Этот инструмент ещё не собран.</div>
      <Link className="button-link" to="/">← Вернуться на главную</Link>
    </main>
  );
}
