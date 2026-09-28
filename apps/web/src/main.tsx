import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/500.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "../../../opendesign/design-systems/franchise-procurement/tokens/colors_and_type.css";
import "./styles.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
