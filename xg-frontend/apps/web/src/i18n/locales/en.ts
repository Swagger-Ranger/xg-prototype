import type { LocaleResource } from './zh';

const en: LocaleResource = {
  app: {
    // Brand name stays Chinese-only by product decision; English locale just
    // mirrors it so the chrome doesn't fall back to the i18n key.
    name: '朝夕',
    tagline: 'AI-native student-affairs platform',
  },
  topbar: {
    unreadSuffix: 'unread',
    profile: 'Profile',
    logout: 'Sign out',
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
    care: 'Care',
    crisis: 'Crisis',
  },
  login: {
    quickLoginHint: 'Pick an account to sign in (password: {{password}})',
    successAs: 'Signed in as {{name}} ({{role}})',
    failureFallback: 'Sign-in failed',
  },
};

export default en;
