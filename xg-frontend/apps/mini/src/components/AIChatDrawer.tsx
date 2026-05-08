import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Icon, type IconName } from '../utils/icons';
import { useAIChatStore } from '../stores/aiChat';
import styles from './AIChatDrawer.module.css';

/* AI 抽屉 — 与 web AIPanel.tsx 对齐：
 *
 *   - 空态：role-aware quick action grid（学生 / staff 不同提示）+ 知识问答
 *   - 有消息：bubble list + 可选 "正在思考" loading bubble
 *   - Header："AI 助手" + 在线指示 + 「新对话」按钮（messages.length > 0 才显示）
 *   - 底部输入框在 dock 里（custom-tab-bar），不归此组件管
 *
 * 点 quick action 直接走 store.send，drawer 输入与 dock 输入共用同一份逻辑。
 */

interface QuickAction {
  label: string;
  desc: string;
  icon: IconName;
  prompt: string;
}

const STUDENT_ACTIONS: QuickAction[] = [
  { label: '请假申请', desc: 'AI 引导填写，快速提交', icon: 'edit', prompt: '帮我请明天一天事假' },
  { label: '我的请假', desc: '查看进度与历史', icon: 'file-text', prompt: '我的请假最近怎么样？' },
  { label: '查通知', desc: '查看未读通知', icon: 'bell', prompt: '我有什么未读通知？' },
];

const STAFF_ACTIONS: QuickAction[] = [
  { label: '审批待办', desc: '查看待审批请假', icon: 'check', prompt: '有哪些待审批的请假？' },
  { label: '班级动态', desc: '看本班今日离校', icon: 'file-text', prompt: '今天班里有谁请假？' },
  { label: '风险预警', desc: '看需关注学生', icon: 'alert-triangle', prompt: '现在有几位学生处于预警状态？' },
];

const KB_QUESTIONS_STUDENT: QuickAction[] = [
  { label: '请假规定', desc: '假期天数与审批流程', icon: 'file-text', prompt: '学生请假最多能请几天？' },
  { label: '奖学金政策', desc: '申请条件与评选', icon: 'sparkles', prompt: '奖学金申请条件是什么？' },
];

const KB_QUESTIONS_STAFF: QuickAction[] = [
  { label: '请假规定', desc: '假期天数与审批流程', icon: 'file-text', prompt: '请假规定是什么？' },
  { label: '违纪处分', desc: '处分等级与申诉', icon: 'alert-triangle', prompt: '学生违纪处分有哪些等级？' },
];

interface MiniUser {
  realName?: string;
  roleCodes?: string[];
}

const STAFF_ROLES = ['counselor', 'dean', 'college_admin', 'school_admin', 'student_affairs_officer'];

function isStaff(user: MiniUser | undefined): boolean {
  return (user?.roleCodes ?? []).some((r) => STAFF_ROLES.includes(r));
}

