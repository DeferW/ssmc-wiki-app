import { Link } from "react-router-dom";

export function NotFound() {
  return <main className="page placeholder-page"><h1>Такого раздела пока нет</h1><Link className="button-link" to="/">Вернуться на главную</Link></main>;
}
