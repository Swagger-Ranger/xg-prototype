import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Icon, type IconName } from '../../utils/icons';
import {
  listMyLeaves,
  listClassLeaves,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  type LeaveRequest,
} from '../../api/leave';
import { getUnreadCount } from '../../api/notification';
import { listPendingEnriched } from '../../api/workflow';
import { getAlertSummary } from '../../api/alert';
import {
  getLatestInsight,
  parseInsights,
  sortBySeverity,
  type InsightItem,
  type InsightSeverity,
} from '../../api/insight';
import styles from './index.module.css';

/* 首页 — 与 web TodayBriefCard + InsightCard 对齐。
 *
 * 「今日简报」永远是规则化（不走 LLM）—— summary 一段话 + 4 stats + items 清单。
 * 「AI 观察员」仅 staff 显示，走 /insights 拉 LLM item list 渲染。
 *
 * 两块职责截然分开：今日简报 = 当下数据快照；观察员 = LLM 视角的关注点。
 */

const STAFF_ROLES = ['counselor', 'dean', 'college_admin', 'school_admin', 'student_affairs_officer'];
const INSIGHT_ROLES = ['counselor', 'dean'] as const;
type InsightRole = (typeof INSIGHT_ROLES)[number];

interface MiniUser {
  username?: string;
  realName?: string;
  roleCodes?: string[];
}

const ROLE_LABELS: Record<string, string> = {
  student: '学生',
  counselor: '辅导员',
  college_admin: '院系管理员',
  dean: '院系领导',
  student_affairs_officer: '学工处',
  school_admin: '校级管理员',
  super_admin: '超级管理员',
  employer: '用人单位',
  aid_center_officer: '资助中心',
};

function primaryRoleZh(roles: string[] | undefined): string {
  const r = roles?.[0];
  return r ? ROLE_LABELS[r] ?? r : '';
}

const MONTH_LABELS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

function todayHeroDate(): { big: string; small: string } {
  const now = new Date();
  const weekday = ['日','一','二','三','四','五','六'][now.getDay()];
  return {
    big: `${MONTH_LABELS[now.getMonth()]}${now.getDate()}日`,
    small: `周${weekday} · ${now.getFullYear()}`,
  };
}

function isStaff(roles: string[] | undefined): boolean {
  return (roles ?? []).some((r) => STAFF_ROLES.includes(r));
}

function pickInsightRole(roles: string[] | undefined): InsightRole | null {
  if (!roles?.length) return null;
  if (roles.includes('dean')) return 'dean';
  if (roles.includes('counselor')) return 'counselor';
  return null;
}

function avatarInitials(name?: string): string {
  if (!name?.trim()) return '?';
  const trimmed = name.trim();
  const isChinese = /[一-龥]/.test(trimmed);
  return isChinese ? trimmed.slice(-1) : trimmed.slice(0, 1).toUpperCase();
}

