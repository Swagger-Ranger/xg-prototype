import { useMemo } from 'react';
import { Checkbox, Spin } from 'antd';
import {
  CloseOutlined,
  ThunderboltOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import { useBatchActionStore } from '@/stores/batch-action.store';
import styles from './BatchActionDrawer.module.css';

export default function BatchActionDrawer() {
  const open = useBatchActionStore((s) => s.open);
  const spec = useBatchActionStore((s) => s.spec);
  const preparing = useBatchActionStore((s) => s.preparing);
  const prepareError = useBatchActionStore((s) => s.prepareError);
  const selectedIds = useBatchActionStore((s) => s.selectedIds);
  const comment = useBatchActionStore((s) => s.comment);
  const executing = useBatchActionStore((s) => s.executing);
  const result = useBatchActionStore((s) => s.result);
  const toggleSelect = useBatchActionStore((s) => s.toggleSelect);
  const setAllSelected = useBatchActionStore((s) => s.setAllSelected);
  const setComment = useBatchActionStore((s) => s.setComment);
  const runExecutor = useBatchActionStore((s) => s.runExecutor);
  const resetResult = useBatchActionStore((s) => s.resetResult);
  const close = useBatchActionStore((s) => s.close);

  const items = spec?.items ?? [];
  const enabledItems = useMemo(() => items.filter((i) => !i.disabled), [items]);
  const allSelected = enabledItems.length > 0 && enabledItems.every((i) => selectedIds.has(i.id));

  if (!open || !spec) return null;

  const failureById = new Map((result?.failures ?? []).map((f) => [f.itemId, f.reason]));
  const succeededIds = new Set<string>();
  if (result) {
    // Anything we submitted but which didn't fail is counted as success.
    for (const id of selectedIds) {
      if (!failureById.has(id)) succeededIds.add(id);
    }
  }

  const selectedCount = selectedIds.size;
  const confirmDisabled = executing || preparing || selectedCount === 0;
  const confirmLabel = result
    ? result.fail > 0 ? `重试 ${result.fail} 条` : '完成'
    : `${spec.confirmLabel}${selectedCount > 0 ? ` · ${selectedCount}` : ''}`;

  const onConfirm = () => {
    if (result) {
      if (result.fail === 0) {
        close();
      } else {
        resetResult();
      }
      return;
    }
    void runExecutor();
  };

  const commentEnabled = spec.commentEnabled !== false;

  return (
    <div className={styles.drawer}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>
          <ThunderboltOutlined />
        </span>
        <div className={styles.headerBody}>
          <div className={styles.title}>{spec.title}</div>
          {spec.description && <div className={styles.description}>{spec.description}</div>}
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={close}
          disabled={executing}
          aria-label="关闭"
        >
          <CloseOutlined />
        </button>
      </div>

      {!preparing && !prepareError && items.length > 0 && (
        <div className={styles.selectAllRow}>
          <label className={styles.selectAllLabel}>
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && selectedCount > 0}
              disabled={executing || !!result}
              onChange={(e) => setAllSelected(e.target.checked)}
            />
            <span>全选（{enabledItems.length}）</span>
          </label>
          <span className={styles.selectedMeta}>
            已选 {selectedCount} / {items.length}
          </span>
        </div>
      )}

      <div className={styles.list}>
        {preparing ? (
          <div className={styles.preparing}>
            <Spin size="small" /> <span style={{ marginLeft: 8 }}>正在准备数据…</span>
          </div>
        ) : prepareError ? (
          <div className={styles.errorState}>{prepareError}</div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>没有可执行的对象</div>
        ) : (
          items.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const didSucceed = result && succeededIds.has(item.id);
            const didFail = result && failureById.has(item.id);
            const rowCls = `${styles.item} ${item.disabled ? styles.itemDisabled : ''} ${
              didSucceed ? styles.itemSuccess : didFail ? styles.itemFail : ''
            }`;
            return (
              <div
                key={item.id}
                className={rowCls}
                onClick={() => {
                  if (item.disabled || executing || result) return;
                  toggleSelect(item.id);
                }}
              >
                {result ? (
                  <span className={`${styles.itemStatusIcon} ${didSucceed ? styles.ok : styles.fail}`}>
                    {didSucceed ? <CheckCircleFilled /> : <CloseCircleFilled />}
                  </span>
                ) : (
                  <Checkbox
                    className={styles.checkbox}
                    checked={isSelected}
                    disabled={item.disabled || executing}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(item.id)}
                  />
                )}
                <div className={styles.itemBody}>
                  <div className={styles.itemTitle}>{item.title}</div>
                  {item.subtitle && <div className={styles.itemSubtitle}>{item.subtitle}</div>}
                  {item.detail && <div className={styles.itemDetail}>{item.detail}</div>}
                  {item.disabled && item.disabledReason && (
                    <div className={styles.itemDisabledReason}>{item.disabledReason}</div>
                  )}
                  {didFail && (
                    <div className={styles.itemFailReason}>
                      失败原因：{failureById.get(item.id)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.footer}>
        {commentEnabled && !result && (
          <textarea
            className={styles.commentBox}
            placeholder={spec.commentPlaceholder ?? '填写批注（选填，将附在每条审批记录中）'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={executing || preparing}
            maxLength={200}
          />
        )}
        <div className={styles.actionRow}>
          {result ? (
            <span className={styles.resultSummary}>
              <span className={styles.resultOk}>成功 {result.success}</span>
              <span>·</span>
              <span className={result.fail > 0 ? styles.resultFail : undefined}>
                失败 {result.fail}
              </span>
            </span>
          ) : (
            <span className={styles.resultSummary}>
              {preparing ? '' : `共 ${items.length} 项`}
            </span>
          )}
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={close}
            disabled={executing}
          >
            {result ? '关闭' : '取消'}
          </button>
          <button
            type="button"
            className={`${styles.confirmBtn} ${spec.confirmTone === 'danger' ? styles.confirmBtnDanger : ''}`}
            onClick={onConfirm}
            disabled={confirmDisabled && !result}
          >
            {executing ? <Spin size="small" /> : result && result.fail > 0 ? <ReloadOutlined /> : <ThunderboltOutlined />}
            {executing ? '执行中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
