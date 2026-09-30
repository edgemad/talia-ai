import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, loadTheme } from "./lib/themes";

applyTheme(loadTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline-capable app shell.
// Skip under the Tauri desktop shell: the webview gets navigated to the
// sidecar at http://localhost:8787, so a tauri://-scoped SW is dead weight.
if ("serviceWorker" in navigator && location.protocol !== "tauri:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* dev servers without SW support — app still works online */
    });
  });
}
