import { useEffect, useState } from 'react';
import { Button, Radio, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/antdApp';
import { describeApiError } from '@/utils/api-error';
import {
  executeSession,
  validateSession,
  type ConflictStrategy,
  type DataImportSession,
} from '@/api/dataImport';
import styles from './index.module.css';

interface Props {
  session: DataImportSession;
  onSessionUpdate: (s: DataImportSession) => void;
  onBack: () => void;
  onExecuted: () => void;
}

export default function StepValidate({ session, onSessionUpdate, onBack, onExecuted }: Props) {
  const [validating, setValidating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [strategy, setStrategy] = useState<ConflictStrategy>(
    (session.strategy?.on_conflict as ConflictStrategy | undefined) ?? 'update',
  );

  useEffect(() => {
    if (!session.validation_report && !validating) {
      void runValidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runValidate = async () => {
    setValidating(true);
    try {
      const s = await validateSession(session.id);
      onSessionUpdate(s);
    } catch (e) {
      message.error(describeApiError(e, '校验失败'));
    } finally {
      setValidating(false);
    }
  };

  const runExecute = async () => {
    setExecuting(true);
    try {
      const s = await executeSession(session.id, strategy);
      onSessionUpdate(s);
      onExecuted();
    } catch (e) {
      message.error(describeApiError(e, '导入失败'));
    } finally {
      setExecuting(false);
    }
  };

  const r = session.validation_report;

  if (validating && !r) {
    return (
      <div className={styles.card}>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 12, color: 'var(--text-3)' }}>小夕正在校验数据…</div>
        </div>
      </div>
    );
  }

  if (!r) {
    return (
      <div className={styles.card}>
        <div className={styles.placeholder}>未拿到校验结果</div>
      </div>
    );
  }

  const hasErrors = r.error > 0;
  const hasConflicts = (r.conflict_count ?? 0) > 0;
  // 主键术语：学生场景叫"学号"，教师 / 辅导员场景叫"工号"
  const keyLabel = session.scenario === 'student' ? '学号' : '工号';

  return (
    <div className={styles.card}>
      <div className={styles.sectionLabel}>导入前最后确认</div>

      <div className={styles.validateSummary}>
        <span className={styles.statOk}>
          <CheckCircleOutlined /> 通过校验 <strong>{r.pass}</strong> 行
        </span>
        <span className={styles.statWarn}>
          <ExclamationCircleOutlined /> 警告 <strong>{r.warn}</strong> 行
        </span>
        <span className={styles.statErr}>
          <CloseCircleOutlined /> 错误 <strong>{r.error}</strong> 行
        </span>
      </div>

      {r.errors.length > 0 && (
        <details className={styles.errorList} open>
          <summary>错误明细（必须修正才能继续）</summary>
          {r.errors.slice(0, 50).map((e, i) => (
            <div key={i} className={styles.errorListRow}>
              {e.row > 0 ? `第 ${e.row} 行` : '全局'}
              {e.col ? ` · ${e.col}` : ''}
              {' · '}
              {e.message}
            </div>
          ))}
          {r.errors.length > 50 && (
            <div className={styles.errorListRow}>… 还有 {r.errors.length - 50} 条</div>
          )}
        </details>
      )}

      {r.warnings.length > 0 && (
        <details className={styles.warnList}>
          <summary>警告明细（可继续）</summary>
          {r.warnings.slice(0, 50).map((w, i) => (
            <div key={i} className={styles.errorListRow}>
              {w.row > 0 ? `第 ${w.row} 行` : '全局'}
              {w.col ? ` · ${w.col}` : ''}
              {' · '}
              {w.message}
            </div>
          ))}
          {r.warnings.length > 50 && (
            <div className={styles.errorListRow}>… 还有 {r.warnings.length - 50} 条</div>
          )}
        </details>
      )}

      {hasConflicts && (
        <div className={styles.strategyBlock}>
          <div className={styles.intentLabel}>{keyLabel}已存在的行（共 {r.conflict_count} 行）怎么办？</div>
          <Radio.Group
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            <Radio value="update">用 Excel 里的字段更新（空白处保留旧值）</Radio>
            <Radio value="skip">跳过这一行（不变更）</Radio>
          </Radio.Group>
        </div>
      )}

      {!hasConflicts && (
        <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 8 }}>
          这批数据全是新{keyLabel}，导入后将全部新建。
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={onBack}>← 上一步</Button>
        <Button
          type="primary"
          loading={executing}
          disabled={hasErrors}
          onClick={runExecute}
        >
          开始导入 {r.pass} 行
        </Button>
      </div>
    </div>
  );
}
