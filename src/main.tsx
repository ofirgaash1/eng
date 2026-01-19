import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import "./index.css";

const rawBase = import.meta.env.BASE_URL ?? "/";
const resolvedBase = new URL(rawBase, window.location.href).pathname;
const basename =
  resolvedBase.length > 1 && resolvedBase.endsWith("/")
    ? resolvedBase.slice(0, -1)
    : resolvedBase;

const redirectPath = new URLSearchParams(window.location.search).get("path");
if (redirectPath) {
  const decodedPath = decodeURIComponent(redirectPath);
  const basePrefix = basename === "/" ? "" : basename;
  const normalizedPath = decodedPath.startsWith(basePrefix)
    ? decodedPath.slice(basePrefix.length) || "/"
    : decodedPath;
  window.history.replaceState(null, "", `${basename}${normalizedPath}`);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
