import { useEffect, useState } from 'react';
import { Text, Textarea, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { applyToPosition, draftApplicationIntro, getPosition, type MiniPosition } from '../../api/workStudy';
import styles from './index.module.css';

const SALARY_UNIT_LABEL: Record<string, string> = {
  hour: '时', day: '天', month: '月', per_task: '次',
};

export default function WorkStudyDetail() {
  const router = useRouter();
  const positionId = String(router.params.id || '');
  const [pos, setPos] = useState<MiniPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [intro, setIntro] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const handleAiDraft = async () => {
    if (!pos) return;
    try {
      setDrafting(true);
      Taro.showLoading({ title: 'AI 起草中…' });
      const draft = await draftApplicationIntro(pos.id);
      setIntro(draft);
      setApplyOpen(true);
      Taro.showToast({ title: '草稿已生成，请按需修改', icon: 'none' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI 起草失败';
      Taro.showToast({ title: msg, icon: 'none' });
    } finally {
      Taro.hideLoading();
      setDrafting(false);
    }
  };

  useEffect(() => {
    if (!positionId) {
      Taro.showToast({ title: '岗位 ID 缺失', icon: 'none' });
      return;
    }
    setLoading(true);
    getPosition(positionId)
      .then(setPos)
      .catch((err: Error) => Taro.showToast({ title: err.message, icon: 'none' }))
      .finally(() => setLoading(false));
  }, [positionId]);

  const handleApply = async () => {
    if (!pos) return;
    if (intro.trim().length < 10) {
      Taro.showToast({ title: '申请理由至少 10 字', icon: 'none' });
      return;
    }
    try {
      setSubmitting(true);
      await applyToPosition(pos.id, intro.trim());
      Taro.showToast({ title: '申请已提交', icon: 'success' });
      setApplyOpen(false);
      setIntro('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '申请失败';
      Taro.showToast({ title: msg, icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View className={styles.page}><Text style={{ padding: '40rpx', color: '#9ca3af' }}>加载中…</Text></View>;
  }
  if (!pos) {
    return <View className={styles.page}><Text style={{ padding: '40rpx', color: '#9ca3af' }}>岗位不存在</Text></View>;
  }

  const isOpen = pos.status === 'open';
  const isFull = (pos.headcount ?? 0) > 0 && (pos.hired_count ?? 0) >= (pos.headcount ?? 0);
  const canApply = isOpen && !isFull;

  return (
    <View className={styles.page}>
      <View className={styles.heroCard}>
        <Text className={styles.heroTitle}>{pos.title}</Text>
        <Text className={styles.heroMeta}>
          {pos.position_type === 'temporary' ? '临时岗' : '固定岗'}
          {pos.department_name && ` · ${pos.department_name}`}
          {pos.academic_year && ` · ${pos.academic_year} 学年`}
        </Text>
        {(pos.salary_amount || pos.hourly_rate) && (
          <Text className={styles.heroSalary}>
            ¥{Number(pos.salary_amount || pos.hourly_rate).toFixed(2)} / {SALARY_UNIT_LABEL[pos.salary_unit || 'hour'] || '时'}
          </Text>
        )}
      </View>

      <View className={styles.section}>
        <Text className={styles.sectionTitle}>岗位描述</Text>
        <Text className={styles.sectionBody}>{pos.description}</Text>
      </View>

      {pos.requirements && (
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>任职要求</Text>
          <Text className={styles.sectionBody}>{pos.requirements}</Text>
        </View>
      )}

      <View className={styles.section}>
        <Text className={styles.sectionTitle}>基本信息</Text>
        {pos.campus && <FieldRow label="校区" value={pos.campus} />}
        {pos.work_location && <FieldRow label="工作地点" value={pos.work_location} />}
        {pos.weekly_hours != null && <FieldRow label="周工时" value={`${pos.weekly_hours} 小时`} />}
        <FieldRow label="招聘人数" value={`${pos.hired_count ?? 0} / ${pos.headcount ?? '?'}`} />
        {pos.application_deadline && (
          <FieldRow label="申请截止" value={pos.application_deadline.slice(0, 16).replace('T', ' ')} />
        )}
      </View>

      <View className={styles.applyBar}>
        <View
          className={styles.aiBtn}
          onClick={() => !drafting && handleAiDraft()}
        >
          {drafting ? '起草中…' : '🤖 让 AI 帮我写'}
        </View>
        <View
          className={`${styles.applyBtn} ${!canApply ? styles.applyBtnDisabled : ''}`}
          onClick={() => canApply && setApplyOpen(true)}
        >
          {!isOpen ? '已关闭' : isFull ? '已招满' : '立即申请'}
        </View>
      </View>

      {applyOpen && (
        <View className={styles.modalMask} onClick={() => setApplyOpen(false)}>
          <View className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>申请：{pos.title}</Text>
            <Textarea
              className={styles.textarea}
              value={intro}
              onInput={(e) => setIntro(e.detail.value)}
              placeholder="请简述你为什么适合这个岗位（至少 10 字）"
              maxlength={2000}
            />
            <View className={styles.modalActions}>
              <View className={styles.modalCancel} onClick={() => setApplyOpen(false)}>
                取消
              </View>
              <View
                className={styles.modalSubmit}
                onClick={() => !submitting && handleApply()}
              >
                {submitting ? '提交中…' : '提交申请'}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View className={styles.fieldRow}>
      <Text className={styles.fieldLabel}>{label}</Text>
      <Text className={styles.fieldValue}>{value}</Text>
    </View>
  );
}
