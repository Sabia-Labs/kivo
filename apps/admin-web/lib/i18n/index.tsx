"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { en } from "./en";
import { zh } from "./zh";
import { pt } from "./pt";
import type { Dictionary } from "./en";

export type Language = "en" | "zh" | "pt";

const dictionaries: Record<Language, Dictionary> = { en, zh, pt };

const STORAGE_KEY = "kivo-lang";

/**
 * Sets a cookie on the base domain to share state between planes (admin and app)
 */
function setLanguageCookie(l: Language) {
  if (typeof document === "undefined") return;
  
  // Try to set on base domain (e.g., .kivo.ai) to share between subdomains
  const domain = window.location.hostname.split('.').slice(-2).join('.');
  const cookieValue = `kivo_lang=${l}; path=/; domain=.${domain}; max-age=${60*60*24*365}; SameSite=Lax`;
  document.cookie = cookieValue;
  
  // Also set on current domain as fallback
  document.cookie = `kivo_lang=${l}; path=/; max-age=${60*60*24*365}; SameSite=Lax`;
}

function getLanguageFromCookie(): Language | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/kivo_lang=([^;]+)/);
  return (match?.[1] as Language) || null;
}

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
    // 1. Try Cookie (shared between planes)
    // 2. Try LocalStorage (local plane)
    // 3. Try Browser Navigator
    const cookieLang = getLanguageFromCookie();
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    const browserLang = typeof navigator !== "undefined" ? (navigator.language.split("-")[0] as any) : "en";
    
    const finalLang = (cookieLang && cookieLang in dictionaries) ? cookieLang :
                     (stored && stored in dictionaries) ? stored :
                     (browserLang in dictionaries) ? browserLang : "en";
    
    setLangState(finalLang);
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    setLanguageCookie(l);
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
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];
