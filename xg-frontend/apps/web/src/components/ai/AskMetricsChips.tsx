import { BarChartOutlined, RiseOutlined, PieChartOutlined, LineChartOutlined } from '@ant-design/icons';
import { useAIActionStore } from '@/stores/ai-action.store';
import { useLayoutStore } from '@/stores/layout.store';

/**
 * 院长 / 学工部部长 / 校管理员 的 NL 问数快捷条。点击 chip = 打开 AI 面板 + seed
 * 一条具体提问 + **自动发送**。命中 sidecar 的 query_metrics tool,后端跑 SQL,
 * 结果落成 metric_result 卡。
 *
 * 设计:5 个最常问的开场,够引导即可,不堆砌 — 老师后续可以接着对话追问。
 *
 * scope 文案:
 *  - 院长 / school_admin: 「本院」开头(后端 scope 强注入 college 过滤;
 *    院长就是本院,school_admin 时实际是全校但文案不变,差异极小不返工)
 *  - 学工部部长: 「全校」开头
 */
interface Props {
  scope: 'college' | 'school';
}

export default function AskMetricsChips({ scope }: Props) {
  const setAiPanelOpen = useLayoutStore((s) => s.setAiPanelOpen);
  const seedInput = useAIActionStore((s) => s.seedInput);

  const prefix = scope === 'college' ? '本院' : '全校';

  const ask = (q: string) => {
    setAiPanelOpen(true);
    seedInput(q, { send: true });
  };

  const chips: Array<{ icon: React.ReactNode; label: string; prompt: string }> = [
    {
      icon: <BarChartOutlined />,
      label: '本学期请假数',
      prompt: `${prefix}本学期请假总共多少条`,
    },
    {
      icon: <PieChartOutlined />,
      label: '按假别分布',
      prompt: `${prefix}本学期请假按假别分布`,
    },
    {
      icon: <RiseOutlined />,
      label: '同比去年',
      prompt: `${prefix}本学期请假数同比去年`,
    },
    ...(scope === 'college'
      ? [
          {
            icon: <LineChartOutlined />,
            label: '本院 vs 全校',
            prompt: '本院请假数对比全校均值',
          },
        ]
      : []),
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={() => ask(c.prompt)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'var(--bg-2, #f5f7fb)',
            border: '1px solid var(--bd-2, #e5e7eb)',
            borderRadius: 16,
            fontSize: 12,
            color: 'var(--fg-2, #4b5563)',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3, #eef2ff)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-2, #f5f7fb)')}
        >
          {c.icon}
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}
