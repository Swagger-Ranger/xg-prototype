import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.css';

export default function Index() {
  return (
    <View className={styles.page}>
      {/* Gradient Header */}
      <View className={styles.header}>
        <View className={styles.headerGrain} />
        <View className={styles.headerShimmer} />
        <View className={styles.headerContent}>
          <View className={styles.headerTop}>
            <View className={styles.avatar}>
              <Text className={styles.avatarText}>张</Text>
            </View>
            <View className={styles.greeting}>
              <Text className={styles.greetingName}>张老师，早上好</Text>
              <Text className={styles.greetingRole}>辅导员 · 计算机学院</Text>
            </View>
          </View>

          {/* Briefing Pills */}
          <View className={styles.pills}>
            <View className={styles.pill}>
              <Text className={styles.pillValue}>7</Text>
              <Text className={styles.pillLabel}>待审批</Text>
            </View>
            <View className={styles.pill}>
              <Text className={styles.pillValue}>3</Text>
              <Text className={styles.pillLabel}>今日请假</Text>
            </View>
            <View className={styles.pill}>
              <Text className={styles.pillValue}>2</Text>
              <Text className={styles.pillLabel}>未读通知</Text>
            </View>
            <View className={styles.pill}>
              <Text className={styles.pillValue}>0</Text>
              <Text className={styles.pillLabel}>关注学生</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Cards */}
      <View className={styles.cards}>
        {/* AI Briefing Card */}
        <View className={styles.card}>
          <View className={styles.cardShimmer} />
          <View className={styles.cardHeader}>
            <Text className={styles.cardIcon}>🤖</Text>
            <Text className={styles.cardTitle}>今日概况</Text>
          </View>
          <View className={styles.cardBody}>
            <Text className={styles.cardText}>
              今日有 7 条待审批请假，其中 2 条为病假离校需要重点关注。
              计科2301班信息收集"五一去向统计"已截止，还有 3 名同学未填。
            </Text>
          </View>
        </View>

        {/* Batch Approval Card */}
        <View className={`${styles.card} ${styles.approvalCard}`}>
          <View className={styles.approvalHeader}>
            <Text className={styles.cardTitle} style={{ color: '#ffffff' }}>批量审批</Text>
            <View className={styles.approvalBadge}>
              <Text className={styles.approvalBadgeText}>7</Text>
            </View>
          </View>
          <View className={styles.cardBody}>
            <Text className={styles.cardText}>有 7 条请假待审批，点击查看详情</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
