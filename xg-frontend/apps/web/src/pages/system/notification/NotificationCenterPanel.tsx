import { useMemo } from 'react';
import { Alert, Card, Tag, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ROLE_LABELS } from '@xg1/shared';
import {
  listTemplates,
  listPreferences,
  type NotificationTemplateRow,
  type NotificationPreferenceRow,
  type NotificationChannel,
  type NotificationLevel,
  type RecipientType,
  type RecipientSpec,
} from '@/api/notificationCenter';

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: '站内通知',
  miniprogram: '小程序',
  wecom: '企业微信',
};

const LEVEL_LABELS: Record<NotificationLevel, string> = {
  normal: '一般',
  important: '重要',
  urgent: '紧急',
};

const LEVEL_COLORS: Record<NotificationLevel, string> = {
  normal: 'default',
  important: 'orange',
  urgent: 'red',
};

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  applicant: '申请人',
  current_approver: '当前审批人',
  applicant_counselor: '申请人辅导员',
  applicant_class_master: '申请人班主任',
  applicant_class_monitor: '申请人班长',
  applicant_dean: '申请人院系负责人',
  static_user: '指定用户',
};

/**
 * 通知中心 — 纯只读 dashboard。
 *
 * 设计原则(跟 leaveConfig 一致):
 *  - 管理员只看中文规则摘要,不看 template_code / scope_type 这种技术词
 *  - 改动路径**唯一**:左侧 AI 助手,自然语言对话
 *  - 本页不放任何"编辑"按钮,避免管理员被多个入口困惑
 */
export default function NotificationCenterPanel() {
  const { data: templates = [], isLoading: loadingT } = useQuery({
    queryKey: ['notifTemplates'],
    queryFn: listTemplates,
  });
  const { data: preferences = [], isLoading: loadingP } = useQuery({
    queryKey: ['notifPreferences', 'role'],
    queryFn: () => listPreferences('role'),
  });

  // 按 biz_module 分组:_common(跨业务通用)置顶,然后按业务模块。
  // 抽象出来的 WORKFLOW_TASK_ARRIVED / WORKFLOW_APPROVED / WORKFLOW_REJECTED
  // 改一份全系统所有审批流程都生效。
  const common = useMemo(
    () => templates.filter((t) => t.biz_module === '_common'),
    [templates],
  );
  const leaveBusiness = useMemo(
    () => templates.filter((t) => t.biz_module === 'leave' && t.category === 'business'),
    [templates],
  );
  const leaveCare = useMemo(
    () => templates.filter((t) => t.biz_module === 'leave' && t.category === 'care'),
    [templates],
  );

  if (loadingT || loadingP) {
    return <Spin />;
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="当前通知规则一览"
        description={
          <>
            改动请直接告诉左侧 AI 助手,例如:<br />
            <span style={{ color: 'var(--fg-3)' }}>
              ·「把请假驳回通知关掉」<br />
              ·「学生超时未销假改成只发企业微信」<br />
              ·「请假通过通知抄送辅导员」<br />
              ·「辅导员的任务到达通知不要走小程序」
            </span>
          </>
        }
        style={{ marginBottom: 16 }}
      />

      <Card
        title="公共通知配置(跨业务通用)"
        size="small"
        style={{ marginBottom: 16 }}
        extra={<span style={{ color: 'var(--fg-3)', fontSize: 12 }}>改一份所有审批流程都生效</span>}
      >
        {common.length === 0
          ? <span style={{ color: 'var(--fg-3)' }}>暂无</span>
          : common.map((t) => (
              <NotificationRow key={t.code} tmpl={t} preferences={preferences} />
            ))}
      </Card>

      <Card title="请假相关通知" size="small" style={{ marginBottom: 16 }}>
        {leaveBusiness.length === 0
          ? <span style={{ color: 'var(--fg-3)' }}>暂无</span>
          : leaveBusiness.map((t) => (
              <NotificationRow key={t.code} tmpl={t} preferences={preferences} />
            ))}
      </Card>

      <Card title="关怀提醒(请假)" size="small" style={{ marginBottom: 16 }}>
        {leaveCare.length === 0
          ? <span style={{ color: 'var(--fg-3)' }}>暂无</span>
          : leaveCare.map((t) => (
              <NotificationRow key={t.code} tmpl={t} preferences={preferences} />
            ))}
      </Card>

      <PrefOverridesSummary preferences={preferences} templates={templates} />
    </div>
  );
}

