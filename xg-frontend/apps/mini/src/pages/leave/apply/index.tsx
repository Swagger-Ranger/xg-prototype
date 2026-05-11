import { useEffect, useMemo, useRef, useState } from 'react';
import { Picker, Text, Textarea, View, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import {
  applyLeave,
  calculateDurationDays,
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
 * 字段：假别 / 起止 / 时长(只读) / 原因 / 假别动态字段 / 提交（含定位）
 */

type ExtraValue = string | number | boolean;

interface FormState {
  leave_type_code: string;
  start_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_date: string;
  end_time: string;
  reason: string;
  extra: Record<string, ExtraValue>;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function combineDateTime(date: string, time: string): Date | null {
  if (!date) return null;
  const [yy, mm, dd] = date.split('-').map(Number);
  const [h = 0, m = 0] = (time || '00:00').split(':').map(Number);
  const d = new Date(yy, (mm ?? 1) - 1, dd ?? 1, h, m, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
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
    start_date: initial,
    start_time: '08:00',
    end_date: initial,
    end_time: '18:00',
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
      setForm((p) => ({
        ...p,
        leave_type_code: lt ?? p.leave_type_code,
        start_date: sd ?? p.start_date,
        end_date: ed ?? sd ?? p.end_date,  // 单日时 end 跟 start
        reason: rs ?? p.reason,
      }));
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

  // 时长(工作时段 8h=1天,每天都按工作日切,不区分周末/节假日)
  const durationDays = useMemo(() => {
    const start = combineDateTime(form.start_date, form.start_time);
    const end = combineDateTime(form.end_date, form.end_time);
    if (!start || !end) return 0;
    return calculateDurationDays(start.getTime(), end.getTime());
  }, [form.start_date, form.start_time, form.end_date, form.end_time]);

  // 本学期累计请假天数(全部假别合计)+ 是否超全局上限。仅在 cap 配置过且超过时
  // 顶部红条提示;申请仍可提交,但会被自动标记为高风险供审批人参考。
  const [termUsage, setTermUsage] = useState<LeaveTermUsage | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyTermUsage()
      .then((d) => { if (!cancelled) setTermUsage(d); })
      .catch(() => { if (!cancelled) setTermUsage(null); });
    return () => { cancelled = true; };
  }, []);

  // 选完起止时间后实时预览会缺的课程。后端按 X-User-Id 取 student_id 算,
  // 非学生 / 无课表 / 学期间隙都返回 zero 视图,UI 按 total_periods 判空态。
  const [impact, setImpact] = useState<LeaveImpactView | null>(null);
  useEffect(() => {
    const start = combineDateTime(form.start_date, form.start_time);
    const end = combineDateTime(form.end_date, form.end_time);
    if (!start || !end || end.getTime() <= start.getTime()) {
      setImpact(null);
      return;
    }
    let cancelled = false;
    previewLeaveImpact(start.toISOString(), end.toISOString())
      .then((d) => { if (!cancelled) setImpact(d); })
      .catch(() => { if (!cancelled) setImpact(null); });
    return () => { cancelled = true; };
  }, [form.start_date, form.start_time, form.end_date, form.end_time]);

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
    const start = combineDateTime(form.start_date, form.start_time);
    const end = combineDateTime(form.end_date, form.end_time);
    if (!start || !end) return '请选择请假时间';
    if (end.getTime() <= start.getTime()) return '结束时间必须晚于开始时间';
    if (durationDays > 30) return '请假时长不得超过 30 个工作日';
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
    const start = combineDateTime(form.start_date, form.start_time)!;
    const end = combineDateTime(form.end_date, form.end_time)!;
    setSubmitting(true);
    const loc = await getLocation();
    if (!loc) {
      Taro.showToast({ title: '未获取到定位，仍会提交', icon: 'none' });
    }
    try {
      await applyLeave({
        leave_type_code: form.leave_type_code,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
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

      {termUsage?.exceeded && termUsage.cap_days != null && (
        <View className={styles.termCapAlert}>
          <Text className={styles.termCapAlertTitle}>
            本学期已累计请假 {termUsage.accumulated_days} 天,超出全校上限 {termUsage.cap_days} 天
          </Text>
          <Text className={styles.termCapAlertDesc}>
            本次申请仍可提交,但会被自动标记为高风险,辅导员审批时会重点关注。
          </Text>
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

      {/* ── 时间 ──────────────────────────────────────── */}
      <View className={styles.section}>
        <Text className={styles.sectionLabel}>开始时间</Text>
        <View className={styles.dateRow}>
          <Picker
            mode="date"
            value={form.start_date}
            onChange={(e) => setField('start_date', String(e.detail.value))}
          >
            <View className={`${styles.pickerCell} ${styles.pickerCellInline}`}>
              <Text className={`${styles.pickerValue} num`}>{form.start_date}</Text>
            </View>
          </Picker>
          <Picker
            mode="time"
            value={form.start_time}
            onChange={(e) => setField('start_time', String(e.detail.value))}
          >
            <View className={`${styles.pickerCell} ${styles.pickerCellInline}`}>
              <Text className={`${styles.pickerValue} num`}>{form.start_time}</Text>
            </View>
          </Picker>
        </View>
      </View>

      <View className={styles.section}>
        <Text className={styles.sectionLabel}>结束时间</Text>
        <View className={styles.dateRow}>
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
          <Picker
            mode="time"
            value={form.end_time}
            onChange={(e) => setField('end_time', String(e.detail.value))}
          >
            <View className={`${styles.pickerCell} ${styles.pickerCellInline}`}>
              <Text className={`${styles.pickerValue} num`}>{form.end_time}</Text>
            </View>
          </Picker>
        </View>
        <View className={styles.durationHint}>
          <Text className={styles.durationLabel}>请假天数</Text>
          <Text className={styles.durationValue}>
            <Text className="num">{durationDays}</Text>
            <Text className={styles.durationUnit}> 天</Text>
          </Text>
        </View>
        <View className={styles.durationFootnote}>
          <Text className={styles.durationFootnoteText}>
            按工作时段计:09:00–12:00 + 13:00–18:00,8 小时 = 1 天,午休不计。
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
