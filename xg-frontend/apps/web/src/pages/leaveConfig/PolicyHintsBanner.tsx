import { useState } from 'react';
import { Button, Card, Spin, Tag, Tooltip } from 'antd';
import { DownOutlined, UpOutlined, BulbOutlined, BankOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getLeavePolicyHints, type PolicyItem } from '@/api/leavePolicy';

/**
 * 「政策建议」独立 Card。两类条目:
 *  - 国家:教育部令条款,硬编码,字面准确
 *  - 本校知识库:RAG 召回 + LLM 提炼成可执行配置建议(不是原文片段)
 *
 * 默认 2 行(国家 1 + 本校 1),点击「展开」看更多。RAG 0 召回时本校行不渲染。
 */
export default function PolicyHintsBanner() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['leavePolicyHints'],
    queryFn: getLeavePolicyHints,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card size="small" title="政策建议" style={{ borderRadius: 'var(--r-lg)' }}>
        <Spin size="small" />
      </Card>
    );
  }
  if (!data || (data.national.length === 0 && data.school.length === 0)) {
    return null;
  }

  const nationalShown = expanded ? data.national : data.national.slice(0, 1);
  const schoolShown = expanded ? data.school.slice(0, 3) : data.school.slice(0, 1);
  const moreCount =
    Math.max(0, data.national.length - 1) +
    Math.max(0, Math.min(data.school.length, 3) - 1);

  return (
    <Card
      size="small"
      title="政策建议"
      style={{ borderRadius: 'var(--r-lg)' }}
      extra={
        moreCount > 0 ? (
          <Button
            size="small"
            type="link"
            icon={expanded ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setExpanded((v) => !v)}
            style={{ padding: 0, height: 'auto', fontSize: 12 }}
          >
            {expanded ? '收起' : `展开看更多 (${moreCount})`}
          </Button>
        ) : null
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {nationalShown.map((p, i) => (
          <PolicyLine key={`n-${i}`} icon={<BankOutlined />} tag="国家" item={p} />
        ))}
        {schoolShown.map((p, i) => (
          <PolicyLine key={`s-${i}`} icon={<BulbOutlined />} tag="本校知识库" item={p} />
        ))}
      </div>
    </Card>
  );
}

function PolicyLine({
  icon,
  tag,
  item,
}: {
  icon: React.ReactNode;
  tag: string;
  item: PolicyItem;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        fontSize: 12,
        lineHeight: 1.6,
        color: 'var(--fg-2)',
      }}
    >
      <span style={{ color: 'var(--fg-3)', flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <Tag
        color={tag === '国家' ? 'blue' : 'gold'}
        style={{ margin: 0, fontSize: 11, flexShrink: 0, lineHeight: '18px' }}
      >
        {tag}
      </Tag>
      <Tooltip title={item.text} mouseEnterDelay={0.4}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          <span style={{ color: 'var(--fg-3)', marginRight: 6 }}>《{item.ref}》</span>
          {item.text}
        </span>
      </Tooltip>
    </div>
  );
}

