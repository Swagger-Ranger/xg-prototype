import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh';
import en from './locales/en';

export type LangCode = 'zh' | 'en';

export const SUPPORTED_LANGS: LangCode[] = ['zh', 'en'];

const STORED_KEY = 'xg_lang';

export function readStoredLang(): LangCode {
  try {
    const v = localStorage.getItem(STORED_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {}
  return 'zh';
}

export function persistLang(code: LangCode) {
  try {
    localStorage.setItem(STORED_KEY, code);
  } catch {}
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: readStoredLang(),
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

export default i18n;
