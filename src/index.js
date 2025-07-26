import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css"; // ✅ Make sure this line is here

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
