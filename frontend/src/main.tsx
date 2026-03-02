import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";

const disableAutocomplete = () => {
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((el) => {
    const type = el.getAttribute("type");
    if (type === "number" || type === "checkbox" || type === "radio" || type === "range" || type === "password") return;
    if (el.getAttribute("autocomplete") !== "nope") {
      el.setAttribute("autocomplete", "nope");
      el.setAttribute("data-form-type", "other");
      el.setAttribute("data-lpignore", "true");
    }
  });
};
const observer = new MutationObserver(disableAutocomplete);
observer.observe(document.body, { childList: true, subtree: true });
disableAutocomplete();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
