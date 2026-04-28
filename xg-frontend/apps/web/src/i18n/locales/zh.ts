// Chrome strings only (top bar, login). Page bodies stay zh until i18n
// expansion follows. Keys are dotted paths grouped by surface.
export interface LocaleResource {
  app: { name: string; tagline: string };
  topbar: {
    homeCrumb: string;
    searchPlaceholder: string;
    unreadSuffix: string;
    profile: string;
    logout: string;
    profileSoon: string;
    searchSoon: string;
    languageZh: string;
    languageEn: string;
    languageToggleAria: string;
  };
  routes: {
    workspace: string; leave: string; collection: string; checkin: string;
    notification: string; student: string; workLog: string; violation: string;
    alerts: string; workStudy: string; system: string; knowledge: string;
  };
  login: {
    quickLoginHint: string;
    successAs: string;
    failureFallback: string;
  };
}

const zh: LocaleResource = {
  app: {
    name: '学工管理系统',
    tagline: 'AI 原生学生工作服务平台',
  },
  topbar: {
    homeCrumb: '学工管理',
    searchPlaceholder: '搜索学生、请假单、通知…',
    unreadSuffix: '条未读',
    profile: '个人设置',
    logout: '退出登录',
    profileSoon: '个人设置功能即将上线',
    searchSoon: '全局搜索即将上线',
    languageZh: '中文',
    languageEn: 'English',
    languageToggleAria: '切换语言',
  },
  routes: {
    workspace: '工作台',
    leave: '请销假',
    collection: '信息收集',
    checkin: '签到',
    notification: '通知任务',
    student: '学生信息库',
    workLog: '工作日志',
    violation: '违纪处分',
    alerts: '异常预警',
    workStudy: '勤工助学',
    system: '系统管理',
    knowledge: '知识问答',
  },
  login: {
    quickLoginHint: '选择账号快速登录（密码均为 {{password}}）',
    successAs: '已登录为 {{name}}（{{role}}）',
    failureFallback: '登录失败',
  },
};

export default zh;
