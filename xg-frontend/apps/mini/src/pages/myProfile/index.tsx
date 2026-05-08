import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  getMyStudent,
  getMyExtendedInfo,
  STATUS_LABELS,
  type MyStudent,
} from '../../api/student';
import {
  listMyLeaves,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  type LeaveRequest,
} from '../../api/leave';
import styles from './index.module.css';

/* 我的档案 — 学生自查（对齐 web /student/profile 但精简）。
 *
 * 与 web 的差异：
 *   · 不展示 alerts / violations / talks（这些是辅导员视角的 fact 表，
 *     学生看自己档案时不应暴露——就算是只读，也容易引导对抗情绪）
 *   · 用"近期请假"作为唯一时间线——和学生最相关的活动数据
 *   · counselor / dean 调 /students-me 会拿 null，显示空态而非崩溃
 */

interface FieldEntry {
  label: string;
  value: string;
}

function nonEmpty(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function buildBasicFields(s: MyStudent): FieldEntry[] {
  return [
    { label: '学号', value: s.student_no || '—' },
    { label: '姓名', value: s.name || '—' },
    { label: '性别', value: s.gender === 'male' ? '男' : s.gender === 'female' ? '女' : (s.gender || '—') },
    { label: '学院', value: s.college || '—' },
    { label: '专业', value: s.major || '—' },
    { label: '班级', value: s.class_name || '—' },
    { label: '年级', value: s.grade || '—' },
    { label: '学历', value: s.education_level || '—' },
    { label: '入学时间', value: s.enrollment_date?.slice(0, 10) || '—' },
  ].filter((f) => f.value !== '');
}

function buildContactFields(s: MyStudent, ext: Record<string, unknown>): FieldEntry[] {
  // phone / email 优先用 student 表的（更权威）；extended_info 里的"紧急联系人"
  // 来自学生自助登记，与之分开展示，便于辅导员核对
  const out: FieldEntry[] = [];
  if (s.phone) out.push({ label: '手机', value: s.phone });
  if (s.email) out.push({ label: '邮箱', value: s.email });
  const econ = nonEmpty(ext.emergency_contact_name);
  const ephone = nonEmpty(ext.emergency_contact);
  if (econ) out.push({ label: '紧急联系人', value: econ });
  if (ephone) out.push({ label: '紧急联系电话', value: ephone });
  return out;
}

/**
 * 渲染 extended_info 里所有"未在 contact 段被消费"的剩余字段。
 * 标签做了一份 best-effort 翻译，没匹配上就显示原 key。
 */
const EXT_LABEL_MAP: Record<string, string> = {
  hometown: '籍贯',
  ethnicity: '民族',
  political_status: '政治面貌',
  dormitory: '宿舍',
  bank_account: '银行账号',
  id_card_no: '身份证号',
  bed_no: '床位号',
};

function buildOtherExt(ext: Record<string, unknown>): FieldEntry[] {
  const skip = new Set(['emergency_contact', 'emergency_contact_name']);
  const out: FieldEntry[] = [];
  for (const [k, v] of Object.entries(ext)) {
    if (skip.has(k)) continue;
    const value = nonEmpty(v);
    if (!value) continue;
    out.push({ label: EXT_LABEL_MAP[k] ?? k, value });
  }
  return out;
}

export default function MyProfilePage() {
  const [student, setStudent] = useState<MyStudent | null>(null);
  const [ext, setExt] = useState<Record<string, unknown>>({});
  const [recentLeaves, setRecentLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notStudent, setNotStudent] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, e, leaves] = await Promise.all([
        getMyStudent().catch(() => null),
        getMyExtendedInfo().catch(() => ({})),
        listMyLeaves({ page: 1, size: 5 }).catch(() => ({ data: [] as LeaveRequest[], total: 0 })),
      ]);
      if (!s) {
        setNotStudent(true);
      } else {
        setStudent(s);
        setExt(e ?? {});
        setRecentLeaves(leaves.data ?? []);
      }
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useDidShow(() => { load(); });

  if (loading) {
    return (
      <View className={styles.page}>
        <View className={styles.empty}>加载中…</View>
      </View>
    );
  }

  if (notStudent) {
    return (
      <View className={styles.page}>
        <View className={styles.empty}>
          <Text className={styles.emptyText}>当前账号不是学生身份</Text>
          <Text className={styles.emptySub}>仅学生可查看个人档案</Text>
        </View>
      </View>
    );
  }

  if (!student) {
    return (
      <View className={styles.page}>
        <View className={styles.empty}>未找到档案</View>
      </View>
    );
  }

  const basicFields = buildBasicFields(student);
  const contactFields = buildContactFields(student, ext);
  const otherExt = buildOtherExt(ext);
  const statusZh = STATUS_LABELS[student.status] ?? student.status;
  const statusTone =
    student.status === 'active' ? 'ok'
    : student.status === 'suspended' ? 'warn'
    : student.status === 'withdrawn' ? 'danger'
    : 'muted';

  return (
    <View className={styles.page}>
      <ScrollView scrollY className={styles.scroll}>
        {/* ── Hero ─────────────────────────────────── */}
        <View className={styles.hero}>
          <Text className={styles.heroEyebrow}>
            <Text className="num">{student.student_no}</Text>
          </Text>
          <Text className={`${styles.heroName} display`}>{student.name}</Text>
          <View className={styles.heroMetaRow}>
            <Text className={`${styles.statusPill} ${styles[`tone_${statusTone}`]}`}>
              {statusZh}
            </Text>
            <Text className={styles.heroSub}>
              {[student.college, student.class_name].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {/* ── 基本信息 ─────────────────────────────── */}
        <View className={styles.sectionHead}>
          <Text className={styles.sectionTitle}>基本信息</Text>
        </View>
        <View className={styles.card}>
          {basicFields.map((f, i) => (
            <View key={f.label}>
              {i > 0 && <View className={styles.divider} />}
              <View className={styles.row}>
                <Text className={styles.rowLabel}>{f.label}</Text>
                <Text className={styles.rowValue}>{f.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── 联系方式 ─────────────────────────────── */}
        {contactFields.length > 0 && (
          <>
            <View className={styles.sectionHead}>
              <Text className={styles.sectionTitle}>联系方式</Text>
            </View>
            <View className={styles.card}>
              {contactFields.map((f, i) => (
                <View key={f.label}>
                  {i > 0 && <View className={styles.divider} />}
                  <View className={styles.row}>
                    <Text className={styles.rowLabel}>{f.label}</Text>
                    <Text className={styles.rowValue}>{f.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── 其它附加信息 ─────────────────────────── */}
        {otherExt.length > 0 && (
          <>
            <View className={styles.sectionHead}>
              <Text className={styles.sectionTitle}>附加信息</Text>
            </View>
            <View className={styles.card}>
              {otherExt.map((f, i) => (
                <View key={f.label}>
                  {i > 0 && <View className={styles.divider} />}
                  <View className={styles.row}>
                    <Text className={styles.rowLabel}>{f.label}</Text>
                    <Text className={styles.rowValue}>{f.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── 近期请假（替代 web 的 alerts/violations 时间线，更适合学生自查） ── */}
        <View className={styles.sectionHead}>
          <Text className={styles.sectionTitle}>近期请假</Text>
          <Text className={styles.sectionDate}>
            {recentLeaves.length > 0 ? `近 ${recentLeaves.length} 条` : '暂无'}
          </Text>
        </View>
        {recentLeaves.length === 0 ? (
          <View className={styles.empty}>
            <Text className={styles.emptySub}>暂无请假记录</Text>
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
                  <Text className={`${styles.leaveStatus} ${styles[`tone_${tone}`]}`}>
                    {LEAVE_STATUS_LABELS[l.status]}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View className={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}
