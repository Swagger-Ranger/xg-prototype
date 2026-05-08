import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import App from './App';
import './i18n';
import { useLocaleStore } from './stores/locale.store';
import { AntdAppBridge } from './utils/antdApp';

import { antdTheme } from './theme/antd-theme';
import './theme/global.css';

function RootProviders({ children }: { children: React.ReactNode }) {
  const antdLocale = useLocaleStore((s) => s.antdLocale);
  // <AntdApp> 提供 App.useApp() 上下文；<AntdAppBridge> 把 hook 实例捕到
  // 模块级 ref，凡 `import { message } from '@/utils/antdApp'` 的调用都走
  // 上下文里的实例，而不是 antd 的静态 API（静态 API 才触发 v5 的
  // "Static function can not consume context" 警告）。
  return (
    <ConfigProvider locale={antdLocale} theme={antdTheme}>
      <AntdApp>
        <AntdAppBridge />
        {children}
      </AntdApp>
    </ConfigProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RootProviders>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </RootProviders>
    </QueryClientProvider>
  </React.StrictMode>,
);
