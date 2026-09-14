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
import "./styles/controls.css";
import "./styles/damage-layout.css";

// Canvas caches label bitmaps: load its fonts before the first map render.
void Promise.allSettled([
  document.fonts.load('400 16px "IBM Plex Mono"', 'Карта Map'),
  document.fonts.load('700 17px "IBM Plex Mono"', 'Карта Map'),
]).then(() => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
));
