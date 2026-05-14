import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Spin, Tag } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { message } from '@/utils/antdApp';
import { describeApiError } from '@/utils/api-error';
import {
  autoMapSession,
  overrideMapping,
  type ColumnMappingRow,
  type DataImportSession,
  type TargetField,
} from '@/api/dataImport';
import styles from './index.module.css';

interface Props {
  session: DataImportSession;
  onSessionUpdate: (s: DataImportSession) => void;
  onBack: () => void;
  onNext: () => void;
}

export default function StepMapping({ session, onSessionUpdate, onBack, onNext }: Props) {
  const [autoMapping, setAutoMapping] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  // Step 1 进 Step 2 时如果还没列映射，触发一次 AI 建议。
  useEffect(() => {
    if (!session.column_mapping && !autoMapping) {
      void runAutoMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAutoMap = async () => {
    setAutoMapping(true);
    try {
      const s = await autoMapSession(session.id);
      onSessionUpdate(s);
    } catch (e) {
      message.error(describeApiError(e, 'AI 解析失败'));
    } finally {
      setAutoMapping(false);
    }
  };

  const handleTargetChange = async (sourceIndex: number, targetKey: string | null) => {
    setSavingIdx(sourceIndex);
    try {
      const s = await overrideMapping(session.id, sourceIndex, targetKey);
      onSessionUpdate(s);
    } catch (e) {
      message.error(describeApiError(e, '更新失败'));
    } finally {
      setSavingIdx(null);
    }
  };

  const mappings = session.column_mapping?.mappings ?? [];
  const targets = session.column_mapping?.targets ?? [];
  const samples = session.samples ?? [];

  const targetByKey = useMemo(() => {
    const m: Record<string, TargetField> = {};
    for (const t of targets) m[t.key] = t;
    return m;
  }, [targets]);

  // 必填字段是否都映上了
  const missingRequired = useMemo(() => {
    if (targets.length === 0) return [];
    const mapped = new Set(
      mappings.map((m) => m.target).filter((t): t is string => !!t),
    );
    return targets.filter((t) => t.required && !mapped.has(t.key));
  }, [targets, mappings]);

  // 同一目标字段被多列映射会冲突 → 标出来
  const targetUseCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of mappings) {
      if (m.target) c[m.target] = (c[m.target] ?? 0) + 1;
    }
    return c;
  }, [mappings]);

  if (autoMapping && !session.column_mapping) {
    return (
      <div className={styles.card}>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 12, color: 'var(--text-3)' }}>小夕正在读表，对字段中…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.previewMeta}>
        <span>
          <strong>文件：</strong>
          {session.file_name}
        </span>
        <span>
          <strong>总行数：</strong>
          {session.total_rows}
        </span>
        <span>
          <strong>列数：</strong>
          {mappings.length}
        </span>
        <span>
          <strong>必填字段命中：</strong>
          {targets.filter((t) => t.required).length - missingRequired.length}/
          {targets.filter((t) => t.required).length}
        </span>
      </div>

      <div className={styles.mapTable}>
        <div className={styles.mapHeadRow}>
          <div className={styles.mapColLeft}>你的表里的列（含样例）</div>
          <div className={styles.mapColMid}>置信度</div>
          <div className={styles.mapColRight}>要导入到</div>
        </div>
        {mappings.map((row) => (
          <MappingRow
            key={row.source_index}
            row={row}
            samples={samples}
            targets={targets}
            targetByKey={targetByKey}
            targetUseCount={targetUseCount}
            saving={savingIdx === row.source_index}
            onChange={handleTargetChange}
          />
        ))}
      </div>

      {missingRequired.length > 0 && (
        <div className={styles.warnBanner}>
          还有必填字段没对上：
          {missingRequired.map((t) => (
            <Tag key={t.key} color="orange">
              {t.label}
            </Tag>
          ))}
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={onBack}>← 上一步</Button>
        <Button type="primary" disabled={missingRequired.length > 0} onClick={onNext}>
          下一步：核对结构
        </Button>
      </div>
    </div>
  );
}

interface RowProps {
  row: ColumnMappingRow;
  samples: string[][];
  targets: TargetField[];
  targetByKey: Record<string, TargetField>;
  targetUseCount: Record<string, number>;
  saving: boolean;
  onChange: (sourceIndex: number, targetKey: string | null) => void;
}

function MappingRow({
  row,
  samples,
  targets,
  targetByKey,
  targetUseCount,
  saving,
  onChange,
}: RowProps) {
  const sampleStr = useMemo(() => {
    const vs = samples
      .map((r) => r[row.source_index])
      .filter((v) => v != null && v !== '')
      .slice(0, 2)
      .join(' · ');
    return vs || '(空)';
  }, [samples, row.source_index]);

  const conf = row.confidence ?? 0;
  const confLevel: 'high' | 'mid' | 'low' =
    !row.target ? 'low' : conf >= 0.85 ? 'high' : conf >= 0.5 ? 'mid' : 'low';

  const targetField = row.target ? targetByKey[row.target] : null;
  const isDuplicate = row.target && (targetUseCount[row.target] ?? 0) > 1;

  return (
    <div className={styles.mapRow}>
      <div className={styles.mapColLeft}>
        <div className={styles.mapColHeader}>{row.source_col || `列${row.source_index + 1}`}</div>
        <div className={styles.mapColSample}>{sampleStr}</div>
      </div>
      <div className={styles.mapColMid}>
        <ConfidenceDot level={confLevel} userPicked={row.source === 'user'} />
      </div>
      <div className={styles.mapColRight}>
        <Select
          value={row.target ?? '__none__'}
          style={{ width: '100%' }}
          loading={saving}
          onChange={(v) => onChange(row.source_index, v === '__none__' ? null : v)}
          options={[
            { value: '__none__', label: '不导入这列' },
            ...targets.map((t) => ({
              value: t.key,
              label: `${t.label}${t.required ? ' *' : ''}${t.category ? ` · ${t.category}` : ''}`,
            })),
          ]}
        />
        {targetField?.required && (
          <Tag color="red" style={{ marginTop: 4, marginRight: 0 }}>
            必填
          </Tag>
        )}
        {isDuplicate && (
          <Tag color="orange" style={{ marginTop: 4 }}>
            该字段被多列重复映射
          </Tag>
        )}
      </div>
    </div>
  );
}

function ConfidenceDot({
  level,
  userPicked,
}: {
  level: 'high' | 'mid' | 'low';
  userPicked: boolean;
}) {
  if (userPicked) {
    return (
      <span title="你手动选的">
        <CheckCircleFilled style={{ color: '#1677ff' }} />
      </span>
    );
  }
  const color = level === 'high' ? '#16a34a' : level === 'mid' ? '#f59e0b' : '#d4d4d8';
  const title =
    level === 'high' ? 'AI 很自信' : level === 'mid' ? '请确认' : '没找到合适的对应字段';
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
      }}
    />
  );
}