function todayDateLabel(): string {
  const now = new Date();
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 周${weekday}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SEVERITY_LABELS: Record<InsightSeverity, string> = {
  info: '提示',
  warn: '关注',
  critical: '紧急',
};

interface BriefStat {
  label: string;
  value: string | number;
  footer?: string;
  href?: string;
  critical?: boolean;
}

interface BriefItemSegment {
  text?: string;
  value?: string | number;
  tone?: 'normal' | 'warn' | 'danger' | 'success';
}

interface BriefItem {
  icon: IconName;
  tone?: 'normal' | 'warn' | 'danger' | 'success';
  segments: BriefItemSegment[];
  trail?: string;
  href?: string;
}

interface BriefData {
  summary: string;
  stats: BriefStat[];
  items: BriefItem[];
}

interface QuickAction {
  key: string;
  icon: IconName;
  label: string;
  path: string;
}

function buildQuickActions(roles: string[] | undefined): QuickAction[] {
  const staff = isStaff(roles);
  return [
    staff
      ? { key: 'leave', icon: 'edit', label: '请假审批', path: '/pages/leave/approval/index' }
      : { key: 'leave', icon: 'edit', label: '我的请假', path: '/pages/leave/list/index' },
    { key: 'notify', icon: 'bell', label: '通知', path: '/pages/notifications/index' },
    {
      key: 'work',
      icon: 'briefcase',
      label: staff ? '班级请假' : '我的勤工',
      path: staff ? '/pages/leave/class/index' : '/pages/myWorkStudy/index',
    },
    { key: 'schedule', icon: 'calendar', label: '我的课表', path: '/pages/schedule/index' },
  ];
}

/* ── 学生版 brief ────────────────────────────────────── */

function buildStudentBrief(args: {
  myLeaves: LeaveRequest[];
  totalLeaveCount: number;
  unreadCount: number;
  name?: string;
}): BriefData {
  const { myLeaves, totalLeaveCount, unreadCount, name } = args;
  const pending = myLeaves.filter((l) => l.status === 'pending' || l.status === 'cancel_pending').length;
  const approved = myLeaves.filter((l) => l.status === 'approved').length;
  const opener = name ? `${name}同学，` : '';

  let summary: string;
  if (pending === 0 && unreadCount === 0) {
    summary = `${opener}今日一切就绪——没有待办审批，也没有未读通知，安心上课即可。${totalLeaveCount > 0 ? ` 历史请假 ${totalLeaveCount} 条可在下方回顾。` : ''}`;
  } else {
    const chips: string[] = [];
    if (pending > 0) chips.push(`${pending} 条请假正在审批`);
    if (unreadCount > 0) chips.push(`未读通知 ${unreadCount} 条`);
    summary = `${opener}今日需要关注：${chips.join('、')}。`;
    if (pending > 0) summary += '请留意审批结果，结果变化后会在通知中心同步。';
    else if (unreadCount >= 3) summary += '建议先过一遍通知，避免漏掉重要事项。';
  }

  const stats: BriefStat[] = [
    {
      label: '我的请假',
      value: totalLeaveCount,
      footer: totalLeaveCount > 0 ? '累计' : '暂无',
      href: '/pages/leave/list/index',
    },
    {
      label: '审批中',
      value: pending,
      footer: pending > 0 ? '等待审批' : '无',
      href: '/pages/leave/list/index',
    },
    {
      label: '已通过',
      value: approved,
      footer: '近 5 条中',
      href: '/pages/leave/list/index',
    },
    {
      label: '未读通知',
      value: unreadCount,
      footer: unreadCount > 0 ? '待查看' : '已读完',
      href: '/pages/notifications/index',
    },
  ];

  const items: BriefItem[] = [];
  if (pending > 0) {
    items.push({
      icon: 'file-text',
      tone: 'warn',
      href: '/pages/leave/list/index',
      segments: [{ text: '您有 ' }, { value: pending, tone: 'warn' }, { text: ' 条请假正在审批中' }],
      trail: '点击查看进度',
    });
  }
  if (unreadCount > 0) {
    items.push({
      icon: 'bell',
      href: '/pages/notifications/index',
      segments: [{ text: '未读通知 ' }, { value: unreadCount }, { text: ' 条' }],
    });
  }
  return { summary, stats, items };
}

/* ── 辅导员版 brief ──────────────────────────────────── */

function buildCounselorBrief(args: {
  pendingCount: number;
  todayLeaveCount: number;
  unreadCount: number;
  openAlertTotal: number;
  criticalHighTotal: number;
  name?: string;
}): BriefData {
  const { pendingCount, todayLeaveCount, unreadCount, openAlertTotal, criticalHighTotal, name } = args;
  const opener = name ? `${name}老师，` : '';
  const total = pendingCount + openAlertTotal + unreadCount;

  let summary: string;
  if (total === 0 && todayLeaveCount === 0) {
    summary = `${opener}今日班级整体平稳，无待办、无预警、无未读。可以把节奏放在主动走访与学生关怀上。`;
  } else {
    const chips: string[] = [];
    if (pendingCount > 0) chips.push(`待审 ${pendingCount} 条`);
    if (todayLeaveCount > 0) chips.push(`今日 ${todayLeaveCount} 人不在校`);
    if (openAlertTotal > 0) chips.push(`${openAlertTotal} 位学生触发预警`);
    if (unreadCount > 0) chips.push(`未读通知 ${unreadCount} 条`);
    summary = `${opener}今日关注：${chips.join('、')}。`;
    if (criticalHighTotal > 0) {
      summary += `其中 ${criticalHighTotal} 位已升到紧急级别，建议最先处理。`;
    } else if (pendingCount >= 5) {
      summary += `审批积压到 ${pendingCount} 条，建议今天集中清理一轮。`;
    }
  }

  const stats: BriefStat[] = [
    {
      label: '待审批',
      value: pendingCount,
      footer: pendingCount > 0 ? '审批中' : '已清空',
      href: '/pages/leave/approval/index',
    },
    {
      label: '今日离校',
      value: todayLeaveCount,
      footer: todayLeaveCount > 0 ? '离校中' : '无',
      href: '/pages/leave/class/index',
    },
    {
      label: '未读',
      value: unreadCount,
      footer: unreadCount > 0 ? '待查看' : '已读完',
      href: '/pages/notifications/index',
    },
    {
      label: '需关注学生',
      value: openAlertTotal,
      footer: criticalHighTotal > 0 ? `紧急 ${criticalHighTotal}` : '全部正常',
      critical: criticalHighTotal > 0,
      // mini 暂无 alerts 详情页，留空
    },
  ];

  const items: BriefItem[] = [];
  if (pendingCount > 0) {
    items.push({
      icon: 'check',
      tone: pendingCount >= 5 ? 'warn' : 'normal',
      href: '/pages/leave/approval/index',
      segments: [
        { text: '您有 ' },
        { value: pendingCount, tone: pendingCount >= 5 ? 'warn' : 'normal' },
        { text: ' 件审批待处理' },
      ],
      trail: pendingCount >= 5 ? '集中处理一轮' : undefined,
    });
  }
  if (todayLeaveCount > 0) {
    items.push({
      icon: 'file-text',
      href: '/pages/leave/class/index',
      segments: [{ text: '班级今日 ' }, { value: todayLeaveCount }, { text: ' 人在请假中' }],
    });
  }
  if (openAlertTotal > 0) {
    items.push({
      icon: 'alert-triangle',
      tone: criticalHighTotal > 0 ? 'danger' : 'warn',
      segments: [
        { value: openAlertTotal, tone: criticalHighTotal > 0 ? 'danger' : 'warn' },
        { text: ' 位学生触发预警' },
      ],
      trail: criticalHighTotal > 0 ? `紧急 ${criticalHighTotal}` : undefined,
    });
  }
  if (unreadCount > 0) {
    items.push({
      icon: 'bell',
      href: '/pages/notifications/index',
      segments: [{ text: '未读通知 ' }, { value: unreadCount }, { text: ' 条' }],
    });
  }
  return { summary, stats, items };
}

export default function HomePage() {
  const [user, setUser] = useState<MiniUser | null>(null);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [insights, setInsights] = useState<InsightItem[] | null>(null);
  const [recentLeaves, setRecentLeaves] = useState<LeaveRequest[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = Taro.getStorageSync('user') as MiniUser | undefined;
    const token = Taro.getStorageSync('token');
    if (raw) setUser(raw);

    // 未登录直接结束 loading，不打任何 API——
    // 否则 N 个并发 401 会导致 request 层 N 次 reLaunch 触发 page mount 超时
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try { return await p; } catch { return fallback; }
    };

    (async () => {
      const userId = String(Taro.getStorageSync('userId') || '');
      const staff = isStaff(raw?.roleCodes);
      const insightRole = pickInsightRole(raw?.roleCodes);

      // 共用：未读数
      const unread = await safe(getUnreadCount(), 0);

      let nextBrief: BriefData;
      if (staff) {
        const [pending, classLeavesToday, alertSummary] = await Promise.all([
          userId ? safe(listPendingEnriched({ page: 1, size: 5, assigneeId: userId }), { data: [], total: 0 }) : Promise.resolve({ data: [], total: 0 }),
          // class leaves 用于今日离校粗略估计：取 status=approved 的近 50 条，过滤起止跨今日
          safe(listClassLeaves({ page: 1, size: 50, status: 'approved' }), { data: [] as LeaveRequest[], total: 0 as number | string }),
          safe(getAlertSummary(), { open_total: '0', by_severity: {} }),
        ]);
        const today = todayISO();
        const todayLeaveCount = (classLeavesToday.data ?? []).filter((l) => {
          const s = (l.start_time ?? '').slice(0, 10);
          const e = (l.end_time ?? '').slice(0, 10);
          return s <= today && today <= e;
        }).length;
        const openAlertTotal = Number(alertSummary.open_total ?? 0);
        const criticalHighTotal =
          Number(alertSummary.by_severity?.critical ?? 0) +
          Number(alertSummary.by_severity?.high ?? 0);
        nextBrief = buildCounselorBrief({
          pendingCount: Number(pending.total ?? 0),
          todayLeaveCount,
          unreadCount: unread,
          openAlertTotal,
          criticalHighTotal,
          name: raw?.realName,
        });
      } else {
        const myLeaves = await safe(listMyLeaves({ page: 1, size: 5 }), { data: [], total: 0 });
        const data = myLeaves.data ?? [];
        if (!cancelled) setRecentLeaves(data);
        nextBrief = buildStudentBrief({
          myLeaves: data,
          totalLeaveCount: Number(myLeaves.total ?? 0),
          unreadCount: unread,
          name: raw?.realName,
        });
      }

      // staff 拉 LLM 观察员（独立，与 brief 无关）
      let nextInsights: InsightItem[] | null = null;
      if (insightRole) {
        const res = await safe(getLatestInsight(insightRole), null);
        if (res && res.status === 'ready') {
          nextInsights = sortBySeverity(parseInsights(res.insights));
        } else {
          nextInsights = [];
        }
      }

      if (!cancelled) {
        setUnreadCount(unread);
        setBrief(nextBrief);
        setInsights(nextInsights);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const quick = buildQuickActions(user?.roleCodes);
  const showInsights = insights !== null; // staff
  const dateLabel = todayDateLabel();
  const heroDate = todayHeroDate();
  const isLoggedIn = !!user;
  const userRoleZh = primaryRoleZh(user?.roleCodes);
  const displayName = user?.realName ?? user?.username ?? '';

  return (
    <View className={styles.page}>
      {/* ── Hero ──────────────────────────────────────
          已登录：日期大字 + 姓名 · 角色 + 右侧 bell/avatar
          未登录：日期大字 + 「未登录」placeholder + 右侧蓝 pill「前往登录」
          —— 用日期作为视觉锚点（数字大字），姓名/角色作为身份副线，
             即使姓名只有 2-3 字也不显得 hero 空荡 */}
      <View className={styles.hero}>
        <View className={styles.heroText}>
          <Text className={styles.heroEyebrow}>
            <Text className={`${styles.heroEyebrowDate} num`}>{heroDate.big}</Text>
            <Text className={styles.heroEyebrowSep}> · </Text>
            <Text className={styles.heroEyebrowMeta}>{heroDate.small}</Text>
          </Text>
          <Text className={`${styles.heroDisplay} display`}>
            {isLoggedIn ? (displayName || '匿名用户') : '未登录'}
          </Text>
          <Text className={styles.heroSubline}>
            {isLoggedIn
              ? (userRoleZh ? `${userRoleZh} · 我的工作台` : '我的工作台')
              : '登录后查看待办与通知'}
          </Text>
        </View>

        <View className={styles.heroActions}>
          {isLoggedIn && (
            <View
              className={`${styles.heroBtn} tap-min`}
              onClick={() => Taro.navigateTo({ url: '/pages/notifications/index' })}
            >
              <Icon name="bell" color="#0f1421" size={36} />
              {unreadCount > 0 && <View className={styles.heroBtnDot} />}
            </View>
          )}
          {isLoggedIn && (
            <View
              className={`${styles.avatar} tap-min`}
              onClick={() => Taro.switchTab({ url: '/pages/profile/index' })}
            >
              <Text className={styles.avatarText}>{avatarInitials(displayName)}</Text>
            </View>
          )}
          {!isLoggedIn && (
            <View
              className={`${styles.heroLoginBtn} tap-min`}
              onClick={() => Taro.reLaunch({ url: '/pages/login/index' })}
            >
              <Text className={styles.heroLoginBtnLabel}>前往登录</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Quick chips ──────────────────────────────── */}
      <ScrollView scrollX className={styles.chipsScroll} showScrollbar={false}>
        <View className={styles.chips}>
          {quick.map((a) => (
            <View
              key={a.key}
              className={`${styles.chip} tap-min`}
              onClick={() => Taro.navigateTo({ url: a.path }).catch(() => {
                Taro.showToast({ title: '该模块即将上线', icon: 'none' });
              })}
            >
              <View className={styles.chipIcon}>
                <Icon name={a.icon} color="#3a6df0" size={32} />
              </View>
              <Text className={styles.chipLabel}>{a.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ── 今日简报（规则化）───────────────────────── */}
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>今日简报</Text>
        <Text className={styles.sectionDate}>{dateLabel}</Text>
      </View>

      <View className={styles.briefCard}>
        {loading ? (
          <Text className={styles.briefSummary}>正在拉取你的今日数据…</Text>
        ) : (
          <Text className={styles.briefSummary}>{brief?.summary}</Text>
        )}

        <View className={styles.statsGrid}>
          {(brief?.stats ?? []).map((s) => (
            <View
              key={s.label}
              className={`${styles.statCell} ${s.href ? styles.statCellLink : ''}`}
              onClick={s.href ? () => Taro.navigateTo({ url: s.href! }) : undefined}
            >
              <Text className={styles.statLabel}>{s.label}</Text>
              <Text className={`${styles.statValue} num ${s.critical ? styles.statValueCritical : ''}`}>
                {s.value}
              </Text>
              {s.footer && <Text className={styles.statFooter}>{s.footer}</Text>}
            </View>
          ))}
        </View>

        {(brief?.items ?? []).length > 0 && (
          <View className={styles.itemsList}>
            {(brief?.items ?? []).map((it, i) => (
              <View
                key={i}
                className={`${styles.item} ${it.href ? styles.itemLink : ''}`}
                onClick={it.href ? () => Taro.navigateTo({ url: it.href! }) : undefined}
              >
                <View className={`${styles.itemIcon} ${it.tone ? styles[`tone_${it.tone}`] : ''}`}>
                  <Icon name={it.icon} color="currentColor" size={28} />
                </View>
                <Text className={styles.itemText}>
                  {it.segments.flatMap((seg, j) => {
                    // Mini 端 <text> 嵌套 3 层会炸；摊平到 2 层最多。
                    const out: ReactNode[] = [];
                    if (seg.text) out.push(<Text key={`t${j}`}>{seg.text}</Text>);
                    if (seg.value !== undefined && seg.value !== '') {
                      const toneCls = seg.tone ? styles[`numTone_${seg.tone}`] : '';
                      out.push(
                        <Text key={`v${j}`} className={`${styles.itemNum} num ${toneCls}`}>
                          {seg.value}
                        </Text>,
                      );
                    }
                    return out;
                  })}
                </Text>
                {it.trail && <Text className={styles.itemTrail}>{it.trail}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── 我的请假记录（学生 only，对齐 web StudentWorkspace）── */}
      {!showInsights && isLoggedIn && recentLeaves !== null && (
        <View>
          <View className={styles.sectionHead}>
            <Text className={styles.sectionTitle}>我的请假记录</Text>
            <Text className={styles.sectionDate}>
              {recentLeaves.length > 0 ? '近 5 条' : '暂无'}
            </Text>
          </View>
          {recentLeaves.length === 0 ? (
            <View className={styles.observerEmpty}>
              <Text className={styles.observerEmptyText}>暂无请假记录</Text>
            </View>
          ) : (
            <View className={styles.leaveList}>
              {recentLeaves.map((l) => {
                const tone = LEAVE_STATUS_TONES[l.status];
                return (
                  <View
                    key={l.id}
                    className={styles.leaveRow}
                    onClick={() => Taro.navigateTo({ url: `/pages/leave/detail/index?id=${l.id}` })}
                  >
                    <View className={styles.leaveMain}>
                      <Text className={styles.leaveTitle}>
                        {l.leave_type_name || '请假'}
                        <Text className={styles.leaveDays}> · {l.duration_days}天</Text>
                      </Text>
                      <Text className={`${styles.leaveDate} num`}>
                        {(l.start_time ?? '').slice(0, 10)}
                      </Text>
                    </View>
                    <Text className={`${styles.leaveStatus} ${styles[`leaveStatus_${tone}`]}`}>
                      {LEAVE_STATUS_LABELS[l.status]}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ── AI 观察员（仅 staff，LLM）─────────────── */}
      {showInsights && (
        <View>
          <View className={styles.sectionHead}>
            <Text className={styles.sectionTitle}>AI 观察员</Text>
            {insights!.length > 0 && (
              <View className={styles.sectionBadge}>
                <Text className={`${styles.sectionBadgeText} num`}>{insights!.length}</Text>
              </View>
            )}
          </View>

          {insights!.length === 0 ? (
            <View className={styles.observerEmpty}>
              <Text className={styles.observerEmptyText}>
                暂无 AI 观察项。Sidecar 离线或本期暂无关注点。
              </Text>
            </View>
          ) : (
            <View className={styles.observerList}>
              {insights!.map((it, i) => (
                <View
                  key={i}
                  className={`${styles.observerCard} ${i === 0 ? styles.observerCardLead : ''}`}
                >
                  <View className={styles.observerHead}>
                    <Text className={`${styles.observerSeverity} ${styles[`sev_${it.severity}`]}`}>
                      {SEVERITY_LABELS[it.severity] ?? it.severity}
                    </Text>
                    {it.category && (
                      <Text className={styles.observerCategory}>{it.category}</Text>
                    )}
                  </View>
                  <Text className={i === 0 ? styles.observerTitleLead : styles.observerTitle}>
                    {it.title}
                  </Text>
                  <Text className={i === 0 ? styles.observerBodyLead : styles.observerBody} numberOfLines={4}>
                    {it.detail}
                  </Text>
                  {it.suggestion && (
                    <View className={styles.observerSuggest}>
                      <Text className={styles.observerSuggestLabel}>建议</Text>
                      <Text className={i === 0 ? styles.observerSuggestTextLead : styles.observerSuggestText}>
                        {it.suggestion}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
