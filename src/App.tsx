import { Link, NavLink, Route, Routes } from "react-router-dom";
import { AdminEquipment, Equipment } from "./components/Equipment";
import { Home } from "./components/Home";
import { NotFound } from "./components/NotFound";
import { ToolPlaceholder } from "./components/ToolPlaceholder";

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/">SSMC Wiki App</Link>
        <nav aria-label="Основная навигация">
          <NavLink to="/" end>Главная</NavLink>
          <NavLink to="/equipment">Снаряжение</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/equipment/admin" element={<AdminEquipment />} />
        <Route path="/tool/:slug" element={<ToolPlaceholder />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default App;
