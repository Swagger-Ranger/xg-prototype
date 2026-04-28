import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import App from './App';
import './i18n';
import { useLocaleStore } from './stores/locale.store';

import { antdTheme } from './theme/antd-theme';
import './theme/global.css';

function RootProviders({ children }: { children: React.ReactNode }) {
  const antdLocale = useLocaleStore((s) => s.antdLocale);
  return (
    <ConfigProvider locale={antdLocale} theme={antdTheme}>
      {children}
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
