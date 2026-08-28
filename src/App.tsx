import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectPage } from "./pages/ProjectPage";
import { activeModules, plannedModules } from "./modules/registry";
import { AdminEquipmentPage } from "./admin/equipment/AdminEquipmentPage";
import { ABOUT_PATH, EQUIPMENT_ADMIN_PATH, MAIN_PATH } from "./routes";

export default function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to={MAIN_PATH} aria-label="SSMC Tactical Database">
          <span className="brand-mark" aria-hidden="true">&gt;_</span>
          <span>SSMC Tactical Database</span>
        </Link>
        <nav aria-label="Основная навигация">
          <NavLink to={MAIN_PATH}>Главная</NavLink>
          <NavLink to={ABOUT_PATH}>Проект</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to={MAIN_PATH} replace />} />
        <Route path={MAIN_PATH} element={<HomePage />} />
        <Route path={ABOUT_PATH} element={<ProjectPage />} />
        {activeModules.map((module) => (
          <Route path={module.path} element={<module.Component />} key={module.id} />
        ))}
        {plannedModules.map((module) => (
          <Route path={module.path} element={<PlaceholderPage module={module} />} key={module.id} />
        ))}
        <Route path={EQUIPMENT_ADMIN_PATH} element={<AdminEquipmentPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
