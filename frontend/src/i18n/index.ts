import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./zh.json";
import en from "./en.json";

const savedLang = localStorage.getItem("rpccall-lang") || "zh";

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: savedLang,
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

export default i18n;