export default function AIChatDrawer() {
  const isOpen = useAIChatStore((s) => s.isOpen);
  const messages = useAIChatStore((s) => s.messages);
  const loading = useAIChatStore((s) => s.loading);
  const close = useAIChatStore((s) => s.close);
  const newConversation = useAIChatStore((s) => s.newConversation);
  const send = useAIChatStore((s) => s.send);

  const [user, setUser] = useState<MiniUser | null>(null);
  useEffect(() => {
    if (isOpen) {
      const raw = Taro.getStorageSync('user') as MiniUser | undefined;
      setUser(raw ?? null);
    }
  }, [isOpen]);

  const staff = isStaff(user ?? undefined);
  const quickActions = staff ? STAFF_ACTIONS : STUDENT_ACTIONS;
  const kbActions = staff ? KB_QUESTIONS_STAFF : KB_QUESTIONS_STUDENT;

  const onQuickTap = (a: QuickAction) => {
    void send(a.prompt);
  };

  return (
    <View>
      <View
        className={`${styles.backdrop} ${isOpen ? styles.backdropOpen : ''}`}
        onClick={close}
      />
      <View className={`${styles.sheet} ${isOpen ? styles.sheetOpen : ''}`}>
        {/* ── Header ── */}
        <View className={styles.header}>
          <View className={styles.headerIcon}>
            <Icon name="sparkles" color="#fff" weight={2} size={28} />
          </View>
          <View className={styles.headerInfo}>
            <View className={styles.headerTitleRow}>
              <Text className={styles.headerTitle}>AI 助手</Text>
              <View className={styles.headerStatus}>
                <View className={styles.headerStatusDot} />
                <Text className={styles.headerStatusText}>在线</Text>
              </View>
            </View>
            <Text className={styles.headerHint}>
              {messages.length > 0 ? `${messages.length} 条对话` : '问任意校内事务'}
            </Text>
          </View>

          {messages.length > 0 && (
            <View
              className={styles.headerActionBtn}
              onClick={() => newConversation()}
            >
              <Icon name="sparkles" color="#3a6df0" weight={2} size={22} />
              <Text className={styles.headerActionLabel}>新对话</Text>
            </View>
          )}

          <View className={styles.closeBtn} onClick={close}>
            <Icon name="x" color="#64748b" weight={2} size={32} />
          </View>
        </View>

        {/* ── Messages or Empty state ── */}
        <ScrollView
          className={styles.messages}
          scrollY
          scrollIntoView={messages.length > 0 ? `m${messages.length - 1}` : undefined}
        >
          {messages.length === 0 ? (
            <View className={styles.empty}>
              <Text className={styles.emptyTitle}>有什么可以帮您？</Text>
              <Text className={styles.emptyHint}>
                朝夕的 AI 助手，可以快速操作系统功能，也是校规政策知识问答入口
              </Text>

              <View className={styles.quickGroup}>
                <Text className={styles.quickGroupLabel}>快捷操作</Text>
                {quickActions.map((a) => (
                  <View
                    key={a.label}
                    className={styles.quickBtn}
                    onClick={() => onQuickTap(a)}
                  >
                    <View className={styles.quickIconWrap}>
                      <Icon name={a.icon} color="#3a6df0" size={28} />
                    </View>
                    <View className={styles.quickTextGroup}>
                      <Text className={styles.quickText}>{a.label}</Text>
                      <Text className={styles.quickDesc}>{a.desc}</Text>
                    </View>
                    <Text className={styles.quickArrow}>›</Text>
                  </View>
                ))}
              </View>

              <View className={styles.quickGroup}>
                <Text className={styles.quickGroupLabel}>知识问答</Text>
                {kbActions.map((a) => (
                  <View
                    key={a.label}
                    className={styles.quickBtn}
                    onClick={() => onQuickTap(a)}
                  >
                    <View className={`${styles.quickIconWrap} ${styles.quickIconWrapAlt}`}>
                      <Icon name={a.icon} color="#5b6478" size={28} />
                    </View>
                    <View className={styles.quickTextGroup}>
                      <Text className={styles.quickText}>{a.label}</Text>
                      <Text className={styles.quickDesc}>{a.desc}</Text>
                    </View>
                    <Text className={styles.quickArrow}>›</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View>
              {messages.map((m, i) => (
                <View
                  key={i}
                  id={`m${i}`}
                  className={`${styles.bubbleRow} ${m.role === 'user' ? styles.bubbleRowUser : ''}`}
                >
                  <View
                    className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}`}
                  >
                    <Text>{m.text}</Text>
                  </View>
                </View>
              ))}

              {/* 思考中 bubble */}
              {loading && (
                <View className={styles.bubbleRow}>
                  <View className={`${styles.bubble} ${styles.bubbleAssistant} ${styles.thinking}`}>
                    <Text className={styles.thinkingText}>正在思考</Text>
                    <View className={styles.thinkingDots}>
                      <View className={styles.thinkingDot} />
                      <View className={styles.thinkingDot} />
                      <View className={styles.thinkingDot} />
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
