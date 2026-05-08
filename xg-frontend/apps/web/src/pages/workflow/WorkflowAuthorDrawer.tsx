// Right-side drawer for natural-language workflow editing. The user types a
// modification instruction; we send {currentDsl, instruction} to the AI agent;
// when a valid new DSL comes back we offer Apply/Discard. Apply hands the new
// DSL to the parent which updates the chart and the node-list editor in lock
// step. Failures degrade gracefully — the manual editor on the left is always
// available, the AI is just an accelerator.
import { useState } from 'react';
import { Drawer, Input, Button, Alert, Tag, Space, Spin } from 'antd';
import { SendOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { FlowDsl } from './dsl';
import { proposeWorkflowEdit } from '@/api/workflow';
import { describeApiError } from '@/utils/api-error';
import styles from './WorkflowAuthorDrawer.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  currentDsl: FlowDsl | null;
  onApply: (next: FlowDsl) => void;
}

interface HistoryEntry {
  instruction: string;
  summary?: string;
  error?: string;
  applied?: boolean;
}

interface Pending {
  instruction: string;
  newDsl: FlowDsl;
  summary: string;
}

const SAMPLES = [
  '把班主任审批的角色改成院领导',
  '在通过之前增加一个 7 天的公示节点',
  '审批超过 3 天的请假，再加一道学院审批',
];

export default function WorkflowAuthorDrawer({ open, onClose, currentDsl, onApply }: Props) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!currentDsl || !input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await proposeWorkflowEdit(
        currentDsl as unknown as Record<string, unknown>,
        input.trim(),
      );
      if (!res.ok || !res.dsl) {
        const msg = res.error_message ?? 'AI 暂时无法生成修改，建议在左侧手工编辑。';
        setHistory((h) => [...h, { instruction: input.trim(), error: msg }]);
        setError(msg);
        setInput('');
        return;
      }
      setPending({
        instruction: input.trim(),
        newDsl: res.dsl as unknown as FlowDsl,
        summary: res.summary ?? '',
      });
      setInput('');
    } catch (e) {
      const msg = describeApiError(e, 'AI 调用失败');
      setError(msg);
      setHistory((h) => [...h, { instruction: input.trim(), error: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!pending) return;
    onApply(pending.newDsl);
    setHistory((h) => [
      ...h,
      { instruction: pending.instruction, summary: pending.summary, applied: true },
    ]);
    setPending(null);
  };

  const discard = () => {
    if (!pending) return;
    setHistory((h) => [
      ...h,
      { instruction: pending.instruction, summary: pending.summary, applied: false },
    ]);
    setPending(null);
  };

  return (
    <Drawer
      title="自然语言修改流程"
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      mask={false}
      destroyOnHidden
    >
      <div className={styles.body}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="描述你想要的改动，AI 会生成新的流程定义；预览满意后点应用。"
        />

        <div className={styles.history}>
          {history.length === 0 && !pending && (
            <div className={styles.emptyHint}>
              <div style={{ marginBottom: 8 }}>试试这些：</div>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {SAMPLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.sampleChip}
                    onClick={() => setInput(s)}
                  >
                    {s}
                  </button>
                ))}
              </Space>
            </div>
          )}
          {history.map((h, i) => (
            <div key={i} className={styles.entry}>
              <div className={styles.bubbleUser}>{h.instruction}</div>
              {h.error ? (
                <div className={styles.bubbleErr}>失败：{h.error}</div>
              ) : (
                <div className={styles.bubbleAi}>
                  {h.summary || '（无摘要）'}
                  {h.applied ? (
                    <Tag color="green" style={{ marginLeft: 8 }}>已应用</Tag>
                  ) : (
                    <Tag style={{ marginLeft: 8 }}>已丢弃</Tag>
                  )}
                </div>
              )}
            </div>
          ))}

          {pending && (
            <div className={styles.entry}>
              <div className={styles.bubbleUser}>{pending.instruction}</div>
              <div className={styles.bubbleAi}>
                {pending.summary || '生成完毕，请在左侧预览。'}
              </div>
              <div className={styles.pendingActions}>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={apply}
                >
                  应用
                </Button>
                <Button size="small" icon={<CloseOutlined />} onClick={discard}>
                  丢弃
                </Button>
              </div>
            </div>
          )}

          {loading && (
            <div className={styles.loading}>
              <Spin size="small" /> AI 正在生成修改…
            </div>
          )}
        </div>

        {error && !loading && (
          <Alert type="warning" showIcon message={error} style={{ marginBottom: 8 }} />
        )}

        <div className={styles.composer}>
          <Input.TextArea
            rows={3}
            value={input}
            disabled={loading || !!pending}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例如：把班主任审批改成院领导，并加一个 7 天公示"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={loading}
            disabled={!input.trim() || !!pending}
            onClick={submit}
            style={{ marginTop: 8, width: '100%' }}
          >
            生成修改
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
