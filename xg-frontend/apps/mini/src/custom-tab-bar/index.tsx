import { useEffect, useRef, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Icon, type IconName } from '../utils/icons';
import { useAIChatStore } from '../stores/aiChat';
import styles from './index.module.css';

/* 底部 dock —— 输入框 + 4 tab，AI 输入直接暴露
 *   - dock 上半：浅灰输入框 + 麦克风 + 发送按钮（一直可用）
 *   - 中间分隔
 *   - dock 下半：4 个等宽 tab
 *   - drawer：消息列表 ONLY，从 dock 之上滑出（不覆盖 dock）
 */

interface NavTab {
  path: string;
  icon: IconName;
  label: string;
}
const NAV_TABS: NavTab[] = [
  { path: '/pages/home/index',    icon: 'home', label: '首页' },
  { path: '/pages/apps/index',    icon: 'grid', label: '应用' },
  { path: '/pages/profile/index', icon: 'user', label: '个人中心' },
];

interface RecognitionPlugin {
  getRecordRecognitionManager(): {
    onStart: (cb: () => void) => void;
    onRecognize: (cb: (res: { result: string }) => void) => void;
    onStop: (cb: (res: { result: string }) => void) => void;
    onError: (cb: (err: { retcode: number; retdesc: string }) => void) => void;
    start: (opts: { duration: number; lang: string }) => void;
    stop: () => void;
  };
}

export default function CustomTabBar() {
  const [currentPath, setCurrentPath] = useState('');
  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [partialText, setPartialText] = useState('');
  const managerRef = useRef<ReturnType<RecognitionPlugin['getRecordRecognitionManager']> | null>(null);

  // store 暴露的 send 是发送 + history 注入 + action 派发的单一入口；
  // dock 输入和 drawer quick action 都走它，保证体验一致
  const isOpen = useAIChatStore((s) => s.isOpen);
  const open = useAIChatStore((s) => s.open);
  const sendMessage = useAIChatStore((s) => s.send);
  const loading = useAIChatStore((s) => s.loading);

  useEffect(() => {
    const router = Taro.getCurrentInstance().router;
    if (router?.path) setCurrentPath('/' + router.path);
  }, []);

  const switchTo = (path: string) => {
    if (path === currentPath) return;
    Taro.switchTab({ url: path });
  };

  const ensureManager = () => {
    if (managerRef.current) return managerRef.current;
    let plugin: RecognitionPlugin;
    try {
      plugin = (Taro as unknown as { requirePlugin: (n: string) => RecognitionPlugin })
        .requirePlugin('WechatSI');
    } catch {
      Taro.showToast({ title: '语音插件未授权（去 mp 后台加同声传译）', icon: 'none' });
      return null;
    }
    const m = plugin.getRecordRecognitionManager();
    m.onStart(() => setRecording(true));
    m.onRecognize((res) => setPartialText(res.result || ''));
    m.onStop((res) => {
      setRecording(false);
      setPartialText('');
      const final = (res.result || '').trim();
      if (final) setInput((prev) => (prev ? prev + final : final));
    });
    m.onError((err) => {
      setRecording(false);
      setPartialText('');
      Taro.showToast({ title: `识别失败：${err.retdesc}`, icon: 'none' });
    });
    managerRef.current = m;
    return m;
  };

  const startRecord = () => {
    const m = ensureManager();
    if (!m) return;
    m.start({ duration: 30000, lang: 'zh_CN' });
  };
  const stopRecord = () => {
    if (managerRef.current && recording) managerRef.current.stop();
  };

  const send = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    if (!isOpen) open();
    void sendMessage(text);
  };

  // 注意：AIChatDrawer 挂在 App 层（src/app.tsx），不在这里。
  // 见 app.tsx 的注释说明（mini-app custom-tab-bar 的 fixed 元素受限）。

  return (
    <>
      {/* 录音浮层 — dock 上方 */}
      {recording && (
        <View className={styles.voiceOverlay}>
          <View className={styles.voiceOverlayDotRow}>
            <View className={styles.voiceOverlayDot} />
            <Text>正在听…再点麦克风结束</Text>
          </View>
          {partialText ? <Text className={styles.voiceOverlayText}>{partialText}</Text> : null}
        </View>
      )}

      <View className={styles.dock}>
        {/* === AI 输入条（含明确身份标识，让用户知道这是 AI 助手而非搜索框） === */}
        <View className={styles.aiInputBar}>
          <View className={styles.inputPill}>
            <View className={styles.inputLeadChip}>
              <Icon name="sparkles" color="#3a6df0" size={26} />
              <Text className={styles.inputLeadLabel}>AI 助手</Text>
            </View>
            <View className={styles.inputLeadSep} />
            <Input
              className={styles.input}
              placeholder="问问任何校内事务…"
              value={input}
              confirmType="send"
              onInput={(e) => setInput(e.detail.value)}
              onFocus={() => !isOpen && open()}
              onConfirm={() => send()}
            />
          </View>

          {/* 有文字时显示发送按钮，否则显示麦克风（按住录音）*/}
          {input.trim() ? (
            <View
              className={`${styles.actionBtn} ${styles.actionBtnSend}`}
              onClick={send}
            >
              <Icon name="send" color="#ffffff" weight={2} size={30} />
            </View>
          ) : (
            <View
              className={`${styles.actionBtn} ${recording ? styles.actionBtnRec : ''}`}
              onTouchStart={startRecord}
              onTouchEnd={stopRecord}
              onTouchCancel={stopRecord}
            >
              <Icon name="mic" color={recording ? '#dc2626' : '#475569'} weight={2} size={32} />
            </View>
          )}
        </View>

        {/* === 分隔 === */}
        <View className={styles.divider} />

        {/* === 4 tab === */}
        <View className={styles.tabRow}>
          {NAV_TABS.map((t) => {
            const active = currentPath === t.path;
            return (
              <View key={t.path} className={styles.tab} onClick={() => switchTo(t.path)}>
                <Icon
                  name={t.icon}
                  color={active ? '#4f46e5' : '#64748b'}
                  weight={active ? 2 : 1.8}
                  size={40}
                />
                <Text className={active ? styles.tabLabelActive : styles.tabLabel}>
                  {t.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </>
  );
}
