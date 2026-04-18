export const tokens = {
  color: {
    primary: {
      base: '#6366f1',
      hover: '#4f46e5',
      light: '#818cf8',
      deep: '#4338ca',
      bg: 'rgba(99,102,241,0.07)',
      bg2: 'rgba(99,102,241,0.13)',
      ring: 'rgba(99,102,241,0.28)',
      glow: 'rgba(99,102,241,0.30)',
    },
    secondary: {
      base: '#0891b2',
      hover: '#0e7490',
      light: '#22d3ee',
      bg: 'rgba(8,145,178,0.09)',
      ring: 'rgba(8,145,178,0.25)',
      glow: 'rgba(8,145,178,0.3)',
    },
    status: {
      ok: '#059669',
      okBg: 'rgba(5,150,105,0.08)',
      okRing: 'rgba(5,150,105,0.25)',
      warn: '#b45309',
      warnBg: 'rgba(217,119,6,0.10)',
      warnRing: 'rgba(217,119,6,0.28)',
      danger: '#dc2626',
      dangerBg: 'rgba(220,38,38,0.08)',
      dangerRing: 'rgba(220,38,38,0.25)',
    },
    // Mobile-specific status colors (slightly different from web)
    statusMobile: {
      green: '#10b981',
      greenDark: '#059669',
      greenBg: 'rgba(16,185,129,0.1)',
      yellow: '#f59e0b',
      yellowBg: 'rgba(245,158,11,0.1)',
      red: '#ef4444',
      redBg: 'rgba(239,68,68,0.1)',
      orange: '#f97316',
      orangeBg: 'rgba(249,115,22,0.1)',
    },
    surface: {
      bg0: '#eceff4',
      bg1: '#f6f7fa',
      bg2: '#ffffff',
      bg3: '#f1f3f7',
      bg4: '#e6e9f0',
    },
    surfaceMobile: {
      bg: '#f5f3ff',
      white: '#ffffff',
      surface: '#f8fafc',
      surface2: '#f1f5f9',
    },
    text: {
      primary: '#0f172a',
      secondary: '#334155',
      tertiary: '#64748b',
      muted: '#94a3b8',
      faint: '#cbd5e1',
    },
    textMobile: {
      primary: '#1e1b4b',
      secondary: '#4b5563',
      muted: '#9ca3af',
    },
    border: {
      base: 'rgba(15,23,42,0.06)',
      medium: 'rgba(15,23,42,0.09)',
      strong: 'rgba(15,23,42,0.14)',
    },
    borderMobile: {
      base: 'rgba(99,102,241,0.12)',
      light: 'rgba(0,0,0,0.055)',
    },
  },

  radius: {
    web: { xs: '3px', sm: '6px', base: '8px', lg: '10px', xl: '14px' },
    mini: { base: '12px', lg: '16px', xl: '20px' },
  },

  shadow: {
    web: {
      xs: '0 1px 0 rgba(15,23,42,0.03)',
      sm: '0 1px 2px rgba(15,23,42,0.05), 0 1px 0 rgba(15,23,42,0.02)',
      base: '0 2px 4px rgba(15,23,42,0.05), 0 1px 2px rgba(15,23,42,0.03)',
      md: '0 6px 16px -4px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
      lg: '0 14px 36px -10px rgba(15,23,42,0.14), 0 4px 10px rgba(15,23,42,0.04)',
    },
    mini: {
      xs: '0 1px 2px rgba(15,23,42,0.04)',
      sm: '0 2px 6px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
      md: '0 4px 14px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
      lg: '0 8px 24px rgba(15,23,42,0.10), 0 3px 8px rgba(15,23,42,0.06)',
      primary: '0 4px 18px rgba(99,102,241,0.28), 0 1px 4px rgba(99,102,241,0.14)',
      green: '0 4px 14px rgba(16,185,129,0.32), 0 1px 4px rgba(16,185,129,0.12)',
      orange: '0 4px 14px rgba(249,115,22,0.28), 0 1px 4px rgba(249,115,22,0.10)',
      red: '0 4px 12px rgba(239,68,68,0.22)',
    },
  },

  font: {
    sans: "'Geist', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    mono: "'Geist Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  },

  typography: {
    baseSize: '13px',
    lineHeight: '1.55',
    letterSpacing: '-0.005em',
    fontFeatureSettings: "'cv11', 'ss01', 'ss03'",
  },

  layout: {
    aiPanelWidth: '408px',
    navRailWidth: '56px',
    topBarHeight: '54px',
  },

  animation: {
    ease: 'cubic-bezier(0.32, 0.72, 0, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const;

export type DesignTokens = typeof tokens;
