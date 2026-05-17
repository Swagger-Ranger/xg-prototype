// 团队新建 / 编辑弹窗。新建时 editing=null;编辑时 editing=要改的 RoleSummary。
// 字段:名称 / 类型(可空) / 起止日期 + 常驻开关 / 备注。
// code 不暴露给用户:新建时后端自动 team_<rand>;编辑时不可改。

import { useEffect } from 'react';
import { Form, Input, Modal, Radio, DatePicker, Switch } from 'antd';
import { useMutation } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { message } from '@/utils/antdApp';
import {
  createRole,
  updateRole,
  type RoleSummary,
  type TeamType,
} from '@/api/rolePermission';
import { describeApiError } from '@/utils/api-error';

const { TextArea } = Input;

const TEAM_TYPE_OPTIONS: { label: string; value: TeamType }[] = [
  { label: '评审/评定', value: 'review' },
  { label: '临时工作组', value: 'temporary' },
  { label: '跨部门联动', value: 'cross_dept' },
  { label: '学生组织', value: 'student_org' },
  { label: '其它', value: 'other' },
];

interface FormValues {
  name: string;
  description?: string;
  team_type?: TeamType;
  is_permanent: boolean;
  range?: [Dayjs | null, Dayjs | null];
}

interface TeamFormModalProps {
  open: boolean;
  editing: RoleSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TeamFormModal({ open, editing, onClose, onSuccess }: TeamFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!editing;

  // 打开时:编辑模式回填,新建模式默认值
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const hasDates = editing.start_date || editing.end_date;
      form.setFieldsValue({
        name: editing.name,
        description: editing.description ?? undefined,
        team_type: (editing.team_type as TeamType) ?? undefined,
        is_permanent: !hasDates,
        range: hasDates
          ? [
              editing.start_date ? dayjs(editing.start_date) : null,
              editing.end_date ? dayjs(editing.end_date) : null,
            ]
          : undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ is_permanent: false });
    }
  }, [open, editing, form]);

  const submitMut = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      const startDate = v.is_permanent ? null : v.range?.[0]?.format('YYYY-MM-DD') ?? null;
      const endDate = v.is_permanent ? null : v.range?.[1]?.format('YYYY-MM-DD') ?? null;

      if (isEdit) {
        await updateRole(editing!.code, {
          name: v.name.trim(),
          description: v.description?.trim() || undefined,
          team_type: v.team_type ?? null,
          start_date: startDate,
          end_date: endDate,
        });
      } else {
        await createRole({
          name: v.name.trim(),
          description: v.description?.trim() || undefined,
          kind: 'team',
          team_type: v.team_type ?? null,
          start_date: startDate,
          end_date: endDate,
        });
      }
    },
    onSuccess: () => {
      message.success(isEdit ? '已更新' : '已创建团队');
      onSuccess();
      onClose();
      form.resetFields();
    },
    onError: (e) => message.error(describeApiError(e, isEdit ? '更新失败' : '创建失败')),
  });

  return (
    <Modal
      title={isEdit ? `编辑团队 — ${editing!.name}` : '新建团队'}
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={() => submitMut.mutate()}
      confirmLoading={submitMut.isPending}
      okText={isEdit ? '保存' : '创建'}
      width={520}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="团队名称"
          name="name"
          rules={[{ required: true, message: '请输入团队名称' }]}
        >
          <Input maxLength={64} placeholder="如:2026 秋季奖学金评审委员会" />
        </Form.Item>

        <Form.Item label="类型" name="team_type">
          <Radio.Group options={TEAM_TYPE_OPTIONS} />
        </Form.Item>

        <Form.Item
          label="常驻团队"
          name="is_permanent"
          valuePropName="checked"
          help="开启 = 无固定起止日期(如「心理危机干预小组」)。关闭后需要选择起止日期。"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, cur) => prev.is_permanent !== cur.is_permanent}
        >
          {({ getFieldValue }) =>
            !getFieldValue('is_permanent') && (
              <Form.Item
                label="工作周期"
                name="range"
                rules={[{ required: true, message: '请选择起止日期,或勾选「常驻团队」' }]}
              >
                <DatePicker.RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            )
          }
        </Form.Item>

        <Form.Item label="备注" name="description">
          <TextArea rows={3} maxLength={255} placeholder="选填,如:成立背景、工作内容、注意事项..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
