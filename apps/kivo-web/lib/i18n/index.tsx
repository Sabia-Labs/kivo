"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { en } from "./en";
import { zh } from "./zh";
import type { Dictionary } from "./en";

export type Language = "en" | "zh";

const dictionaries: Record<Language, Dictionary> = { en, zh };

const STORAGE_KEY = "kivo-lang";

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: en,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && stored in dictionaries) {
      setLangState(stored);
    }
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: dictionaries[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}

export const languages: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];
