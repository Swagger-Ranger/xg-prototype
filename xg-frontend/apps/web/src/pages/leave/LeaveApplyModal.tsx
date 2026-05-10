import { useEffect, useMemo, useRef } from 'react';
import { Modal, Form, Select, DatePicker, Input, Button, InputNumber, Tooltip, Alert } from 'antd';
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
import type { FormFieldSchema } from '@/api/workflow';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

/**
 * 请假天数预览,镜像后端 LeaveCalendarService.calcEffectiveDays:
 * 工作时段 09:00–12:00 + 13:00–18:00,8h = 1 天。**每天都按工作日切**,
 * 不区分周末/节假日(简化决定:学校无法稳定拿到法定节假日数据)。
 */
function calcWorkingDays(start: Date, end: Date): number {
  if (end <= start) return 0;
  const PER_DAY = 8 * 3600;
  const SEGS: Array<[number, number]> = [
    [9 * 3600, 12 * 3600],
    [13 * 3600, 18 * 3600],
  ];
  const startMs = start.getTime();
  const endMs = end.getTime();
  let workingSec = 0;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(endMs);
  lastDay.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= lastDay.getTime()) {
    const dayStartMs = cursor.getTime();
    for (const [a, b] of SEGS) {
      const lo = Math.max(startMs, dayStartMs + a * 1000);
      const hi = Math.min(endMs, dayStartMs + b * 1000);
      workingSec += Math.max(0, (hi - lo) / 1000);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.round((workingSec / PER_DAY) * 100) / 100;
}

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: Record<string, unknown>;
}

interface FormValues {
  leave_type_code: string;
  date_range: [Dayjs, Dayjs];
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
  const dateRange = Form.useWatch('date_range', form);

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

  // 跟后端 LeaveCalendarService.calcEffectiveDays 同口径:逐日按工作时段
  // 09:00–12:00 + 13:00–18:00 求交,8 工作小时 = 1 天。每天都按工作日切,
  // 不查节假日表 — 学校拿不到稳定假期数据,统一口径胜过偶发降级出错。
  const durationDays =
    dateRange?.[0] && dateRange?.[1]
      ? calcWorkingDays(dateRange[0].toDate(), dateRange[1].toDate())
      : 0;

  // 进入弹窗即拉本学期累计请假天数(全部假别合计)。超过全局上限时顶部红条
  // 软警告 + 同时被审批侧标记成高风险——不阻断提交。学生身份才有意义,辅导员
  // 帮学生代提交时也只显示自己的累计(代提交场景占比极低,改造太重不值得)。
  const { data: termUsage } = useQuery<LeaveTermUsage>({
    queryKey: ['leave.term-usage.my'],
    queryFn: getMyTermUsage,
    enabled: open,
    staleTime: 30 * 1000,
  });

