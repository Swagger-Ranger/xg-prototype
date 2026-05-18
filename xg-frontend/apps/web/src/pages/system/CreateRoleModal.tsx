import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  message,
} from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createRole,
  listAllPermissions,
  proposeRoleConfig,
  type PermissionCode,
  type RoleSummary,
  type RoleAiProposal,
} from '@/api/rolePermission';
import { describeApiError } from '@/utils/api-error';
import {
  useAssistantPersona,
} from '@/components/brand/AssistantAvatar';
import XiaozhaoAvatar from '@/components/brand/XiaozhaoAvatar';
import XiaoxiAvatar from '@/components/brand/XiaoxiAvatar';

// 与 RolePermissionPanel 保持一致的 module 中文名映射
const MODULE_LABELS: Record<string, string> = {
  ai: 'AI 助手',
  checkin: '签到',
  collection: '数据收集',
  discipline: '违纪管理',
  knowledge: '知识库',
  leave: '请假管理',
  notification: '通知',
  student: '学生信息',
  system: '系统配置',
  worklog: '工作日志',
  workstudy: '勤工助学',
  alert: '风险预警',
  talk: '谈心谈话',
  academic: '学籍管理',
  other: '其他',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (role: RoleSummary) => void;
  allRoles: RoleSummary[];
  /** 从 AI 助手 navigate 过来时,带过来的角色职责描述,预填到 AI 输入框 */
  initialAiText?: string;
}

interface FormValues {
  name: string;
  description?: string;
  permission_codes: string[];
}

/** 自动生成自定义角色 code — 用户无需关心，提交时一并发给后端。 */
function generateCustomCode(): string {
  const ts = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(-3);
  return `custom_${ts}${rand}`;
}

/**
 * 自定义勾选组件 — 受 antd Form.Item 控制，按 module 分组用 Collapse 折叠，
 * 模块标题里显示「已选 N / 共 M」实时计数。
 */
function PermissionPicker({
  value = [],
  onChange,
  grouped,
  defaultExpanded,
}: {
  value?: string[];
  onChange?: (next: string[]) => void;
  grouped: Record<string, PermissionCode[]>;
  defaultExpanded: string[];
}) {
  const selected = useMemo(() => new Set(value), [value]);
  const [activeKeys, setActiveKeys] = useState<string[]>(defaultExpanded);

  // 父组件给的默认展开列表变化时（AI 提案应用瞬间）同步进来
  useEffect(() => setActiveKeys(defaultExpanded), [defaultExpanded]);

  function toggle(code: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    onChange?.(Array.from(next));
  }

  function toggleAll(mod: string, allCheck: boolean) {
    const codes = (grouped[mod] || []).map((p) => p.code);
    const next = new Set(selected);
    if (allCheck) codes.forEach((c) => next.add(c));
    else codes.forEach((c) => next.delete(c));
    onChange?.(Array.from(next));
  }

  const moduleKeys = Object.keys(grouped).sort();

  return (
    <Collapse
      size="small"
      activeKey={activeKeys}
      onChange={(k) => setActiveKeys(Array.isArray(k) ? k : [k])}
      items={moduleKeys.map((mod) => {
        const perms = grouped[mod];
        const checkedCount = perms.filter((p) => selected.has(p.code)).length;
        const allChecked = checkedCount === perms.length;
        return {
          key: mod,
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>
                {MODULE_LABELS[mod] ?? mod}
                <span style={{ color: 'var(--fg-3)', marginLeft: 6, fontSize: 12 }}>
                  {checkedCount}/{perms.length}
                </span>
              </span>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 18, fontSize: 12 }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAll(mod, !allChecked);
                }}
              >
                {allChecked ? '取消全选' : '全选'}
              </Button>
            </div>
          ),
          children: (
            <Space wrap size={[12, 8]}>
              {perms.map((p) => (
                <Checkbox
                  key={p.code}
                  checked={selected.has(p.code)}
                  onChange={(e) => toggle(p.code, e.target.checked)}
                >
                  {p.name}
                </Checkbox>
              ))}
            </Space>
          ),
        };
      })}
    />
  );
}

