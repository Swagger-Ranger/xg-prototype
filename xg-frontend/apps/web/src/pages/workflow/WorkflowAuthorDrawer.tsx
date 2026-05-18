// Right-side drawer for natural-language workflow editing. The user types a
// modification instruction; we send {currentDsl, instruction} to the AI agent;
// when a valid new DSL comes back we offer Apply/Discard. Apply hands the new
// DSL to the parent which updates the chart and the node-list editor in lock
// step. Failures degrade gracefully — the manual editor on the left is always
// available, the AI is just an accelerator.
import { useEffect, useRef, useState } from 'react';
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
  /**
   * 由 AI 小夕 chat 深链接预填:打开 Drawer 时若提供本字段,自动填到输入框并提交,
   * 等同老师手动输入。仅在 Drawer 首次打开时消费一次,避免重复触发。
   */
  initialInstruction?: string;
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

// 按当前流程的 module 提供贴近场景的示例。命中规则:精确匹配 module 字段;
// 未知 module 走通用兜底(只列纯结构性改动,不引入业务术语避免误导)。
const SAMPLES_BY_MODULE: Record<string, string[]> = {
  leave: [
    '把班主任审批的角色改成院领导',
    '在通过之前增加一个 7 天的公示节点',
    '审批超过 3 天的请假，再加一道学院审批',
  ],
  workstudy: [
    '把岗位审批的辅导员节点改成院领导',
    '在审批通过后加一条通知给资助中心',
    '薪资金额超过 500 元的，再加一道学院审批',
  ],
};
const SAMPLES_FALLBACK = [
  '把某一步的审批人改成另一个角色',
  '在某节点后增加一个通知节点',
  '某条件下追加一道审批',
];

export default function WorkflowAuthorDrawer({
  open,
  onClose,
  currentDsl,
  onApply,
  initialInstruction,
}: Props) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 单次消费 flag — 同一个 Drawer 实例下,initialInstruction 只在首次打开时自动提交;
  // 老师后续在同一个 Drawer 里继续手动改不应该被重新触发。close 时重置。
  const autoSubmittedRef = useRef(false);

  const samples = (currentDsl?.module && SAMPLES_BY_MODULE[currentDsl.module]) || SAMPLES_FALLBACK;

  // 可选 instruction 透传 — 优先用参数值,缺省回退到 input state。
  // 配合自动提交,instruction state 还没合并就要发请求,所以直接传值最稳。
  const submit = async (instructionOverride?: string) => {
    const instr = (instructionOverride ?? input).trim();
    if (!currentDsl || !instr) return;
    setLoading(true);
    setError(null);
    try {
      const res = await proposeWorkflowEdit(
        currentDsl as unknown as Record<string, unknown>,
        instr,
      );
      if (!res.ok || !res.dsl) {
        const msg = res.error_message ?? 'AI 暂时无法生成修改，建议在左侧手工编辑。';
        setHistory((h) => [...h, { instruction: instr, error: msg }]);
        setError(msg);
        setInput('');
        return;
      }
      setPending({
        instruction: instr,
        newDsl: res.dsl as unknown as FlowDsl,
        summary: res.summary ?? '',
      });
      setInput('');
    } catch (e) {
      const msg = describeApiError(e, 'AI 调用失败');
      setError(msg);
      setHistory((h) => [...h, { instruction: instr, error: msg }]);
    } finally {
      setLoading(false);
    }
  };

  // chat 深链接:Drawer 打开 + currentDsl 就绪 + 有 initialInstruction 时,
  // 自动填入 + 提交一次。autoSubmittedRef 防止 re-render 重复提交;Drawer 关闭时重置。
  useEffect(() => {
    if (!open) {
      autoSubmittedRef.current = false;
      return;
    }
    if (autoSubmittedRef.current) return;
    if (!initialInstruction || !currentDsl) return;
    autoSubmittedRef.current = true;
    setInput(initialInstruction);
    void submit(initialInstruction);
    // submit 是 unstable closure 但只在首次自动提交里调一次 — 不进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentDsl, initialInstruction]);

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
                {samples.map((s) => (
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
            placeholder="例如：把某节点的审批人改成另一个角色，并加一个公示节点"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={loading}
            disabled={!input.trim() || !!pending}
            onClick={() => submit()}
            style={{ marginTop: 8, width: '100%' }}
          >
            生成修改
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
