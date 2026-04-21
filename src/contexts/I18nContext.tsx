import React, { createContext, useContext, useState, useEffect } from 'react';
import en from '../locales/en.json';
import ru from '../locales/ru.json';

type Language = 'en' | 'ru';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string) => string;
}

const translations: Record<Language, any> = { en, ru };

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('securenet_lang');
    return (saved as Language) || 'ru';
  });

  useEffect(() => {
    localStorage.setItem('securenet_lang', language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (path: string): string => {
    const keys = path.split('.');
    let value = translations[language];
    
    for (const key of keys) {
      if (value[key] === undefined) {
        console.warn(`[i18n] Translation missing for: ${path}`);
        return path;
      }
      value = value[key];
    }
    
    return value;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
};