function NotificationRow({
  tmpl,
  preferences,
}: {
  tmpl: NotificationTemplateRow;
  preferences: NotificationPreferenceRow[];
}) {
  const overrides = preferences.filter((p) => p.template_code === tmpl.code);

  // 标题:优先用 description(管理员可读),没填的话回落到 title_tmpl
  const sceneTitle = tmpl.description?.split(',')[0] || tmpl.title_tmpl;

  return (
    <div
      style={{
        padding: '10px 0',
        borderTop: '1px dashed var(--bd-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {tmpl.enabled
          ? <Tag color="green">已开启</Tag>
          : <Tag color="default">已停用</Tag>}
        <span style={{ fontWeight: 500 }}>{sceneTitle}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', paddingLeft: 6 }}>
        收件人:
        <RecipientsTags recipients={tmpl.recipients} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', paddingLeft: 6, marginTop: 2 }}>
        渠道:
        {tmpl.default_channels.length === 0
          ? <Tag color="default" style={{ fontSize: 11 }}>未配置</Tag>
          : tmpl.default_channels.map((c) => (
              <Tag key={c} style={{ fontSize: 11 }}>{CHANNEL_LABELS[c]}</Tag>
            ))}
        · 级别:
        <Tag color={LEVEL_COLORS[tmpl.default_level]} style={{ fontSize: 11 }}>
          {LEVEL_LABELS[tmpl.default_level]}
        </Tag>
        {overrides.length > 0 && (
          <span style={{ marginLeft: 8 }}>
            · 已为{' '}
            <b style={{ color: 'var(--fg-2)' }}>{overrides.length}</b>
            {' '}个角色单独配置渠道
          </span>
        )}
      </div>
    </div>
  );
}

function RecipientsTags({ recipients }: { recipients: RecipientSpec[] | undefined }) {
  if (!recipients || recipients.length === 0) {
    return <Tag color="default" style={{ fontSize: 11 }}>未配置</Tag>;
  }
  return (
    <>
      {recipients.map((r, idx) => {
        const label = RECIPIENT_LABELS[r.type] ?? r.type;
        const color = r.cc ? 'default' : 'blue';
        const suffix = r.cc ? '(抄送)' : '';
        return (
          <Tag key={`${r.type}-${idx}`} color={color} style={{ fontSize: 11 }}>
            {label}{suffix}
          </Tag>
        );
      })}
    </>
  );
}

/**
 * 角色级覆盖汇总 — 扁平展示有哪些"角色 × 模板"被显式覆盖。
 * 没有覆盖时 fallback 到一句"全部走默认渠道"。
 */
function PrefOverridesSummary({
  preferences,
  templates,
}: {
  preferences: NotificationPreferenceRow[];
  templates: NotificationTemplateRow[];
}) {
  const tmplBy = useMemo(() => {
    const m = new Map<string, NotificationTemplateRow>();
    for (const t of templates) m.set(t.code, t);
    return m;
  }, [templates]);

  return (
    <Card title="角色级渠道覆盖" size="small">
      {preferences.length === 0 ? (
        <span style={{ color: 'var(--fg-3)' }}>
          暂无角色级覆盖,所有角色都按上面的默认渠道接收通知。
        </span>
      ) : (
        preferences.map((p) => {
          const tmpl = tmplBy.get(p.template_code);
          const sceneTitle = tmpl?.description?.split(',')[0] || tmpl?.title_tmpl || p.template_code;
          const roleLabel = ROLE_LABELS[p.scope_value as keyof typeof ROLE_LABELS] ?? p.scope_value;
          return (
            <div key={p.id} style={{ padding: '6px 0', fontSize: 13 }}>
              <Tag color="blue">{roleLabel}</Tag>
              <span> 在「{sceneTitle}」上 </span>
              {p.muted ? (
                <Tag color="red" style={{ fontSize: 11 }}>静默(收不到)</Tag>
              ) : p.channels.length === 0 ? (
                <Tag color="default" style={{ fontSize: 11 }}>未配置渠道</Tag>
              ) : (
                <>
                  <span>只走</span>
                  {p.channels.map((c) => (
                    <Tag key={c} style={{ marginLeft: 4, fontSize: 11 }}>
                      {CHANNEL_LABELS[c]}
                    </Tag>
                  ))}
                </>
              )}
            </div>
          );
        })
      )}
    </Card>
  );
}
