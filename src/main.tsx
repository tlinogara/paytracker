import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./enhancer-layout.css";
import "./commission-page.css";
import "./commission-rate.css";
import "./calculation-rules.css";
import "./admin-access.css";
import "./commission-audit-sort";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
