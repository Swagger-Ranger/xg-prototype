import { useEffect, useMemo, useRef, useState } from 'react';
import { Picker, Text, Textarea, View, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import {
  applyLeave,
  getLeaveNoticeConfig,
  getLeaveTypes,
  getMyTermUsage,
  previewLeaveImpact,
  type LeaveExtraField,
  type LeaveImpactView,
  type LeaveNoticeConfig,
  type LeaveTermUsage,
  type LeaveTypeConfig,
} from '../../../api/leave';
import type { MiniUser } from '../../../api/auth';
import styles from './index.module.css';

/* 申请请假 — Apple 玻璃感 × Form archetype。
 * 字段：假别 / 时长模式 + 段选 / 原因 / 假别动态字段 / 提交（含定位）。
 * 半日制:单日选 上午/下午/全天(0.5/0.5/1);跨天起始日只能 下午/全天,结束日只能 上午/全天。
 */

type ExtraValue = string | number | boolean;
type LeaveMode = 'single' | 'range';
type SingleSeg = 'AM' | 'PM' | 'FULL';
type StartSeg = 'PM' | 'FULL';
type EndSeg = 'AM' | 'FULL';

interface FormState {
  leave_type_code: string;
  mode: LeaveMode;
  single_date: string;   // YYYY-MM-DD
  single_seg: SingleSeg;
  start_date: string;
  start_seg: StartSeg;
  end_date: string;
  end_seg: EndSeg;
  reason: string;
  extra: Record<string, ExtraValue>;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 把 YYYY-MM-DD + HH:mm 拼成本地 Date。 */
function combineDateTime(date: string, hour: number, minute: number): Date | null {
  if (!date) return null;
  const [yy, mm, dd] = date.split('-').map(Number);
  const d = new Date(yy, (mm ?? 1) - 1, dd ?? 1, hour, minute, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 段选 → 起止时分 (匹配后端 slot 边界:上午 09-12,下午 13-18)。 */
const SLOT_START_HM = { AM: [9, 0], PM: [13, 0] } as const;
const SLOT_END_HM = { AM: [12, 0], PM: [18, 0] } as const;

function resolveTimes(form: FormState): { start: Date; end: Date; days: number } | null {
  if (form.mode === 'single') {
    if (!form.single_date) return null;
    if (form.single_seg === 'FULL') {
      const s = combineDateTime(form.single_date, 9, 0);
      const e = combineDateTime(form.single_date, 18, 0);
      return s && e ? { start: s, end: e, days: 1 } : null;
    }
    const [sh, sm] = SLOT_START_HM[form.single_seg];
    const [eh, em] = SLOT_END_HM[form.single_seg];
    const s = combineDateTime(form.single_date, sh, sm);
    const e = combineDateTime(form.single_date, eh, em);
    return s && e ? { start: s, end: e, days: 0.5 } : null;
  }
  if (!form.start_date || !form.end_date) return null;
  if (form.end_date <= form.start_date) return null;
  const [sh, sm] = form.start_seg === 'PM' ? SLOT_START_HM.PM : SLOT_START_HM.AM;
  const [eh, em] = form.end_seg === 'AM' ? SLOT_END_HM.AM : SLOT_END_HM.PM;
  const s = combineDateTime(form.start_date, sh, sm);
  const e = combineDateTime(form.end_date, eh, em);
  if (!s || !e) return null;
  const startDay = form.start_seg === 'PM' ? 0.5 : 1;
  const endDay = form.end_seg === 'AM' ? 0.5 : 1;
  // 中间整天数:end - start - 1 天
  const oneDay = 86400000;
  const middle = Math.max(0, Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / oneDay) - 1);
  return { start: s, end: e, days: startDay + middle + endDay };
}

export default function ApplyLeavePage() {
  const [types, setTypes] = useState<LeaveTypeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 「请假须知」配置 —— 只对学生角色生效;老师/辅导员代请假不弹。
  // 当前 mini 端只有学生走这个 apply 页(辅导员代请假在 web/审批后台),
  // 但仍按角色判定一次,避免后续路由扩展踩坑。
  const isStudent = useMemo(() => {
    const u = Taro.getStorageSync('user') as MiniUser | undefined;
    return Array.isArray(u?.roleCodes) && u!.roleCodes.includes('student');
  }, []);
  const [noticeCfg, setNoticeCfg] = useState<LeaveNoticeConfig | null>(null);
  const [showNotice, setShowNotice] = useState(false);
  const [showCommitment, setShowCommitment] = useState(false);
  const [commitmentChecked, setCommitmentChecked] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const noticeShownRef = useRef(false);

  const initial = todayISO();
  const [form, setForm] = useState<FormState>({
    leave_type_code: '',
    mode: 'single',
    single_date: initial,
    single_seg: 'FULL',
    start_date: initial,
    start_seg: 'FULL',
    end_date: initial,
    end_seg: 'FULL',
    reason: '',
    extra: {},
  });

  useEffect(() => {
    let cancelled = false;

    // AI 路径预填（store dispatchAction 写入 storage 后跳到这里读 + 清）
    // 字段：leave_type / start_date / end_date / reason / reason_category
    const prefill = Taro.getStorageSync('_leave_apply_prefill') as Record<string, unknown> | '';
    if (prefill && typeof prefill === 'object') {
      Taro.removeStorageSync('_leave_apply_prefill');
      const lt = typeof prefill.leave_type === 'string' ? prefill.leave_type : undefined;
      const sd = typeof prefill.start_date === 'string' ? prefill.start_date : undefined;
      const ed = typeof prefill.end_date === 'string' ? prefill.end_date : undefined;
      const rs = typeof prefill.reason === 'string' ? prefill.reason : undefined;
      // AI 不传段选,统一按"全天"段填(最常见、最不引起歧义),学生可在表单里改成半天。
      setForm((p) => {
        const next = { ...p };
        if (lt) next.leave_type_code = lt;
        if (rs) next.reason = rs;
        if (sd && ed && ed > sd) {
          next.mode = 'range';
          next.start_date = sd;
          next.start_seg = 'FULL';
          next.end_date = ed;
          next.end_seg = 'FULL';
        } else if (sd) {
          next.mode = 'single';
          next.single_date = sd;
          next.single_seg = 'FULL';
        }
        return next;
      });
    }

    // 仅学生身份拉「请假须知」配置;非学生跳过整套弹窗。
    if (isStudent) {
      getLeaveNoticeConfig()
        .then((cfg) => {
          setNoticeCfg(cfg);
          if (cfg.notice_enabled && !noticeShownRef.current) {
            noticeShownRef.current = true;
            setShowNotice(true);
          }
        })
        .catch(() => {
          // 拉配置失败 -> 走零打扰路径,不阻断请假流程
        });
    }

    setLoading(true);
    getLeaveTypes()
      .then((res) => {
        if (cancelled) return;
        const enabled = res.filter((t) => t.enabled);
        setTypes(enabled);
        // 仅当 prefill 没指定假别时回退到第一个
        setForm((p) => {
          if (p.leave_type_code) return p;
          if (enabled.length > 0) return { ...p, leave_type_code: enabled[0].code };
          return p;
        });
      })
      .catch((e: Error) => {
        Taro.showToast({ title: e.message || '加载假别失败', icon: 'none' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedType = useMemo(
    () => types.find((t) => t.code === form.leave_type_code) ?? null,
    [types, form.leave_type_code],
  );
  const extraFields: LeaveExtraField[] = selectedType?.extra_fields ?? [];

  // 半日段选 → 起止时刻 + 总天数(0.5 倍数)。
  const resolved = useMemo(() => resolveTimes(form), [
    form.mode, form.single_date, form.single_seg,
    form.start_date, form.start_seg, form.end_date, form.end_seg,
  ]);
  const durationDays = resolved?.days ?? 0;

  // 本学期累计请假 — 常驻卡片消费(总天数 / by_type / recent_count_30d / exceeded)。
  const [termUsage, setTermUsage] = useState<LeaveTermUsage | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyTermUsage()
      .then((d) => { if (!cancelled) setTermUsage(d); })
      .catch(() => { if (!cancelled) setTermUsage(null); });
    return () => { cancelled = true; };
  }, []);

  // 选完起止时间后实时预览会缺的课程。
  const [impact, setImpact] = useState<LeaveImpactView | null>(null);
  useEffect(() => {
    if (!resolved) { setImpact(null); return; }
    let cancelled = false;
    previewLeaveImpact(resolved.start.toISOString(), resolved.end.toISOString())
      .then((d) => { if (!cancelled) setImpact(d); })
      .catch(() => { if (!cancelled) setImpact(null); });
    return () => { cancelled = true; };
  }, [resolved?.start.getTime(), resolved?.end.getTime()]);

  const impactCourseNames = useMemo(() => {
    if (!impact) return [];
    const seen = new Set<string>();
    for (const d of impact.by_day) {
      for (const c of d.courses) if (c.course_name) seen.add(c.course_name);
    }
    return Array.from(seen);
  }, [impact]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
  };

  const setExtra = (key: string, value: ExtraValue) => {
    setForm((p) => ({ ...p, extra: { ...p.extra, [key]: value } }));
  };

  const onSelectType = (e: { detail: { value: string | number } }) => {
    const idx = Number(e.detail.value);
    const t = types[idx];
    if (!t) return;
    // 切换假别时，清空 extra（避免上一假别字段串入）
    setForm((p) => ({ ...p, leave_type_code: t.code, extra: {} }));
  };

  const validate = (): string | null => {
    if (!form.leave_type_code) return '请选择假别';
    if (!resolved) {
      return form.mode === 'range' ? '结束日必须晚于起始日' : '请选择请假日期';
    }
    if (resolved.days > 30) return '请假时长不得超过 30 天';
    if (!form.reason.trim()) return '请填写请假原因';
    for (const f of extraFields) {
      if (f.required) {
        const v = form.extra[f.field_key];
        if (v == null || v === '') return `请填写「${f.field_label}」`;
      }
    }
    return null;
  };

  const getLocation = (): Promise<{ latitude: number; longitude: number; capturedAt: string } | null> =>
    new Promise((resolve) => {
      Taro.getLocation({
        type: 'gcj02',
        success: (r) => resolve({
          latitude: r.latitude,
          longitude: r.longitude,
          capturedAt: new Date().toISOString(),
        }),
        fail: () => resolve(null),
      });
    });

  const doSubmit = async () => {
    if (!resolved) {
      Taro.showToast({ title: '请假时间未填完整', icon: 'none' });
      return;
    }
    setSubmitting(true);
    const loc = await getLocation();
    if (!loc) {
      Taro.showToast({ title: '未获取到定位，仍会提交', icon: 'none' });
    }
    try {
      await applyLeave({
        leave_type_code: form.leave_type_code,
        start_time: resolved.start.toISOString(),
        end_time: resolved.end.toISOString(),
        reason: form.reason.trim(),
        extra_data: { ...form.extra },
        ...(loc
          ? {
              apply_latitude: loc.latitude,
              apply_longitude: loc.longitude,
              apply_location_at: loc.capturedAt,
            }
          : {}),
      });
      Taro.showToast({ title: '已提交', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 600);
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = () => {
    const err = validate();
    if (err) {
      Taro.showToast({ title: err, icon: 'none' });
      return;
    }
    // 学生 + 启用承诺书 -> 先弹承诺书,签字后再调真正的提交
    if (isStudent && noticeCfg?.commitment_enabled) {
      const sec = Math.max(0, noticeCfg.commitment_countdown_sec ?? 3);
      setCommitmentChecked(false);
      setCountdown(sec);
      setShowCommitment(true);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      if (sec > 0) {
        countdownTimer.current = setInterval(() => {
          setCountdown((n) => {
            if (n <= 1) {
              if (countdownTimer.current) {
                clearInterval(countdownTimer.current);
                countdownTimer.current = null;
              }
              return 0;
            }
            return n - 1;
          });
        }, 1000);
      }
      return;
    }
    void doSubmit();
  };

  const onConfirmCommitment = () => {
    if (countdown > 0 || !commitmentChecked) return;
    setShowCommitment(false);
    void doSubmit();
  };

  const onCancelCommitment = () => {
    setShowCommitment(false);
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, []);

  const typeIdx = Math.max(0, types.findIndex((t) => t.code === form.leave_type_code));
  const typeRange = types.map((t) => t.name);

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={`${styles.heroTitle} display`}>申请请假</Text>
        <Text className={styles.heroSubtitle}>
          {loading ? '加载中…' : `${types.length} 个假别可选`}
        </Text>
      </View>

      {termUsage && (
        <View
          className={`${styles.termUsage} ${termUsage.exceeded && termUsage.cap_days != null ? styles.termUsageExceeded : ''}`}
        >
          <View className={styles.termUsageRow}>
            <Text className={styles.termUsageMain}>
              {termUsage.term_name ?? '当前学期外'}·本学期累计{' '}
              <Text className={`num ${styles.termUsageNum}`}>{termUsage.accumulated_days}</Text>
              {' '}天
              {termUsage.cap_days != null && (
                <Text className={styles.termUsageCap}>
                  {' '}/ 上限 <Text className="num">{termUsage.cap_days}</Text> 天
                </Text>
              )}
            </Text>
            <Text className={styles.termUsageRecent}>
              近 30 天 <Text className="num">{termUsage.recent_count_30d}</Text> 次
            </Text>
          </View>
          {termUsage.by_type.length > 0 && (
            <View className={styles.termUsageChips}>
              {termUsage.by_type.map((t) => (
                <View key={t.code} className={styles.termUsageChip}>
                  <Text className={styles.termUsageChipText}>
                    {t.name} <Text className="num">{t.days}</Text> 天
                  </Text>
                </View>
              ))}
            </View>
          )}
          {termUsage.exceeded && termUsage.cap_days != null && (
            <Text className={styles.termUsageWarn}>
              已超出全校上限,本次申请仍可提交,但会被标记为高风险。
            </Text>
          )}
        </View>
      )}

      {/* ── 假别 ──────────────────────────────────────── */}
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>假别</Text>
        <Picker
          mode="selector"
          range={typeRange}
          value={typeIdx}
          onChange={onSelectType}
          disabled={types.length === 0}
        >
          <View className={styles.pickerCell}>
            <Text className={styles.pickerValue}>
              {selectedType?.name ?? (loading ? '加载中…' : '请选择')}
            </Text>
            <Text className={styles.pickerArrow}>›</Text>
          </View>
        </Picker>
      </View>

      {/* ── 时长(模式 + 日期 + 段选) ─────────────────────── */}
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>请假时长</Text>
        <SegmentedRow<LeaveMode>
          options={[
            { label: '单日', value: 'single' },
            { label: '跨天', value: 'range' },
          ]}
          value={form.mode}
          onChange={(v) => setField('mode', v)}
        />

        {form.mode === 'single' ? (
          <View className={styles.modeBlock}>
            <Picker
              mode="date"
              value={form.single_date}
              onChange={(e) => setField('single_date', String(e.detail.value))}
            >
              <View className={`${styles.pickerCell} ${styles.pickerCellInline}`}>
                <Text className={`${styles.pickerValue} num`}>{form.single_date}</Text>
              </View>
            </Picker>
            <View className={styles.segGap}>
              <SegmentedRow<SingleSeg>
                options={[
                  { label: '上午 0.5d', value: 'AM' },
                  { label: '下午 0.5d', value: 'PM' },
                  { label: '全天 1d', value: 'FULL' },
                ]}
                value={form.single_seg}
                onChange={(v) => setField('single_seg', v)}
              />
            </View>
          </View>
        ) : (
          <View className={styles.modeBlock}>
            <Text className={styles.subLabel}>起始日</Text>
            <Picker
              mode="date"
              value={form.start_date}
              onChange={(e) => setField('start_date', String(e.detail.value))}
            >
              <View className={`${styles.pickerCell} ${styles.pickerCellInline}`}>
                <Text className={`${styles.pickerValue} num`}>{form.start_date}</Text>
              </View>
            </Picker>
            <View className={styles.segGap}>
              <SegmentedRow<StartSeg>
                options={[
                  { label: '下午开始 0.5d', value: 'PM' },
                  { label: '全天 1d', value: 'FULL' },
                ]}
                value={form.start_seg}
                onChange={(v) => setField('start_seg', v)}
              />
            </View>
            <Text className={`${styles.subLabel} ${styles.subLabelGap}`}>结束日</Text>
            <Picker
              mode="date"
              value={form.end_date}
              start={form.start_date}
              onChange={(e) => setField('end_date', String(e.detail.value))}
            >
              <View className={`${styles.pickerCell} ${styles.pickerCellInline}`}>
                <Text className={`${styles.pickerValue} num`}>{form.end_date}</Text>
              </View>
            </Picker>
            <View className={styles.segGap}>
              <SegmentedRow<EndSeg>
                options={[
                  { label: '上午结束 0.5d', value: 'AM' },
                  { label: '全天 1d', value: 'FULL' },
                ]}
                value={form.end_seg}
                onChange={(v) => setField('end_seg', v)}
              />
            </View>
          </View>
        )}

        <View className={styles.durationHint}>
          <Text className={styles.durationLabel}>请假天数</Text>
          <Text className={styles.durationValue}>
            <Text className="num">{durationDays}</Text>
            <Text className={styles.durationUnit}> 天</Text>
          </Text>
        </View>
        {impact && impact.total_periods > 0 && (
          <View className={styles.impactHint}>
            <Text className={styles.impactText}>
              该时段会缺{' '}
              <Text className={`${styles.impactNum} num`}>{impact.total_periods}</Text>{' '}
              节课(<Text className={`${styles.impactNum} num`}>{impact.total_courses}</Text> 门):
              {impactCourseNames.slice(0, 3).join('、')}
              {impactCourseNames.length > 3 ? '…' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── 原因 ──────────────────────────────────────── */}
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>请假原因</Text>
        <View className={styles.textareaCell}>
          <Textarea
            className={styles.textarea}
            value={form.reason}
            onInput={(e) => setField('reason', e.detail.value)}
            placeholder="请简要说明请假原因"
            maxlength={500}
            autoHeight
          />
        </View>
      </View>

      {/* ── 假别动态字段 ───────────────────────────────── */}
      {extraFields.length > 0 && (
        <View className={styles.sectionGroup}>
          <Text className={styles.sectionGroupLabel}>{selectedType?.name} 附加信息</Text>
          {extraFields.map((f) => (
            <ExtraFieldRow
              key={f.field_key}
              field={f}
              value={form.extra[f.field_key]}
              onChange={(v) => setExtra(f.field_key, v)}
            />
          ))}
        </View>
      )}

      <View className={styles.actionWrap}>
        <View
          className={`${styles.submit} ${submitting ? styles.submitBusy : ''} tap-min`}
          onClick={submitting ? undefined : onSubmit}
        >
          <Text className={styles.submitLabel}>{submitting ? '提交中…' : '提交申请'}</Text>
        </View>
      </View>

      {/* ── 进入请假页一次性「说明」 ─────────────────────── */}
      {showNotice && noticeCfg?.notice_enabled && (
        <View className={styles.modalMask} catchMove>
          <View className={styles.modalCard}>
            <View className={styles.modalHeader}>
              <Text className={`${styles.modalTitle} display`}>请假说明</Text>
            </View>
            <View className={styles.modalBody}>
              <Text className={styles.modalText}>{noticeCfg.notice_text}</Text>
            </View>
            <View className={styles.modalFooter}>
              <View className={styles.modalActions}>
                <View
                  className={`${styles.modalBtn} ${styles.modalBtnPrimary} tap-min`}
                  onClick={() => setShowNotice(false)}
                >
                  <Text>我知道了</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── 提交前「承诺书」(复选框 + 倒计时) ─────────────── */}
      {showCommitment && noticeCfg?.commitment_enabled && (
        <View className={styles.modalMask} catchMove>
          <View className={styles.modalCard}>
            <View className={styles.modalHeader}>
              <Text className={`${styles.modalTitle} display`}>请假承诺书</Text>
            </View>
            <View className={styles.modalBody}>
              <Text className={styles.modalText}>{noticeCfg.commitment_text}</Text>
            </View>
            <View className={styles.modalFooter}>
              <View
                className={`${styles.modalCheckRow} ${
                  countdown > 0 ? styles.modalCheckRowDisabled : ''
                }`}
                onClick={() => {
                  if (countdown > 0) return;
                  setCommitmentChecked((v) => !v);
                }}
              >
                <View
                  className={`${styles.modalCheckBox} ${
                    commitmentChecked ? styles.modalCheckBoxChecked : ''
                  }`}
                >
                  {commitmentChecked && <Text className={styles.modalCheckMark}>✓</Text>}
                </View>
                <Text>本人已阅读并同意全部内容</Text>
              </View>
              {countdown > 0 && (
                <Text className={styles.modalCountdownHint}>
                  请认真阅读,
                  <Text className="num"> {countdown} </Text>秒后可勾选确认
                </Text>
              )}
              <View className={styles.modalActions}>
                <View
                  className={`${styles.modalBtn} ${styles.modalBtnGhost} tap-min`}
                  onClick={onCancelCommitment}
                >
                  <Text>取消</Text>
                </View>
                <View
                  className={`${styles.modalBtn} ${styles.modalBtnPrimary} tap-min ${
                    countdown > 0 || !commitmentChecked ? styles.modalBtnDisabled : ''
                  }`}
                  onClick={onConfirmCommitment}
                >
                  <Text>同意并提交</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

/** 段选组件 — Taro 没原生 Segmented,用 View 自实现。
 * 选中态用白色背景 + 弱阴影,不消耗 --ac accent 预算。 */
function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className={styles.segmented}>
      {options.map((opt) => (
        <View
          key={opt.value}
          className={`${styles.segOpt} ${value === opt.value ? styles.segOptActive : ''} tap-min`}
          onClick={() => onChange(opt.value)}
        >
          <Text className={styles.segOptLabel}>{opt.label}</Text>
        </View>
      ))}
    </View>
  );
}

function ExtraFieldRow({
  field,
  value,
  onChange,
}: {
  field: LeaveExtraField;
  value: ExtraValue | undefined;
  onChange: (v: ExtraValue) => void;
}) {
  const valueStr = value == null ? '' : String(value);

  if (field.field_type === 'select' && field.options && field.options.length > 0) {
    const idx = Math.max(0, field.options.indexOf(valueStr));
    return (
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>
          {field.field_label}
          {field.required && <Text className={styles.required}> *</Text>}
        </Text>
        <Picker
          mode="selector"
          range={field.options}
          value={idx}
          onChange={(e) => onChange(field.options![Number(e.detail.value)])}
        >
          <View className={styles.pickerCell}>
            <Text className={`${styles.pickerValue} ${!valueStr ? styles.pickerPlaceholder : ''}`}>
              {valueStr || '请选择'}
            </Text>
            <Text className={styles.pickerArrow}>›</Text>
          </View>
        </Picker>
      </View>
    );
  }

  if (field.field_type === 'date') {
    return (
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>
          {field.field_label}
          {field.required && <Text className={styles.required}> *</Text>}
        </Text>
        <Picker
          mode="date"
          value={valueStr || todayISO()}
          onChange={(e) => onChange(String(e.detail.value))}
        >
          <View className={styles.pickerCell}>
            <Text className={`${styles.pickerValue} num ${!valueStr ? styles.pickerPlaceholder : ''}`}>
              {valueStr || '请选择'}
            </Text>
            <Text className={styles.pickerArrow}>›</Text>
          </View>
        </Picker>
      </View>
    );
  }

  if (field.field_type === 'number') {
    return (
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>
          {field.field_label}
          {field.required && <Text className={styles.required}> *</Text>}
        </Text>
        <View className={styles.inputCell}>
          <Input
            className={styles.input}
            type="digit"
            value={valueStr}
            onInput={(e) => onChange(e.detail.value)}
            placeholder={field.placeholder ?? '请输入'}
          />
        </View>
      </View>
    );
  }

  if (field.field_type === 'file') {
    // file 字段在 mini P0 不支持上传，给出明确提示，避免静默失败
    return (
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>{field.field_label}</Text>
        <View className={`${styles.inputCell} ${styles.inputDisabled}`}>
          <Text className={styles.disabledHint}>请前往 PC 端上传附件</Text>
        </View>
      </View>
    );
  }

  // text 默认
  const isLong = field.field_widget === 'textarea' || (field.max_length ?? 0) > 80;
  return (
    <View className={styles.section}>
      <Text className={styles.sectionLabel}>
        {field.field_label}
        {field.required && <Text className={styles.required}> *</Text>}
      </Text>
      {isLong ? (
        <View className={styles.textareaCell}>
          <Textarea
            className={styles.textarea}
            value={valueStr}
            onInput={(e) => onChange(e.detail.value)}
            placeholder={field.placeholder ?? '请输入'}
            maxlength={field.max_length ?? 500}
            autoHeight
          />
        </View>
      ) : (
        <View className={styles.inputCell}>
          <Input
            className={styles.input}
            value={valueStr}
            onInput={(e) => onChange(e.detail.value)}
            placeholder={field.placeholder ?? '请输入'}
            maxlength={field.max_length ?? 200}
          />
        </View>
      )}
    </View>
  );
}
