import { useEffect, useMemo, useRef } from 'react';
import { Modal, Form, Select, DatePicker, Input, Button, Segmented, Tooltip } from 'antd';
import { ReadOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdApp';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaveTypeConfig } from '@xg1/shared';
import {
  getLeaveTypes,
  applyLeave,
  leaveTypeFieldsToSchema,
  previewLeaveImpact,
  getMyTermUsage,
  getLeaveGlobalConfig,
  type LeaveApplyData,
  type LeaveImpactView,
  type LeaveTermUsage,
  type LeaveGlobalConfig,
} from '@/api/leave';
import { getMyExtendedInfo } from '@/api/student';
import { getCurrentLocation } from '@/utils/geolocation';
import { useAIActionStore } from '@/stores/ai-action.store';
import DynamicFormFields from '@/components/form/DynamicFormFields';
import LeaveTermUsageCard from './LeaveTermUsageCard';

const { TextArea } = Input;

/** 跟后端 LeaveCalendarService slot 口径对齐:每个被占用的半日 slot = 0.5 天。 */
const SLOT_HOURS = {
  startAM: [9, 0],
  startPM: [13, 0],
  endAM: [12, 0],
  endPM: [18, 0],
} as const;

type LeaveMode = 'single' | 'range';
type SingleSeg = 'AM' | 'PM' | 'FULL';
type StartSeg = 'PM' | 'FULL';
type EndSeg = 'AM' | 'FULL';

/** 把表单段选项映射成 (start_time, end_time) ISO 串 + 总天数(0.5 倍数)。 */
function resolveTimes(values: FormValues): { start: Dayjs; end: Dayjs; days: number } | null {
  const setHM = (d: Dayjs, [h, m]: readonly [number, number]) =>
    d.hour(h).minute(m).second(0).millisecond(0);

  if (values.leave_mode === 'single') {
    if (!values.single_date) return null;
    const d = values.single_date;
    if (values.single_seg === 'AM') return { start: setHM(d, SLOT_HOURS.startAM), end: setHM(d, SLOT_HOURS.endAM), days: 0.5 };
    if (values.single_seg === 'PM') return { start: setHM(d, SLOT_HOURS.startPM), end: setHM(d, SLOT_HOURS.endPM), days: 0.5 };
    return { start: setHM(d, SLOT_HOURS.startAM), end: setHM(d, SLOT_HOURS.endPM), days: 1 };
  }

  if (!values.start_date || !values.end_date) return null;
  if (!values.end_date.isAfter(values.start_date, 'day')) return null;
  const start = values.start_seg === 'PM'
    ? setHM(values.start_date, SLOT_HOURS.startPM)
    : setHM(values.start_date, SLOT_HOURS.startAM);
  const end = values.end_seg === 'AM'
    ? setHM(values.end_date, SLOT_HOURS.endAM)
    : setHM(values.end_date, SLOT_HOURS.endPM);
  const startDay = values.start_seg === 'PM' ? 0.5 : 1;
  const endDay = values.end_seg === 'AM' ? 0.5 : 1;
  const middle = Math.max(0, values.end_date.diff(values.start_date, 'day') - 1);
  return { start, end, days: startDay + middle + endDay };
}

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: Record<string, unknown>;
}

interface FormValues {
  leave_type_code: string;
  leave_mode: LeaveMode;
  single_date?: Dayjs;
  single_seg?: SingleSeg;
  start_date?: Dayjs;
  start_seg?: StartSeg;
  end_date?: Dayjs;
  end_seg?: EndSeg;
  reason: string;
  [key: string]: unknown;
}

