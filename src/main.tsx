import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles/base.css";
import "./styles/home.css";
import "./styles/project.css";
import "./styles/equipment.css";
import "./styles/chemistry.css";
import "./styles/damage.css";
import "./styles/maps.css";
import "./styles/responsive.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
