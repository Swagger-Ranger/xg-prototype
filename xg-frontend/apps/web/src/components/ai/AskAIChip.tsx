import { Tooltip } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useAskAI } from '@/hooks/useAskAI';
import { useAIActionStore, type PinnedRef } from '@/stores/ai-action.store';

interface AskAIChipProps {
  refData: PinnedRef;
  /** Prompt template — see useAskAI for placeholder syntax. */
  prompt: string;
  /** Short label rendered in the chip (defaults to "问 AI"). */
  label?: string;
  /** Send immediately (true) or just seed the input (false, default). */
  autoSend?: boolean;
  /** Tooltip text override. */
  tooltip?: string;
  className?: string;
  size?: 'small' | 'default';
}

/**
 * A workspace-row chip that routes the row's subject into the AI panel with a
 * pre-filled prompt. Hover also doubles as a "reverse highlight" trigger so the
 * pinned chip in the AI panel hints at the connection both ways.
 */
export default function AskAIChip({
  refData,
  prompt,
  label = '问 AI',
  autoSend = false,
  tooltip,
  className,
  size = 'small',
}: AskAIChipProps) {
  const askAI = useAskAI();
  const setHoveredRef = useAIActionStore((s) => s.setHoveredRef);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    e.preventDefault();
    askAI({ ref: refData, prompt, autoSend });
  };

  const iconSize = size === 'small' ? 11 : 13;
  const padY = size === 'small' ? 2 : 3;
  const padX = size === 'small' ? 6 : 8;

  return (
    <Tooltip title={tooltip ?? `向 AI 询问：${refData.label}`}>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHoveredRef({ type: refData.type, id: refData.id })}
        onMouseLeave={() => setHoveredRef(null)}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: `${padY}px ${padX}px`,
          fontSize: iconSize,
          lineHeight: 1.4,
          color: 'var(--ac-hi, #5e8fff)',
          background: 'var(--ac-bg, rgba(94,143,255,0.08))',
          border: '1px solid var(--ac-ring, rgba(94,143,255,0.25))',
          borderRadius: 3,
          cursor: 'pointer',
          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
          fontFamily: 'inherit',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'var(--ac, #5e8fff)';
          e.currentTarget.style.color = '#fff';
          e.currentTarget.style.borderColor = 'var(--ac, #5e8fff)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'var(--ac-bg, rgba(94,143,255,0.08))';
          e.currentTarget.style.color = 'var(--ac-hi, #5e8fff)';
          e.currentTarget.style.borderColor = 'var(--ac-ring, rgba(94,143,255,0.25))';
        }}
      >
        <RobotOutlined style={{ fontSize: iconSize }} />
        <span>{label}</span>
      </button>
    </Tooltip>
  );
}
