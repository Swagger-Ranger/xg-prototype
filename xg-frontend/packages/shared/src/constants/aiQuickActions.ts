/**
 * AI 助手「快捷操作 / 知识问答」按角色工作关系的统一配置。
 *
 * 单一数据源 —— web(AIPanel.tsx)与 mini(AIChatDrawer.tsx)共用，避免双端各写一份漂移。
 * 这里只放「文案 + 发给 AI 的 prompt + 语义图标 key」，**不依赖 antd / taro**：
 * 图标到具体组件的映射由各端自己做（web → antd icon，mini → 内联 SVG icon）。
 *
 * 角色分组按「工作关系的性质」而非逐 role_code：
 *   - student      个人 ↔ 学校：自己的请假/通知/勤工
 *   - counselor    我 ↔ 我带的具体学生（一对多实体）：审批、班级、关怀
 *   - dean         我 ↔ 本院（聚合视角，不碰单个学生）：院级总览、观察员
 *   - school_admin 我 ↔ 系统配置/运行态（不碰业务对象）：脉搏、异常、配置
 * college_admin / student_affairs_* 等没有专属工作台的角色统一落到 counselor，
 * 与 web 工作台路由 (pages/workspace/index.tsx) 的 fallback 行为保持一致。
 */

export type AiRoleGroup = 'student' | 'counselor' | 'dean' | 'school_admin';

/** 语义图标 key —— 各端各自映射到自己的图标系统，不在此耦合具体图标库。 */
export type AiQuickIcon =
  | 'leave'
  | 'list'
  | 'notice'
  | 'work'
  | 'approve'
  | 'insight'
  | 'collect'
  | 'overview'
  | 'pulse'
  | 'config';

export interface AiQuickAction {
  label: string;
  /** 副标题（mini 显示在 label 下；web 作为 quickDesc）。 */
  desc: string;
  /** 点击后直接发给 AI 助手的 prompt。 */
  prompt: string;
  icon: AiQuickIcon;
}

export interface AiKnowledgeQuestion {
  label: string;
  desc: string;
  prompt: string;
}

export interface AiRoleConfig {
  quickActions: AiQuickAction[];
  knowledgeQuestions: AiKnowledgeQuestion[];
}

export const AI_QUICK_CONFIG: Record<AiRoleGroup, AiRoleConfig> = {
  student: {
    quickActions: [
      // 注：web 学生空态用 AIPanel 里那张「请假申请」引导卡（含假别 chip）覆盖此项，
      // 因此 web 渲染时会按 icon==='leave' 过滤掉这一条；mini 没有那张卡，正常展示。
      { label: '请假申请', desc: 'AI 引导填写，快速提交', prompt: '我想请假', icon: 'leave' },
      { label: '我的请假', desc: '查看进度与历史', prompt: '我的请假最近怎么样？', icon: 'list' },
      { label: '未读通知', desc: '查看未读通知', prompt: '我有什么未读通知？', icon: 'notice' },
      {
        label: '我的勤工',
        desc: '查看勤工助学进度',
        prompt: '用 workstudy_dashboard_brief 看下我现在的勤工助学进度',
        icon: 'work',
      },
    ],
    knowledgeQuestions: [
      { label: '请假规定', desc: '假期天数与审批流程', prompt: '学生请假最多能请几天？审批流程是怎样的？' },
      { label: '奖学金政策', desc: '申请条件与评选', prompt: '奖学金申请条件是什么？' },
      { label: '违纪处分', desc: '处分等级与申诉', prompt: '学生违纪处分有哪些等级？怎么申诉？' },
    ],
  },

  counselor: {
    quickActions: [
      { label: '审批待办', desc: '查看待审批请假', prompt: '有哪些待我审批的请假？', icon: 'approve' },
      { label: '今日班级离校', desc: '看本班今日离校', prompt: '今天我带的班里有谁请假离校？', icon: 'list' },
      {
        label: '需关怀学生',
        desc: '看需关注学生',
        prompt: '现在有几位学生需要关怀？列一下预警情况',
        icon: 'insight',
      },
      { label: '发起信息收集', desc: '发起收集任务', prompt: '帮我创建一个信息收集', icon: 'collect' },
    ],
    knowledgeQuestions: [
      { label: '怎么发起关怀谈话', desc: '预警学生关怀流程', prompt: '怎么对一个预警学生发起关怀谈话？' },
      { label: '违纪处分流程', desc: '处分等级与流程', prompt: '学生违纪处分流程怎么走？' },
      { label: '请假审批规定', desc: '辅导员审批口径', prompt: '辅导员审批请假有什么规定？' },
    ],
  },

  dean: {
    quickActions: [
      {
        label: '院级今日总览',
        desc: '本院今日整体情况',
        prompt: '给我播报本院今天的整体情况',
        icon: 'overview',
      },
      { label: '待审请假', desc: '查看待审批请假', prompt: '有哪些待我审批的请假？', icon: 'approve' },
      {
        label: '关怀总览',
        desc: '本院学生关怀概况',
        prompt: '本院现在的学生关怀总体情况怎么样？',
        icon: 'insight',
      },
      {
        label: 'AI 观察员',
        desc: '看观察员新发现',
        prompt: '看下我配置的 AI 观察员有什么新发现',
        icon: 'insight',
      },
    ],
    knowledgeQuestions: [
      { label: '本院预警分布', desc: '预警学生人数与分布', prompt: '本院现在有几位预警学生？分布怎么样？' },
      { label: '通知到达率', desc: '到达率偏低原因', prompt: '本院通知到达率为什么偏低？' },
      { label: '怎么配观察员', desc: '新增 AI 观察员', prompt: '我想新增一个 AI 观察员，要怎么配？' },
    ],
  },

  school_admin: {
    quickActions: [
      { label: '系统脉搏', desc: '系统整体运行状态', prompt: '现在系统整体运行状态怎么样？', icon: 'pulse' },
      {
        label: '异常排查',
        desc: '工作流/通知异常',
        prompt: '现在有哪些工作流卡住、通知发送失败的异常？',
        icon: 'insight',
      },
      { label: '改业务配置', desc: 'AI 协助修改配置', prompt: '我想修改一项业务配置', icon: 'config' },
      { label: '查审计', desc: '近期配置变更审计', prompt: '最近有哪些重要的配置变更审计记录？', icon: 'list' },
    ],
    knowledgeQuestions: [
      { label: 'AI 能改哪些配置', desc: '可改配置清单', prompt: 'AI 助手现在能帮我修改哪些业务配置？' },
      { label: '工作流为什么没推进', desc: '卡顿排查', prompt: '某个工作流为什么一直没推进？怎么排查？' },
      { label: '通知失败怎么定位', desc: '三渠道扇出排查', prompt: '通知三渠道扇出失败了，怎么定位原因？' },
    ],
  },
};

/**
 * 把用户的 role_codes 收敛到 4 个 AI 配置分组。
 *
 * 优先级镜像 web 工作台路由 (pages/workspace/index.tsx)：
 *   student > school_admin(含 super_admin) > dean > 否则 counselor
 * 这样「AI 面板看到的快捷操作」与「用户当前所在工作台」一致。
 */
export function resolveAiRoleGroup(
  roleCodes: readonly string[] | undefined,
): AiRoleGroup {
  const codes = roleCodes ?? [];
  if (codes.includes('student')) return 'student';
  if (codes.includes('school_admin') || codes.includes('super_admin')) return 'school_admin';
  if (codes.includes('dean')) return 'dean';
  return 'counselor';
}
