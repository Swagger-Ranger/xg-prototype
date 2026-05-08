import { Tooltip } from 'antd';
import { message } from '@/utils/antdApp';
import { PushpinOutlined, PushpinFilled } from '@ant-design/icons';
import { useAIActionStore, type PinnedRef } from '@/stores/ai-action.store';

interface PinToAIButtonProps {
  refData: PinnedRef;
  size?: 'small' | 'default';
  className?: string;
}

/**
 * A small button that pins the supplied object into the AI chat input context.
 * When clicked, a chip appears above the AI input box and the object travels
 * with the next message as `refs`, so the LLM knows what "这个/那条" refers to.
 */
export default function PinToAIButton({ refData, size = 'small', className }: PinToAIButtonProps) {
  const pinRef = useAIActionStore((s) => s.pinRef);
  const unpinRef = useAIActionStore((s) => s.unpinRef);
  const pinned = useAIActionStore((s) =>
    s.pinnedRefs.some((r) => r.type === refData.type && r.id === refData.id),
  );

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (pinned) {
      unpinRef(refData.type, refData.id);
    } else {
      pinRef(refData);
      message.success({ content: `已加入 AI 上下文：${refData.label}`, duration: 1.2 });
    }
  };

  const iconSize = size === 'small' ? 12 : 14;
  return (
    <Tooltip title={pinned ? '从 AI 上下文移除' : '加入 AI 上下文，让 AI 针对这条对象回答'}>
      <button
        type="button"
        onClick={handleClick}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: iconSize + 10,
          height: iconSize + 10,
          padding: 0,
          border: 'none',
          background: pinned ? 'rgba(94, 143, 255, 0.16)' : 'transparent',
          color: pinned ? '#5e8fff' : 'var(--fg-3, #888)',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: iconSize,
          lineHeight: 1,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!pinned) (e.currentTarget.style.color = '#5e8fff');
        }}
        onMouseLeave={(e) => {
          if (!pinned) (e.currentTarget.style.color = 'var(--fg-3, #888)');
        }}
      >
        {pinned ? <PushpinFilled /> : <PushpinOutlined />}
      </button>
    </Tooltip>
  );
}
