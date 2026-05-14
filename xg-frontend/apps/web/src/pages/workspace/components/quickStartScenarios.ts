// 首次配置 · 场景导航（纯静态，不监听完成态）。
// 每个场景 = admin 首次配置时关心的一个主题；点击 action 跳到对应模块。
// 注意：/system 下的 sub tab 暂不支持 URL 直达（见 system/index.tsx 注释），
// 所以"组织派班 / 学校信息 / 学期 / AI / 知识库"都只能落到 /system?tab=xxx，
// 用户进去后自己点对应子 tab。

export interface SetupAction {
  label: string;
  /** 跳转模式：点击 navigate 到该路由 */
  href?: string;
  /** AI 助手模式：点击打开 AIPanel 并把这段话预填到输入框（不自动发送） */
  aiPrompt?: string;
}

export type SetupIconName =
  | 'data-init'
  | 'basic-config'
  | 'leave'
  | 'identity'
  | 'notification'
  | 'knowledge'
  | 'ai';

export interface SetupScenario {
  id: string;
  title: string;
  subtitle: string;
  iconName: SetupIconName;
  actions: SetupAction[];
}

export const FIRST_SETUP_SCENARIOS: SetupScenario[] = [
  {
    id: 'data-init',
    title: '数据初始化',
    subtitle: '把已有的学生花名册、教师 / 辅导员名单导入系统；小夕帮你对齐字段、推断院系班级、批量赋角色',
    iconName: 'data-init',
    actions: [
      { label: '进入数据初始化向导', href: '/data-import' },
    ],
  },
  {
    id: 'org-and-account',
    title: '组织与账号',
    subtitle: '建辅导员 / 教师账号，配组织树(学院 / 专业 / 班级)，做辅导员-班级映射',
    iconName: 'identity',
    actions: [
      { label: '用户管理(建账号)', href: '/system?tab=users' },
      { label: '组织派班(树 + 映射)', href: '/system?tab=settings' },
    ],
  },
  {
    id: 'basic-config',
    title: '基础配置',
    subtitle: '学校信息、学期、考试 / 假期日历、班级课表——所有业务的基准参数都在这里',
    iconName: 'basic-config',
    actions: [
      { label: '进入基础设置', href: '/system?tab=settings' },
    ],
  },
  {
    id: 'leave',
    title: '业务流接入(请假)',
    subtitle: '把请假规则、通知模板调通，让审批 / 通知串成一条闭环',
    iconName: 'leave',
    actions: [
      { label: '请假规则调整', href: '/leave?tab=rule' },
      { label: '请假通知模板调整', href: '/system?tab=notif' },
    ],
  },
  {
    id: 'notification',
    title: '通知管理',
    subtitle: '维护各业务场景的通知模板、发送渠道(站内信 / 小程序 / 企微)',
    iconName: 'notification',
    actions: [
      { label: '通知中心配置', href: '/system?tab=notif' },
    ],
  },
  {
    id: 'knowledge',
    title: '知识库',
    subtitle: '上传 PDF / Word / 内规手册——AI 答疑会从这里检索；也可以维护 QA 对',
    iconName: 'knowledge',
    actions: [
      { label: '知识库管理', href: '/system?tab=kb' },
    ],
  },
  {
    id: 'ai-assistant',
    title: 'AI 助手',
    subtitle: '不用翻菜单——对小夕说一句话就能改配置。点击会把示例话术填进 AI 对话框，按需改后回车发送：',
    iconName: 'ai',
    actions: [
      { label: '改请假 / 考勤规则', aiPrompt: '帮我把公假审批最高一档的天数阈值改成 10 天' },
      { label: '调整通知配置', aiPrompt: '帮我把"请假超时未销假"通知改成只走站内 + 企微,不发小程序' },
      { label: '调整学期累计上限', aiPrompt: '帮我把全学期累计请假上限改成 15 天' },
      { label: '问小夕系统怎么用', aiPrompt: '我是校管理员,请告诉我开学前必须完成的配置步骤' },
    ],
  },
];
