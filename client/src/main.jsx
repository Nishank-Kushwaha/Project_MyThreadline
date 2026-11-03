import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./app/App.jsx";
import { registerServiceWorker } from "@/features/notifications/lib/notifications";
import { applyTheme } from "@/lib/themes";

applyTheme(localStorage.getItem("theme") || "system");
registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
