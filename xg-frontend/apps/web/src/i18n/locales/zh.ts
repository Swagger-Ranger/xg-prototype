// Chrome strings only (top bar, login). Page bodies stay zh until i18n
// expansion follows. Keys are dotted paths grouped by surface.
export interface LocaleResource {
  app: { name: string; tagline: string };
  topbar: {
    unreadSuffix: string;
    profile: string;
    logout: string;
  };
  routes: {
    workspace: string; leave: string; collection: string; checkin: string;
    notification: string; student: string; workLog: string; violation: string;
    alerts: string; workStudy: string; system: string; knowledge: string;
    care: string; crisis: string;
  };
  login: {
    quickLoginHint: string;
    successAs: string;
    failureFallback: string;
  };
}

const zh: LocaleResource = {
  app: {
    name: '朝夕',
    tagline: 'AI 原生学生工作服务平台',
  },
  topbar: {
    unreadSuffix: '条未读',
    profile: '个人中心',
    logout: '退出登录',
  },
  routes: {
    workspace: '工作台',
    leave: '请销假',
    collection: '信息收集',
    checkin: '签到',
    notification: '我的通知',
    student: '学生信息库',
    workLog: '工作日志',
    violation: '违纪处分',
    alerts: '异常预警',
    workStudy: '勤工助学',
    system: '系统管理',
    knowledge: '知识问答',
    care: '关怀工作台',
    crisis: '危机核实',
  },
  login: {
    quickLoginHint: '选择账号快速登录（密码均为 {{password}}）',
    successAs: '已登录为 {{name}}（{{role}}）',
    failureFallback: '登录失败',
  },
};

export default zh;
