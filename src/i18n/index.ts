import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./en";
import vi from "./vi";

// Vietnamese by default; the choice is cached in localStorage by the detector.
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { vi: { translation: vi }, en: { translation: en } },
    supportedLngs: ["vi", "en"],
    nonExplicitSupportedLngs: true,
    fallbackLng: "vi",
    detection: { order: ["localStorage"], lookupLocalStorage: "dc-lang", caches: ["localStorage"] },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.resolvedLanguage ?? "vi";

export default i18n;
