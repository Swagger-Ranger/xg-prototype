import { useMemo } from 'react';
import { Button, Tag } from 'antd';
import { CheckCircleFilled, BulbOutlined } from '@ant-design/icons';
import type { DataImportSession } from '@/api/dataImport';
import styles from './index.module.css';

interface Props {
  session: DataImportSession;
  onRestart: () => void;
  onClose: () => void;
}

export default function StepResult({ session, onRestart, onClose }: Props) {
  const r = session.result_summary;
  const orgStats = session.org_preview?.stats;

  const failureCsv = useMemo(() => {
    if (!r?.failures || r.failures.length === 0) return null;
    const lines = ['行号,错误信息'];
    for (const f of r.failures) {
      const msg = (f.message ?? '').replace(/"/g, '""');
      lines.push(`${f.row},"${msg}"`);
    }
    const csv = lines.join('\n');
    return URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  }, [r]);

  if (!r) {
    return (
      <div className={styles.card}>
        <div className={styles.placeholder}>没有执行结果</div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.resultHeader}>
        <CheckCircleFilled className={styles.resultIcon} />
        <span className={styles.resultTitle}>导入完成</span>
      </div>

      {orgStats && (
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>院系结构：</span>
          <Tag color={orgStats.create_colleges > 0 ? 'blue' : 'default'}>
            新建 {orgStats.create_colleges} 个学院
          </Tag>
          <Tag color={orgStats.create_majors > 0 ? 'blue' : 'default'}>
            新建 {orgStats.create_majors} 个专业
          </Tag>
          <Tag color={orgStats.create_classes > 0 ? 'blue' : 'default'}>
            新建 {orgStats.create_classes} 个班级
          </Tag>
        </div>
      )}

      {(r.orgs_created ?? 0) > 0 && (
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>机关部门：</span>
          <Tag color="blue">
            新建 {r.orgs_created} 个
            {r.orgs_created_names && r.orgs_created_names.length > 0
              ? `(${r.orgs_created_names.slice(0, 4).join(', ')}${r.orgs_created_names.length > 4 ? '…' : ''})`
              : ''}
          </Tag>
        </div>
      )}

      <div className={styles.resultRow}>
        <span className={styles.resultLabel}>
          {session.scenario === 'counselor'
            ? '角色绑定：'
            : session.scenario === 'teacher'
              ? '教师：'
              : '学生：'}
        </span>
        {session.scenario === 'counselor' ? (
          <>
            <Tag color={r.updated > 0 ? 'green' : 'default'}>已绑 {r.updated} 人</Tag>
            <Tag color={r.skipped > 0 ? 'orange' : 'default'}>跳过 {r.skipped} 人</Tag>
            <Tag color={r.failed > 0 ? 'red' : 'default'}>失败 {r.failed} 人</Tag>
          </>
        ) : (
          <>
            <Tag color="green">新建 {r.created} 人</Tag>
            <Tag color={r.updated > 0 ? 'blue' : 'default'}>更新 {r.updated} 人</Tag>
            <Tag color={r.skipped > 0 ? 'orange' : 'default'}>跳过 {r.skipped} 人</Tag>
            <Tag color={r.failed > 0 ? 'red' : 'default'}>失败 {r.failed} 人</Tag>
          </>
        )}
      </div>

      {r.failures.length > 0 && (
        <details className={styles.errorList} open>
          <summary>失败明细</summary>
          {r.failures.slice(0, 50).map((f, i) => (
            <div key={i} className={styles.errorListRow}>
              第 {f.row} 行 · {f.message}
            </div>
          ))}
          {r.failures.length > 50 && (
            <div className={styles.errorListRow}>… 还有 {r.failures.length - 50} 条</div>
          )}
          {failureCsv && (
            <a
              href={failureCsv}
              download={`数据导入失败明细_${session.id}.csv`}
              style={{ display: 'inline-block', marginTop: 8 }}
            >
              下载失败明细 CSV
            </a>
          )}
        </details>
      )}

      {session.scenario === 'student' && (
        <div className={styles.nextHint}>
          <BulbOutlined style={{ color: '#1677ff' }} />
          <span>这批学生还没绑教职工。要先把教师导进来，再批量赋角色吗？</span>
        </div>
      )}
      {session.scenario === 'teacher' && (
        <div className={styles.nextHint}>
          <BulbOutlined style={{ color: '#1677ff' }} />
          <span>教师已建好。要给其中一部分人加角色（辅导员 / 教学秘书 / 党委秘书等）+ 配从属单位吗？走"教职工角色赋予"场景再导一次。</span>
        </div>
      )}
      {session.scenario === 'counselor' && (
        <div className={styles.nextHint}>
          <BulbOutlined style={{ color: '#1677ff' }} />
          <span>角色绑好了。如果导的是辅导员，还要在「系统管理 → 组织派班」配他管哪几个班。</span>
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={onRestart}>再导一批</Button>
        <Button type="primary" onClick={onClose}>
          完成，返回工作台
        </Button>
      </div>
    </div>
  );
}
