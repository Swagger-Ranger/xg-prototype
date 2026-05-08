import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  listMyNotifications,
  markAsRead,
  notificationDeeplink,
  type MiniNotification,
  type NotificationLevel,
} from '../../api/notification';
import styles from './index.module.css';

/* 通知 — Apple 玻璃感 × Feed archetype。
 * 时间倒序卡片；点击 → markRead + (可选) 深链跳转。
 */

const LEVEL_LABEL: Record<NotificationLevel, string> = {
  normal: '通知',
  important: '重要',
  urgent: '紧急',
};

function formatRelative(s: string): string {
  if (!s) return '';
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return s;
  const now = Date.now();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<MiniNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMyNotifications(1, 100);
      setItems(res.data ?? []);
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useDidShow(() => { load(); });

  const onTap = async (n: MiniNotification) => {
    // 先乐观置已读，再后台 markRead；接口失败也不阻塞跳转
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markAsRead(n.id).catch(() => {
        // 静默：UI 已置已读，下次刷新会修正
      });
    }
    const url = notificationDeeplink(n);
    if (url) {
      Taro.navigateTo({ url }).catch(() => {
        Taro.showToast({ title: '该来源页面不存在', icon: 'none' });
      });
    }
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>通知</Text>
        <Text className={styles.heroSubtitle}>
          {unreadCount > 0 ? (
            <>
              <Text className="num">{unreadCount}</Text> 条未读
            </>
          ) : (
            '已全部查看'
          )}
        </Text>
      </View>

      {loading ? (
        <View className={styles.empty}>加载中…</View>
      ) : items.length === 0 ? (
        <View className={styles.empty}>暂无通知</View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {items.map((n) => {
            const deeplink = notificationDeeplink(n);
            return (
              <View
                key={n.id}
                className={`${styles.card} ${n.read ? styles.cardRead : styles.cardUnread}`}
                onClick={() => onTap(n)}
              >
                <View className={styles.cardHeader}>
                  <View className={styles.titleWrap}>
                    {!n.read && <View className={styles.unreadDot} />}
                    <Text className={styles.cardTitle} numberOfLines={1}>
                      {n.title}
                    </Text>
                  </View>
                  {n.level !== 'normal' && (
                    <Text className={`${styles.levelPill} ${styles[`level_${n.level}`]}`}>
                      {LEVEL_LABEL[n.level]}
                    </Text>
                  )}
                </View>
                <Text className={styles.cardBody} numberOfLines={3}>
                  {n.content}
                </Text>
                <View className={styles.cardFoot}>
                  <Text className={styles.timeText}>{formatRelative(n.created_at)}</Text>
                  {deeplink && <Text className={styles.openLink}>查看 ›</Text>}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
