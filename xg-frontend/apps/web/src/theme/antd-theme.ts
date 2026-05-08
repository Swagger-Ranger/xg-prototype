import type { ThemeConfig } from 'antd';

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: '#6366f1',
    colorSuccess: '#059669',
    colorWarning: '#b45309',
    colorError: '#dc2626',
    colorInfo: '#0891b2',
    borderRadius: 8,
    fontFamily: "'Geist', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    fontSize: 13,
    lineHeight: 1.55,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f6f7fa',
    colorBorder: 'rgba(15,23,42,0.09)',
    colorBorderSecondary: 'rgba(15,23,42,0.06)',
    colorText: '#0f172a',
    colorTextSecondary: '#334155',
    colorTextTertiary: '#64748b',
    colorTextQuaternary: '#94a3b8',
    boxShadow: '0 2px 4px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.03)',
    boxShadowSecondary: '0 6px 16px -4px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
  },
  components: {
    Button: {
      primaryShadow: '0 2px 8px rgba(99,102,241,0.35)',
    },
    Table: {
      headerBg: '#f6f7fa',
      rowHoverBg: '#f1f3f7',
      cellPaddingBlockMD: 14,
      cellPaddingInlineMD: 16,
    },
    Card: {
      borderRadiusLG: 10,
    },
    Input: {
      borderRadius: 8,
    },
    Menu: {
      itemBg: 'transparent',
    },
  },
};
