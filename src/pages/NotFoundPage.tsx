import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="page placeholder-page">
      <p className="eyebrow">ERROR // 404</p>
      <h1>Узел не найден</h1>
      <p>Запрошенного раздела нет в текущей конфигурации базы.</p>
      <Link className="button-link" to="/">← На главную</Link>
    </main>
  );
}
