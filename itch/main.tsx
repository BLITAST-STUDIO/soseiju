import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Game } from "../src/components/Game";
import "../src/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root missing");

createRoot(root).render(
  <StrictMode>
    <Game />
  </StrictMode>,
);
