import { Link, NavLink, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectPage } from "./pages/ProjectPage";
import { activeModules, plannedModules } from "./modules/registry";
import { AdminEquipmentPage } from "./admin/equipment/AdminEquipmentPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="SSMC Tactical Database">
          <span className="brand-mark" aria-hidden="true">&gt;_</span>
          <span>SSMC Tactical Database</span>
        </Link>
        <nav aria-label="Основная навигация">
          <NavLink to="/" end>Главная</NavLink>
          <NavLink to="/project">Проект</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/project" element={<ProjectPage />} />
        {activeModules.map((module) => (
          <Route path={module.path} element={<module.Component />} key={module.id} />
        ))}
        {plannedModules.map((module) => (
          <Route path={module.path} element={<PlaceholderPage module={module} />} key={module.id} />
        ))}
        <Route path="/equipment/admin" element={<AdminEquipmentPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