export default function CreateRoleModal({ open, onClose, onCreated, allRoles, initialAiText }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [aiText, setAiText] = useState('');
  const [proposal, setProposal] = useState<RoleAiProposal | null>(null);

  // 从 AI 助手跳转过来时,把它带来的指令预填到输入框（仅在打开时同步一次）
  useEffect(() => {
    if (open && initialAiText) setAiText(initialAiText);
  }, [open, initialAiText]);
  // 跟随时间：白天小朝、夜晚小夕
  const { name: assistantName, period } = useAssistantPersona();

  // 权限字典 — 用于分组渲染 + AI code → 中文名展示，本地缓存 5 分钟
  const permsQuery = useQuery({
    queryKey: ['admin.allPermissions'],
    queryFn: listAllPermissions,
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const allPerms: PermissionCode[] = permsQuery.data ?? [];
  const permNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPerms) m.set(p.code, p.name);
    return m;
  }, [allPerms]);
  const grouped = useMemo(() => {
    const out: Record<string, PermissionCode[]> = {};
    for (const p of allPerms) {
      const mod = p.module ?? 'other';
      (out[mod] ||= []).push(p);
    }
    // 模块内按 sort_order / code 稳定
    for (const arr of Object.values(out)) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
    }
    return out;
  }, [allPerms]);

  // 跟踪当前已选权限数量（用于权限区标题计数）
  const checkedPerms = Form.useWatch('permission_codes', form) ?? [];

  // 算「已勾任意一项的模块」用于 Collapse 默认展开
  const defaultExpandedModules = useMemo(() => {
    const checked = new Set(checkedPerms);
    return Object.entries(grouped)
      .filter(([_mod, perms]) => perms.some((p) => checked.has(p.code)))
      .map(([mod]) => mod);
  }, [grouped, checkedPerms]);

  function handleAfterClose() {
    form.resetFields();
    setAiText('');
    setProposal(null);
  }

  const proposeMut = useMutation({
    mutationFn: () => proposeRoleConfig(aiText.trim()),
    onSuccess: (p) => {
      if (p.error_code) {
        message.warning(p.ai_message || 'AI 推荐失败');
        return;
      }
      setProposal(p);
      // 应用到表单：名称、描述、权限勾选（permission_codes）
      form.setFieldsValue({
        name: p.name,
        description: p.description,
        permission_codes: p.permission_codes,
      });
    },
    onError: (e) => message.error(describeApiError(e, `${assistantName}推荐失败`)),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const values = await form.validateFields();
      // code 自动生成：AI 给了用 AI 的，否则本地造一个；用户看不到也不需要填
      const code = (proposal?.code || generateCustomCode()).trim().toLowerCase();
      return createRole({
        code,
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        initial_permission_codes: values.permission_codes,
      });
    },
    onSuccess: (created) => {
      message.success(`已创建角色「${created.name}」`);
      onCreated(created);
      onClose();
    },
    onError: (e) => message.error(describeApiError(e, '创建角色失败')),
  });

  // 未用到 allRoles 时的兜底（保留入参以便后续做"复制角色"等功能）
  void allRoles;

  return (
    <Modal
      title="新建自定义角色"
      open={open}
      onCancel={onClose}
      afterClose={handleAfterClose}
      destroyOnClose
      width={680}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button
          key="create"
          type="primary"
          loading={createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          确认创建
        </Button>,
      ]}
    >
      {/* AI 助手区 — 头像 + 名称跟随时间 */}
      <div
        style={{
          background: 'rgba(22, 119, 255, 0.05)',
          border: '1px solid rgba(22, 119, 255, 0.18)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, flexShrink: 0 }}>
            {period === 'day' ? <XiaozhaoAvatar /> : <XiaoxiAvatar />}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            用一句话告诉{assistantName}
          </span>
        </div>
        <Input.TextArea
          rows={2}
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          placeholder={`例：副院长助理，只能看本学院学生信息和请假统计，不能修改`}
          style={{ fontSize: 13 }}
          maxLength={300}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button
            type="primary"
            ghost
            icon={<ThunderboltOutlined />}
            loading={proposeMut.isPending}
            disabled={!aiText.trim()}
            onClick={() => proposeMut.mutate()}
          >
            让{assistantName}推荐
          </Button>
        </div>

        {/* AI 提案预览 — 全中文，不暴露任何 code */}
        {proposal && (
          <Alert
            type="info"
            style={{ marginTop: 10 }}
            message={
              <span style={{ fontSize: 13 }}>
                {assistantName}建议：
                <Tag color="blue" style={{ marginLeft: 4 }}>{proposal.name}</Tag>
                · 共 {proposal.permission_codes.length} 项权限
              </span>
            }
            description={
              <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>
                <div style={{ marginBottom: 6 }}>{proposal.ai_message}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {proposal.permission_codes.slice(0, 16).map((c) => (
                    <Tag key={c} style={{ fontSize: 11, margin: 0 }}>
                      {permNameMap.get(c) || c}
                    </Tag>
                  ))}
                  {proposal.permission_codes.length > 16 && (
                    <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>
                      … 还有 {proposal.permission_codes.length - 16} 项
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 6, color: 'var(--fg-3)' }}>
                  以下权限已勾选，可在下方手动微调
                </div>
                <div style={{ marginTop: 4 }}>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => setProposal(null)}
                    style={{ padding: 0, height: 20, fontSize: 12 }}
                  >
                    清掉这个提案
                  </Button>
                </div>
              </div>
            }
          />
        )}
      </div>

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        preserve={false}
        initialValues={{ permission_codes: [] }}
      >
        <Form.Item
          label="中文名称"
          name="name"
          rules={[
            { required: true, message: '请填写角色名称' },
            { max: 32, message: '名称最长 32 字' },
          ]}
        >
          <Input placeholder="例：副院长助理" maxLength={32} />
        </Form.Item>

        <Form.Item label="描述（选填）" name="description">
          <Input.TextArea rows={2} maxLength={120} placeholder="一句话说明该角色用途，方便后续维护识别" />
        </Form.Item>

        <Form.Item
          label={
            <span>
              权限{' '}
              <span style={{ color: 'var(--fg-3)', fontSize: 12, fontWeight: 400 }}>
                · 已选 {checkedPerms.length} / {allPerms.length} 项
              </span>
            </span>
          }
          name="permission_codes"
          extra="按模块折叠展示，可点「全选」或单项勾选；不勾即不授予"
        >
          <PermissionPicker
            grouped={grouped}
            defaultExpanded={defaultExpandedModules}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
