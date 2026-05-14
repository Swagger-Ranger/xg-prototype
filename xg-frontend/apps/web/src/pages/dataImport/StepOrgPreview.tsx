import { useEffect, useState } from 'react';
import { Button, Spin, Tag } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdApp';
import { describeApiError } from '@/utils/api-error';
import {
  previewOrgTree,
  type DataImportSession,
  type OrgPreviewNode,
} from '@/api/dataImport';
import styles from './index.module.css';

interface Props {
  session: DataImportSession;
  onSessionUpdate: (s: DataImportSession) => void;
  onBack: () => void;
  onNext: () => void;
}

const TYPE_LABEL: Record<OrgPreviewNode['type'], string> = {
  college: '学院',
  major: '专业',
  class: '班级',
};

export default function StepOrgPreview({ session, onSessionUpdate, onBack, onNext }: Props) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session.org_preview && !loading) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const s = await previewOrgTree(session.id);
      onSessionUpdate(s);
    } catch (e) {
      message.error(describeApiError(e, '组织树推断失败'));
    } finally {
      setLoading(false);
    }
  };

  const preview = session.org_preview;
  const errors = preview?.errors ?? [];
  const stats = preview?.stats;
  const tree = preview?.tree ?? [];

  if (loading && !preview) {
    return (
      <div className={styles.card}>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 12, color: 'var(--text-3)' }}>小夕正在从花名册推院系结构…</div>
        </div>
      </div>
    );
  }

  const hasBlockingError = errors.some((e) => e.row === 0);
  const createCount =
    (stats?.create_colleges ?? 0) + (stats?.create_majors ?? 0) + (stats?.create_classes ?? 0);

  return (
    <div className={styles.card}>
      <div className={styles.sectionLabel}>
        小夕从 {session.total_rows} 行学生数据里看出了这样的院系结构，请核对
      </div>

      {hasBlockingError && (
        <div className={styles.errorBanner}>
          <ExclamationCircleOutlined />
          {errors.find((e) => e.row === 0)?.message ?? '映射缺失，请回上一步'}
        </div>
      )}

      {!hasBlockingError && (
        <>
          {tree.length === 0 ? (
            <div className={styles.placeholder}>没有可推断的院系结构（学院/班级列可能为空）</div>
          ) : (
            <div className={styles.orgTree}>
              {tree.map((node, i) => (
                <OrgNode key={i} node={node} depth={0} />
              ))}
            </div>
          )}

          {stats && (
            <div className={styles.orgSummary}>
              这次将新建：
              <Tag color={stats.create_colleges > 0 ? 'blue' : 'default'}>
                {stats.create_colleges} 个学院
              </Tag>
              <Tag color={stats.create_majors > 0 ? 'blue' : 'default'}>
                {stats.create_majors} 个专业
              </Tag>
              <Tag color={stats.create_classes > 0 ? 'blue' : 'default'}>
                {stats.create_classes} 个班级
              </Tag>
              {createCount === 0 && <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>(全部已存在)</span>}
            </div>
          )}

          {errors.filter((e) => e.row > 0).length > 0 && (
            <details className={styles.errorList}>
              <summary>
                行级问题 ({errors.filter((e) => e.row > 0).length})
              </summary>
              {errors
                .filter((e) => e.row > 0)
                .map((e, i) => (
                  <div key={i} className={styles.errorListRow}>
                    第 {e.row} 行 · {e.message}
                  </div>
                ))}
            </details>
          )}
        </>
      )}

      <div className={styles.actions}>
        <Button onClick={onBack}>← 上一步</Button>
        <Button type="primary" disabled={hasBlockingError} onClick={onNext}>
          确认结构,下一步
        </Button>
      </div>
    </div>
  );
}

function OrgNode({ node, depth }: { node: OrgPreviewNode; depth: number }) {
  const isExisting = node.status === 'existing';
  const indent = depth * 24;
  return (
    <>
      <div className={styles.orgRow} style={{ paddingLeft: indent }}>
        <span className={isExisting ? styles.orgMarkerExisting : styles.orgMarkerNew}>
          {isExisting ? '✓' : '+'}
        </span>
        <span className={styles.orgName}>{node.name}</span>
        <span className={styles.orgTypeTag}>{TYPE_LABEL[node.type]}</span>
        <span
          className={isExisting ? styles.orgStatusExisting : styles.orgStatusNew}
        >
          {isExisting ? '已存在' : `新建${TYPE_LABEL[node.type]}`}
        </span>
      </div>
      {node.children?.map((c, i) => (
        <OrgNode key={i} node={c} depth={depth + 1} />
      ))}
    </>
  );
}
