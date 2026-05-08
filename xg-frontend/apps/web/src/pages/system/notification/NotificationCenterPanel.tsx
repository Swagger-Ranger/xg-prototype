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

  const business = useMemo(
    () => templates.filter((t) => t.category === 'business'),
    [templates],
  );
  const care = useMemo(
    () => templates.filter((t) => t.category === 'care'),
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
              ·「辅导员的任务到达通知不要走小程序」
            </span>
          </>
        }
        style={{ marginBottom: 16 }}
      />

      <Card title="请假流程通知" size="small" style={{ marginBottom: 16 }}>
        {business.length === 0
          ? <span style={{ color: 'var(--fg-3)' }}>暂无</span>
          : business.map((t) => (
              <NotificationRow
                key={t.code}
                tmpl={t}
                preferences={preferences}
              />
            ))}
      </Card>

      <Card title="关怀提醒" size="small" style={{ marginBottom: 16 }}>
        {care.length === 0
          ? <span style={{ color: 'var(--fg-3)' }}>暂无</span>
          : care.map((t) => (
              <NotificationRow
                key={t.code}
                tmpl={t}
                preferences={preferences}
              />
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
        通过{' '}
        {tmpl.default_channels.length === 0
          ? <Tag color="default" style={{ fontSize: 11 }}>未配置渠道</Tag>
          : tmpl.default_channels.map((c) => (
              <Tag key={c} style={{ fontSize: 11 }}>{CHANNEL_LABELS[c]}</Tag>
            ))}
        发送 · 级别{' '}
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
