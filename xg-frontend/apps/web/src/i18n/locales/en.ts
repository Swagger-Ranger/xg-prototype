import type { LocaleResource } from './zh';

const en: LocaleResource = {
  app: {
    name: 'Student Affairs',
    tagline: 'AI-native student-affairs platform',
  },
  topbar: {
    homeCrumb: 'Student Affairs',
    searchPlaceholder: 'Search students, leaves, notifications…',
    unreadSuffix: 'unread',
    profile: 'Profile',
    logout: 'Sign out',
    profileSoon: 'Profile settings — coming soon',
    searchSoon: 'Global search — coming soon',
    languageZh: '中文',
    languageEn: 'English',
    languageToggleAria: 'Switch language',
  },
  routes: {
    workspace: 'Workspace',
    leave: 'Leave',
    collection: 'Collection',
    checkin: 'Check-in',
    notification: 'Notifications',
    student: 'Students',
    workLog: 'Work log',
    violation: 'Discipline',
    alerts: 'Alerts',
    workStudy: 'Work-study',
    system: 'System',
    knowledge: 'Knowledge',
  },
  login: {
    quickLoginHint: 'Pick an account to sign in (password: {{password}})',
    successAs: 'Signed in as {{name}} ({{role}})',
    failureFallback: 'Sign-in failed',
  },
};

export default en;
