import { useState } from 'react';
import { Button, Spin, Space } from 'antd';
import XiaoxiAvatar from '@/components/brand/XiaoxiAvatar';
import type { CareBrief } from '@/api/care';

/**
 * 小夕 AI 助手区（W1 §3.4 / PRD §11.5）。三态：
 * - ready：展示 brief，[重新分析] + [折叠]
 * - pending：小夕正在准备…（页面侧已触发懒加载）
 * - failed：建议生成失败，[重试]（sanitize blocked / 懒加载失败 / 限流）
 *
 * AI 区失败 ≠ 任务失败：本组件不影响详情页操作区按钮可用性。
 * 注：W1 §3.3「全局默认折叠用户偏好」属偏好子系统，本期只做本地折叠。
 */
export interface XiaoxiBriefProps {
  state: 'ready' | 'pending' | 'failed';
  brief: CareBrief | null;
  onRefresh: () => void;
  refreshing: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 600, color: '#334155' }}>{title}</div>
      <div style={{ color: '#475569' }}>{children}</div>
    </div>
  );
}

function List({ items }: { items?: string[] }) {
  if (!items?.length) return <span style={{ color: '#94a3b8' }}>—</span>;
  return (
    <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function XiaoxiBrief({ state, brief, onRefresh, refreshing }: XiaoxiBriefProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--ant-color-border, #e5e7eb)',
        borderRadius: 8,
        padding: '12px 16px',
        background: '#fafafa',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <div style={{ width: 24, height: 24, flexShrink: 0 }}>
            <XiaoxiAvatar />
          </div>
          <span style={{ fontWeight: 600 }}>小夕怎么看</span>
        </Space>
        <Space>
          <Button size="small" loading={refreshing} onClick={onRefresh}>
            {state === 'failed' ? '重试' : '重新分析'}
          </Button>
          {state === 'ready' && (
            <Button size="small" type="text" onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? '展开' : '折叠'}
            </Button>
          )}
        </Space>
      </div>

      {state === 'pending' && (
        <div style={{ color: '#94a3b8', marginTop: 10 }}>
          <Spin size="small" /> 小夕正在准备…
        </div>
      )}

      {state === 'failed' && (
        <div style={{ color: '#94a3b8', marginTop: 10 }}>建议生成失败，请稍后重试。</div>
      )}

      {state === 'ready' && !collapsed && brief && (
        <div>
          {brief.why && <Section title="为什么触发">{brief.why}</Section>}
          <Section title="可以聊的话题">
            <List items={brief.talking_points} />
          </Section>
          <Section title="本次不宜触碰">
            <List items={brief.avoid_topics} />
          </Section>
          <Section title="可对接资源">
            <List items={brief.campus_resources} />
          </Section>
          {brief.follow_up_days != null && (
            <Section title="跟进建议">建议 {brief.follow_up_days} 天后再看看</Section>
          )}
        </div>
      )}
    </div>
  );
}
