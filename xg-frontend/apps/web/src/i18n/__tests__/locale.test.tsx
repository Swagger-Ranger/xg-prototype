import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import '@/i18n';
import { useLocaleStore } from '@/stores/locale.store';

function Probe() {
  const { t } = useTranslation();
  return (
    <>
      <span data-testid="home">{t('topbar.homeCrumb')}</span>
      <span data-testid="logout">{t('topbar.logout')}</span>
    </>
  );
}

describe('locale store + i18next wiring', () => {
  beforeEach(() => {
    // ensure each test starts at zh
    useLocaleStore.getState().setLang('zh');
  });

  it('renders zh strings by default', () => {
    render(<Probe />);
    expect(screen.getByTestId('home').textContent).toBe('学工管理');
    expect(screen.getByTestId('logout').textContent).toBe('退出登录');
    expect(useLocaleStore.getState().antdLocale).toBe(zhCN);
  });

  it('toggle() flips to en, swaps antd locale, and re-renders strings', () => {
    const { rerender } = render(<Probe />);
    useLocaleStore.getState().toggle();
    rerender(<Probe />);
    expect(screen.getByTestId('home').textContent).toBe('Student Affairs');
    expect(screen.getByTestId('logout').textContent).toBe('Sign out');
    expect(useLocaleStore.getState().antdLocale).toBe(enUS);
    expect(useLocaleStore.getState().lang).toBe('en');
  });

  it('setLang persists choice to localStorage', () => {
    useLocaleStore.getState().setLang('en');
    expect(window.localStorage.getItem('xg_lang')).toBe('en');
    useLocaleStore.getState().setLang('zh');
    expect(window.localStorage.getItem('xg_lang')).toBe('zh');
  });

  it('setLang to the same value is a no-op (does not re-emit)', () => {
    let count = 0;
    const unsub = useLocaleStore.subscribe(() => count++);
    useLocaleStore.getState().setLang('zh'); // already zh from beforeEach
    unsub();
    expect(count).toBe(0);
  });
});