  // 学校请假规则全局开关。require_proof=true 时学生提交必须上传证明材料,
  // 在底部追加一项 file 字段并标 required;false 时完全不渲染该字段(不让
  // 学生看到一个可以留空的"证明材料"造成困惑)。
  const { data: globalConfig } = useQuery<LeaveGlobalConfig>({
    queryKey: ['leaveGlobalConfig'],
    queryFn: getLeaveGlobalConfig,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const requireProof = globalConfig?.require_proof === true;
  const proofSchema = useMemo<FormFieldSchema[]>(
    () =>
      requireProof
        ? [
            {
              name: 'attachment_file_ids',
              label: '证明材料',
              type: 'file',
              required: true,
              fileMaxCount: 3,
              fileAccept: 'image/*,.pdf',
              fileMaxSizeKb: 5 * 1024,
            },
          ]
        : [],
    [requireProof],
  );

  // 选完起止时间后实时预览会缺的课程。dateRange 不全 / 同 modal 多次重选时
  // 用 ISO 串作 query key,自动 dedup + 缓存。后端按 X-User-Id 取 student_id 算,
  // 非学生角色或学生没课表时返回 zero 视图,前端按 total_periods 判空态隐藏。
  const startIso = dateRange?.[0]?.toISOString();
  const endIso = dateRange?.[1]?.toISOString();
  const datesValid = !!(startIso && endIso && dateRange?.[1]?.isAfter(dateRange[0]));
  const { data: impact } = useQuery<LeaveImpactView>({
    queryKey: ['leave.impact.preview', startIso, endIso],
    queryFn: () => previewLeaveImpact(startIso!, endIso!),
    enabled: open && datesValid,
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
      // AI 的 open_leave_form 只给 YYYY-MM-DD（无时分），dayjs() 默认解析到 00:00，
      // 单日会让 start==end 触发 validator，跨日则两端时分都是 0 看起来"一模一样"。
      // 套用与手动打开时一致的 08:00 起 / 18:00 止默认时分。
      const atStartHour = (s: string) =>
        dayjs(s).hour(8).minute(0).second(0).millisecond(0);
      const atEndHour = (s: string) =>
        dayjs(s).hour(18).minute(0).second(0).millisecond(0);
      if (prefill.start_date && prefill.end_date) {
        values.date_range = [
          atStartHour(prefill.start_date as string),
          atEndHour(prefill.end_date as string),
        ];
      } else if (prefill.start_date) {
        values.date_range = [
          atStartHour(prefill.start_date as string),
          atEndHour(prefill.start_date as string),
        ];
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
    // require_proof=true 时 _proof.attachment_file_ids 由 FileUploadField 维护;
    // 雪花 ID 后端要 List<Long>,Jackson 接受字符串/数字混传,toString 统一兜底。
    const proofWrap = (values as Record<string, unknown>)._proof;
    let attachmentFileIds: string[] | undefined;
    if (proofWrap && typeof proofWrap === 'object') {
      const ids = (proofWrap as Record<string, unknown>).attachment_file_ids;
      if (Array.isArray(ids) && ids.length > 0) {
        attachmentFileIds = ids.map((id) => String(id));
      }
    }
    const location = await getCurrentLocation();
    if (!location) {
      message.warning('未获取到定位（用户可能拒绝了授权），仍可提交但不会记录位置。');
    }
    mutation.mutate({
      leave_type_code: values.leave_type_code,
      start_time: values.date_range[0].toISOString(),
      end_time: values.date_range[1].toISOString(),
      reason: values.reason,
      extra_data,
      ...(attachmentFileIds ? { attachment_file_ids: attachmentFileIds } : {}),
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
      width="min(560px, 100vw)"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {termUsage?.exceeded && termUsage.cap_days != null && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message={`本学期已累计请假 ${termUsage.accumulated_days} 天,超出全校上限 ${termUsage.cap_days} 天`}
            description="本次申请仍可提交,但会被自动标记为高风险,辅导员审批时会重点关注。"
          />
        )}

        <Form.Item
          name="leave_type_code"
          label="假别"
          rules={[{ required: true, message: '请选择假别' }]}
        >
          <Select placeholder="请选择假别" options={leaveTypes.map((t) => ({ label: t.name, value: t.code }))} />
        </Form.Item>

        <Form.Item
          name="date_range"
          label="请假时间"
          rules={[
            { required: true, message: '请选择请假时间' },
            {
              validator: (_, value?: [Dayjs, Dayjs]) => {
                if (!value || !value[0] || !value[1]) return Promise.resolve();
                if (!value[1].isAfter(value[0])) {
                  return Promise.reject(new Error('结束时间必须晚于开始时间'));
                }
                const days = calcWorkingDays(value[0].toDate(), value[1].toDate());
                if (days > 30) {
                  return Promise.reject(new Error('请假时长不得超过 30 个工作日'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <RangePicker
            style={{ width: '100%' }}
            showTime={{
              format: 'HH:mm',
              minuteStep: 15,
              defaultValue: (() => {
                // start_default = max(下一个整点, 08:00)
                // end_default   = max(18:00, start_default + 1h)
                // 必须保证 end > start，否则同日选择会同时落到 18:00 / 18:00
                // 或更晚——用户提交后开始结束时间会变成同一时刻。
                const eight = dayjs().hour(8).minute(0).second(0).millisecond(0);
                const nextHour = dayjs().add(1, 'hour').minute(0).second(0).millisecond(0);
                const startDefault = nextHour.isAfter(eight) ? nextHour : eight;
                const sixPM = dayjs().hour(18).minute(0).second(0).millisecond(0);
                const endDefault = sixPM.isAfter(startDefault)
                  ? sixPM
                  : startDefault.add(1, 'hour');
                return [startDefault, endDefault];
              })(),
            }}
            format="YYYY-MM-DD HH:mm"
            disabledDate={(d) => !!d && d.isBefore(dayjs().startOf('day'))}
            disabledTime={(d, type) => {
              // Only constrain hours/minutes when the user is editing TODAY's
              // range — past hours of today shouldn't be selectable. Future
              // dates are unconstrained.
              if (!d || !d.isSame(dayjs(), 'day')) return {};
              if (type === 'end') return {};
              const now = dayjs();
              const minHour = now.hour();
              const minMinute = now.hour() === d.hour() ? now.minute() : 0;
              return {
                disabledHours: () =>
                  Array.from({ length: minHour }, (_, i) => i),
                disabledMinutes: (selectedHour: number) =>
                  selectedHour === minHour
                    ? Array.from({ length: minMinute }, (_, i) => i)
                    : [],
              };
            }}
          />
        </Form.Item>

        <Form.Item
          label="请假天数"
          tooltip="按工作时段计算:09:00–12:00 + 13:00–18:00,8 小时 = 1 天。午休 12:00–13:00 不计;周末/节假日不区分,按同口径切片。"
        >
          <InputNumber value={durationDays} disabled style={{ width: '100%' }} suffix="天" />
        </Form.Item>

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
                margin: '-4px 0 12px',
                padding: '6px 10px',
                background: 'var(--warn-bg, #fffbe6)',
                border: '1px solid var(--warn-border, #ffe58f)',
                borderRadius: 4,
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

        <Form.Item
          name="reason"
          label="请假原因"
          rules={[{ required: true, message: '请填写请假原因' }]}
        >
          <TextArea rows={3} placeholder="请填写请假原因" maxLength={500} showCount />
        </Form.Item>

        <DynamicFormFields bizType="leave" fieldNamePrefix={['_extra']} />

        {typeFieldsSchema.length > 0 && (
          <DynamicFormFields fields={typeFieldsSchema} fieldNamePrefix={['_typeExtra']} />
        )}

        {proofSchema.length > 0 && (
          <DynamicFormFields fields={proofSchema} fieldNamePrefix={['_proof']} />
        )}
      </Form>
    </Modal>
  );
}
