import { create } from 'zustand';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import type { Locale as AntdLocale } from 'antd/lib/locale';
import i18n, { type LangCode, readStoredLang, persistLang } from '@/i18n';

interface LocaleState {
  lang: LangCode;
  antdLocale: AntdLocale;
  setLang: (code: LangCode) => void;
  toggle: () => void;
}

function antdFor(code: LangCode): AntdLocale {
  return code === 'en' ? enUS : zhCN;
}

function applySideEffects(code: LangCode) {
  i18n.changeLanguage(code);
  dayjs.locale(code === 'en' ? 'en' : 'zh-cn');
  persistLang(code);
}

const initialLang = readStoredLang();
applySideEffects(initialLang);

export const useLocaleStore = create<LocaleState>((set, get) => ({
  lang: initialLang,
  antdLocale: antdFor(initialLang),
  setLang: (code) => {
    if (code === get().lang) return;
    applySideEffects(code);
    set({ lang: code, antdLocale: antdFor(code) });
  },
  toggle: () => get().setLang(get().lang === 'zh' ? 'en' : 'zh'),
}));