export default function LeaveApplyModal({ open, onClose, prefill }: Props) {
  const [form] = Form.useForm<FormValues>();
  const queryClient = useQueryClient();
  const emitEvent = useAIActionStore((s) => s.emitEvent);

  // Capture the AI prediction snapshot the moment the form opens with prefill,
  // so we can ship it back to the backend on submit even after the user has
  // tweaked the fields. Cleared whenever the modal re-opens without prefill.
  const aiDraftSnapshotRef = useRef<LeaveApplyData['ai_draft'] | null>(null);

  const leaveTypeCode = Form.useWatch('leave_type_code', form);
  const leaveMode = Form.useWatch('leave_mode', form);
  const singleDate = Form.useWatch('single_date', form);
  const singleSeg = Form.useWatch('single_seg', form);
  const startDate = Form.useWatch('start_date', form);
  const startSeg = Form.useWatch('start_seg', form);
  const endDate = Form.useWatch('end_date', form);
  const endSeg = Form.useWatch('end_seg', form);

  const { data: leaveTypes = [] } = useQuery<LeaveTypeConfig[]>({
    queryKey: ['leaveTypes'],
    queryFn: getLeaveTypes,
    staleTime: 5 * 60 * 1000,
  });

  // 当前学生 student_profile.extended_info（紧急联系人电话等）。请假表单
  // 打开时自动回填到 _extra.*，让学生不用每次手填。后端非学生角色返回空对象。
  const { data: myExtended } = useQuery<Record<string, unknown>>({
    queryKey: ['myExtendedInfo'],
    queryFn: getMyExtendedInfo,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const selectedType = leaveTypes.find((t) => t.code === leaveTypeCode);

  const typeFieldsSchema = useMemo(
    () => leaveTypeFieldsToSchema(selectedType?.extra_fields),
    [selectedType?.extra_fields],
  );

  // 半日段选 → 总天数。跟后端 LeaveCalendarService slot-coverage 算法对齐,
  // 结果天然落在 0.5 倍数 (0.5 / 1 / 1.5 / 2 / ...)
  const resolved = useMemo(
    () => resolveTimes({
      leave_type_code: leaveTypeCode,
      leave_mode: leaveMode ?? 'single',
      single_date: singleDate,
      single_seg: singleSeg,
      start_date: startDate,
      start_seg: startSeg,
      end_date: endDate,
      end_seg: endSeg,
      reason: '',
    }),
    [leaveTypeCode, leaveMode, singleDate, singleSeg, startDate, startSeg, endDate, endSeg],
  );
  const durationDays = resolved?.days ?? 0;

  // 进入弹窗即拉本学期累计请假天数(全部假别合计)。超过全局上限时顶部红条
  // 软警告 + 同时被审批侧标记成高风险——不阻断提交。学生身份才有意义,辅导员
  // 帮学生代提交时也只显示自己的累计(代提交场景占比极低,改造太重不值得)。
  const { data: termUsage } = useQuery<LeaveTermUsage>({
    queryKey: ['leave.term-usage.my'],
    queryFn: getMyTermUsage,
    enabled: open,
    staleTime: 30 * 1000,
  });

  // 全局「证明材料」开关 = 是否展示证明材料 file 字段的总闸:
  //   toggle ON  → file 字段渲染并 required=true(Antd 默认在 label 前打红 *)
  //   toggle OFF → file 字段整个不渲染,学生看不到「证明材料」入口
  // 提交路径走 _typeExtra → extra_data.evidence,跟后端 FormDataValidator 看的字段一致。
  const { data: globalConfig } = useQuery<LeaveGlobalConfig>({
    queryKey: ['leaveGlobalConfig'],
    queryFn: getLeaveGlobalConfig,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const requireProof = globalConfig?.require_proof === true;
  const typeFieldsWithToggle = useMemo(
    () =>
      typeFieldsSchema
        .filter((f) => f.type !== 'file' || requireProof)
        .map((f) => (f.type === 'file' ? { ...f, required: true } : f)),
    [typeFieldsSchema, requireProof],
  );

  // 选完起止时间后实时预览会缺的课程。段选解析失败时不发请求。
  // 用 ISO 串作 query key,自动 dedup + 缓存。后端按 X-User-Id 取 student_id 算,
  // 非学生角色或学生没课表时返回 zero 视图,前端按 total_periods 判空态隐藏。
  const startIso = resolved?.start.toISOString();
  const endIso = resolved?.end.toISOString();
  const { data: impact } = useQuery<LeaveImpactView>({
    queryKey: ['leave.impact.preview', startIso, endIso],
    queryFn: () => previewLeaveImpact(startIso!, endIso!),
    enabled: open && !!startIso && !!endIso,
    staleTime: 30 * 1000,
  });

  const impactCourseNames = useMemo(() => {
    if (!impact) return [];
    const seen = new Set<string>();
    for (const d of impact.by_day) {
      for (const c of d.courses) if (c.course_name) seen.add(c.course_name);
    }
    return Array.from(seen);
  }, [impact]);

  const mutation = useMutation({
    mutationFn: applyLeave,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['myLeaves'] });
      queryClient.invalidateQueries({ queryKey: ['classLeaves'] });
      message.success('请假申请已提交');
      emitEvent('leave_submitted', {
        leave_type_code: variables.leave_type_code,
        reason: variables.reason,
        start_time: variables.start_time,
        end_time: variables.end_time,
      });
      form.resetFields();
      onClose();
    },
    onError: (err: unknown) => {
      const detail = err instanceof Error ? err.message : '';
      message.error(detail ? `请假申请提交失败：${detail}` : '请假申请提交失败，请重试');
    },
  });

  useEffect(() => {
    if (!open) {
      form.resetFields();
    }
  }, [open, form]);

  useEffect(() => {
    if (open && prefill) {
      const values: Record<string, unknown> = {};
      if (prefill.leave_type) values.leave_type_code = prefill.leave_type;
      if (prefill.reason) values.reason = prefill.reason;
      // AI 的 open_leave_form 只给 YYYY-MM-DD,默认按"全天"段填(最常见、最不引起歧义),
      // 学生可在 modal 里改成半天。单日 = single_date+FULL,跨天 = start_date+FULL/end_date+FULL。
      const sd = typeof prefill.start_date === 'string' ? dayjs(prefill.start_date) : null;
      const ed = typeof prefill.end_date === 'string' ? dayjs(prefill.end_date) : null;
      if (sd && ed && ed.isAfter(sd, 'day')) {
        values.leave_mode = 'range';
        values.start_date = sd;
        values.start_seg = 'FULL';
        values.end_date = ed;
        values.end_seg = 'FULL';
      } else if (sd) {
        values.leave_mode = 'single';
        values.single_date = sd;
        values.single_seg = 'FULL';
      }
      // AI 推断的 destination → 灌到 _extra.destination；CityCascaderField
      // 自身做模糊匹配，匹配不到会保留为文本提示用户重选。
      if (prefill.destination) {
        values._extra = { destination: prefill.destination };
      }
      // AI 从用户自然语言推断的事由分类（事假必选）→ _typeExtra.reason_category。
      // typeFieldsSchema 在 leave_type_code 变更后才出现，setFieldsValue 写入的
      // 值会被 antd Form store 暂存，等 Form.Item 挂载时自动拾取。
      if (prefill.reason_category) {
        values._typeExtra = { reason_category: prefill.reason_category };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.setFieldsValue(values as any);

      // Snapshot the AI prediction at open time. Submitted as ai_draft
      // alongside the (possibly user-edited) form values so analytics can
      // measure how often the user kept vs corrected what AI prefilled.
      const predicted: Record<string, unknown> = {};
      for (const key of ['leave_type', 'reason', 'start_date', 'end_date', 'destination', 'reason_category']) {
        if (prefill[key] != null) predicted[key] = prefill[key];
      }
      aiDraftSnapshotRef.current = {
        source: 'chat_agent',
        raw_input: typeof prefill._raw_input === 'string' ? prefill._raw_input : undefined,
        predicted_fields: predicted,
        generated_at: new Date().toISOString(),
      };

    } else if (open && !prefill) {
      aiDraftSnapshotRef.current = null;
    }
  }, [open, prefill, form]);

  // 把 student_profile.extended_info 里的字段填到 _extra.*，但绝不覆盖
  // 用户/AI 已经填进去的值——让"已填优先于自动回填"，避免抢占编辑。
  useEffect(() => {
    if (!open || !myExtended) return;
    const current = (form.getFieldValue('_extra') ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...current };
    let dirty = false;
    const tryFill = (key: string) => {
      const v = myExtended[key];
      if (!current[key] && typeof v === 'string' && v) {
        next[key] = v;
        dirty = true;
      }
    };
    tryFill('emergency_contact');
    tryFill('emergency_contact_name');
    if (dirty) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.setFieldsValue({ _extra: next } as any);
    }
  }, [open, myExtended, form]);

  const handleSubmit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const extra_data: Record<string, unknown> = {};
    const schemaExtra = (values as Record<string, unknown>)._extra;
    if (schemaExtra && typeof schemaExtra === 'object') {
      Object.assign(extra_data, schemaExtra as Record<string, unknown>);
    }
    const typeExtra = (values as Record<string, unknown>)._typeExtra;
    if (typeExtra && typeof typeExtra === 'object') {
      Object.assign(extra_data, typeExtra as Record<string, unknown>);
    }
    const times = resolveTimes(values);
    if (!times) {
      message.error('请假时间未填完整');
      return;
    }
    if (times.days > 30) {
      message.error('请假时长不得超过 30 天');
      return;
    }
    const location = await getCurrentLocation();
    if (!location) {
      message.warning('未获取到定位（用户可能拒绝了授权），仍可提交但不会记录位置。');
    }
    mutation.mutate({
      leave_type_code: values.leave_type_code,
      start_time: times.start.toISOString(),
      end_time: times.end.toISOString(),
      reason: values.reason,
      extra_data,
      ...(aiDraftSnapshotRef.current ? { ai_draft: aiDraftSnapshotRef.current } : {}),
      ...(location
        ? {
            apply_latitude: location.latitude,
            apply_longitude: location.longitude,
            apply_location_at: location.capturedAt,
          }
        : {}),
    });
  };

  return (
    <Modal
      title="申请请假"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={mutation.isPending}
          onClick={handleSubmit}
        >
          提交申请
        </Button>,
      ]}
      width="min(640px, 100vw)"
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 8 }}
        initialValues={{ leave_mode: 'single', single_seg: 'FULL', start_seg: 'FULL', end_seg: 'FULL' }}
      >
        <LeaveTermUsageCard usage={termUsage} variant="apply" />

        <SectionTitle>基本信息</SectionTitle>

        <Form.Item
          name="leave_type_code"
          label="假别"
          rules={[{ required: true, message: '请选择假别' }]}
        >
          <Select placeholder="请选择假别" options={leaveTypes.map((t) => ({ label: t.name, value: t.code }))} />
        </Form.Item>

        <Form.Item label="请假时长" style={{ marginBottom: 12 }}>
          <Form.Item name="leave_mode" noStyle>
            <Segmented
              options={[
                { label: '单日', value: 'single' },
                { label: '跨天', value: 'range' },
              ]}
            />
          </Form.Item>
          <span style={{ marginLeft: 12, color: 'var(--fg-3, #6b7280)', fontSize: 13 }}>
            共 <b style={{ color: 'var(--fg, #111827)' }}>{durationDays}</b> 天
            <span style={{ marginLeft: 8, fontSize: 12 }}>(每个半日 slot = 0.5 天)</span>
          </span>
        </Form.Item>

        {leaveMode === 'range' ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Form.Item
                name="start_date"
                label="起始日"
                rules={[{ required: true, message: '请选择起始日' }]}
                style={{ marginBottom: 8 }}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  disabledDate={(d) => !!d && d.isBefore(dayjs().startOf('day'))}
                />
              </Form.Item>
              <Form.Item name="start_seg" noStyle>
                <Segmented
                  block
                  options={[
                    { label: '下午开始 (0.5 天)', value: 'PM' },
                    { label: '全天 (1 天)', value: 'FULL' },
                  ]}
                />
              </Form.Item>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <Form.Item
                name="end_date"
                label="结束日"
                rules={[
                  { required: true, message: '请选择结束日' },
                  {
                    validator: (_, value?: Dayjs) => {
                      const s = form.getFieldValue('start_date') as Dayjs | undefined;
                      if (!value || !s) return Promise.resolve();
                      if (!value.isAfter(s, 'day')) {
                        return Promise.reject(new Error('结束日必须晚于起始日'));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
                style={{ marginBottom: 8 }}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  disabledDate={(d) => {
                    const s = form.getFieldValue('start_date') as Dayjs | undefined;
                    const earliest = s ?? dayjs().startOf('day');
                    return !!d && !d.isAfter(earliest, 'day');
                  }}
                />
              </Form.Item>
              <Form.Item name="end_seg" noStyle>
                <Segmented
                  block
                  options={[
                    { label: '上午结束 (0.5 天)', value: 'AM' },
                    { label: '全天 (1 天)', value: 'FULL' },
                  ]}
                />
              </Form.Item>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Form.Item
              name="single_date"
              label="日期"
              rules={[{ required: true, message: '请选择日期' }]}
              style={{ flex: '0 0 200px', marginBottom: 12 }}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(d) => !!d && d.isBefore(dayjs().startOf('day'))}
              />
            </Form.Item>
            <Form.Item
              name="single_seg"
              label="时段"
              style={{ flex: 1, minWidth: 280, marginBottom: 12 }}
            >
              <Segmented
                block
                options={[
                  { label: '上午 (0.5 天)', value: 'AM' },
                  { label: '下午 (0.5 天)', value: 'PM' },
                  { label: '全天 (1 天)', value: 'FULL' },
                ]}
              />
            </Form.Item>
          </div>
        )}

        {impact && impact.total_periods > 0 && (
          <Tooltip
            placement="bottom"
            color="#fff"
            overlayInnerStyle={{ color: '#333', maxWidth: 360 }}
            title={
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {impact.by_day.map((d) => (
                  <div key={d.date}>
                    <strong>{dayjs(d.date).format('M/D')}</strong>(周
                    {['一', '二', '三', '四', '五', '六', '日'][d.day_of_week - 1]}):
                    {d.courses
                      .map((c) => `${c.course_name} ${c.start_period}-${c.end_period}节`)
                      .join('、')}
                  </div>
                ))}
              </div>
            }
          >
            <div
              style={{
                margin: '0 0 16px',
                padding: '8px 12px',
                background: 'var(--warn-bg, #fffbe6)',
                border: '1px solid var(--warn-border, #ffe58f)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--fg-2, #595959)',
                cursor: 'help',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ReadOutlined style={{ color: '#d48806' }} />
              <span>
                该时段会缺 <b>{impact.total_periods}</b> 节课
                ({impact.total_courses} 门):
                {impactCourseNames.slice(0, 4).join('、')}
                {impactCourseNames.length > 4 ? '…' : ''}
              </span>
            </div>
          </Tooltip>
        )}

        <SectionTitle>请假说明</SectionTitle>

        <Form.Item
          name="reason"
          label="请假原因"
          rules={[{ required: true, message: '请填写请假原因' }]}
        >
          <TextArea
            rows={3}
            placeholder="简要说明请假原因,辅导员审批时会看到"
            maxLength={500}
            showCount
          />
        </Form.Item>

        <DynamicFormFields bizType="leave" fieldNamePrefix={['_extra']} />

        {typeFieldsWithToggle.length > 0 && (
          <DynamicFormFields fields={typeFieldsWithToggle} fieldNamePrefix={['_typeExtra']} />
        )}
      </Form>
    </Modal>
  );
}

/** 表单视觉分组小标题。比 Divider 轻,比裸文本有层次。 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--fg-2, #4b5563)',
        margin: '4px 0 10px',
        paddingLeft: 8,
        borderLeft: '3px solid var(--primary, #1677ff)',
        lineHeight: 1.2,
      }}
    >
      {children}
    </div>
  );
}
