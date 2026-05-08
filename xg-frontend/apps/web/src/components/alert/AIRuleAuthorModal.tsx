import { useState } from 'react';
import { Alert, Button, Modal, Space, Table, Tag } from 'antd';
import { message } from '@/utils/antdApp';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  authorAlertRule,
  createAlertRule,
  patchAlertRule,
  previewAlertRule,
  type AlertRuleAuthorResult,
  type AlertRulePreviewResult,
  type AlertRulePreviewSample,
} from '@/api/alert';
import styles from './AIRuleAuthorModal.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  mode?: 'create' | 'edit';
  editId?: string;
  initialDsl?: Record<string, unknown> | null;
}

const CREATE_EXAMPLES = [
  '最近 30 天内累计迟到 5 次以上的学生，标记为中等预警',
  '连续 3 天未签到的学生，紧急预警',
  '近 7 天违纪事件超过 2 次的学生，高预警',
];

const EDIT_EXAMPLES = [
  '阈值改成 7',
  '级别降到低',
  '窗口扩大到 60 天',
  '加一个条件：限定某个班级',
];

export default function AIRuleAuthorModal({
  open,
  onClose,
  mode = 'create',
  editId,
  initialDsl,
}: Props) {
  const isEdit = mode === 'edit';
  const EXAMPLES = isEdit ? EDIT_EXAMPLES : CREATE_EXAMPLES;
  const qc = useQueryClient();
  const [nl, setNl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AlertRuleAuthorResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<AlertRulePreviewResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const reset = () => {
    setNl('');
    setResult(null);
    setPreview(null);
    setSavedId(null);
  };

  const handleClose = () => {
    onClose();
    setTimeout(reset, 300);
  };

  const handleGenerate = async () => {
    if (!nl.trim()) {
      message.warning(isEdit ? '请描述修改诉求' : '请输入规则描述');
      return;
    }
    setLoading(true);
    setResult(null);
    setPreview(null);
    setSavedId(null);
    try {
      const prompt = isEdit && initialDsl
        ? `基于以下已有规则 DSL，按修改需求改写并输出一份完整的新 DSL：\n\n当前 DSL:\n\`\`\`json\n${JSON.stringify(initialDsl, null, 2)}\n\`\`\`\n\n修改需求：${nl.trim()}`
        : nl.trim();
      const r = await authorAlertRule(prompt);
      setResult(r);
      if (!r.ok) {
        message.warning('AI 生成的规则未通过校验，请查看右侧错误信息');
      } else {
        message.success('规则已生成');
      }
    } catch (e) {
      message.error('生成失败');
    } finally {
      setLoading(false);
    }
  };

  const dsl = result?.dsl ?? null;
  const validation = result?.validation;
  const lastAttempt = result?.attempts?.[result.attempts.length - 1];

  const handlePreview = async () => {
    if (!dsl) return;
    setPreviewLoading(true);
    setPreview(null);
    try {
      const p = await previewAlertRule(dsl as Record<string, unknown>, 20);
      setPreview(p);
      if (!p.valid) {
        message.warning('试算失败：DSL 未通过校验');
      } else {
        message.success(`试算完成：命中 ${p.preview?.total_matched ?? 0} 名学生`);
      }
    } catch (e) {
      message.error('试算失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    if (!dsl) return;
    setSaving(true);
    try {
      const r = isEdit && editId
        ? await patchAlertRule(editId, { dsl: dsl as Record<string, unknown> })
        : await createAlertRule(dsl as Record<string, unknown>);
      if (r.ok) {
        setSavedId(isEdit ? editId! : r.id ?? '');
        message.success(isEdit ? '已保存修改' : '规则已保存，下次扫描生效');
        qc.invalidateQueries({ queryKey: ['alertRuleStats'] });
        if (isEdit && editId) {
          qc.invalidateQueries({ queryKey: ['alertRuleDetail', editId] });
        }
      } else {
        const msg = r.validation?.errors?.join('; ') || r.error_message || '保存失败';
        message.error(msg);
      }
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const previewColumns = [
    { title: '学生', dataIndex: 'student_name', width: 100, render: (v: string | null) => v ?? '—' },
    { title: '班级', dataIndex: 'class_name', width: 140, render: (v: string | null) => v ?? '—' },
    {
      title: '命中值',
      dataIndex: 'values',
      render: (v: Record<string, unknown>) => (
        <code style={{ fontSize: 11 }}>{JSON.stringify(v)}</code>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={1040}
      title={
        <span>
          <ThunderboltOutlined style={{ color: '#6366f1', marginRight: 8 }} />
          {isEdit ? 'AI 改写预警规则' : 'AI 写预警规则'}
        </span>
      }
      destroyOnClose
    >
      <div className={styles.body}>
        <div className={styles.left}>
          <div className={styles.hint}>
            {isEdit
              ? '用一句话描述修改诉求，AI 会在现有 DSL 上改写。'
              : '用一句自然语言描述规则，AI 会自动转成可执行的 DSL。'}
          </div>
          {isEdit && initialDsl && (
            <div className={styles.dslWrap} style={{ marginBottom: 12 }}>
              <div className={styles.dslLabel}>当前 DSL</div>
              <pre className={styles.dslJson} style={{ maxHeight: 140 }}>
                {JSON.stringify(initialDsl, null, 2)}
              </pre>
            </div>
          )}
          <textarea
            className={styles.textarea}
            placeholder={`例如：\n${EXAMPLES.map((e) => `· ${e}`).join('\n')}`}
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            rows={isEdit ? 5 : 8}
            disabled={loading}
          />
          <div className={styles.examples}>
            <span className={styles.examplesLabel}>快速示例</span>
            <Space wrap size={4}>
              {EXAMPLES.map((ex) => (
                <Tag
                  key={ex}
                  className={styles.exampleTag}
                  onClick={() => !loading && setNl(ex)}
                >
                  {ex.slice(0, 16)}…
                </Tag>
              ))}
            </Space>
          </div>
          <div className={styles.actions}>
            <Button type="primary" loading={loading} onClick={handleGenerate} block>
              {loading ? '生成中…' : isEdit ? '生成修改' : '生成 DSL'}
            </Button>
          </div>
        </div>

        <div className={styles.right}>
          {!result && !loading && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>✨</div>
              <div className={styles.emptyText}>
                左侧输入规则描述后点「生成 DSL」<br />
                生成结果会展示在这里
              </div>
            </div>
          )}

          {result && (
            <>
              <div className={styles.statusRow}>
                {result.ok ? (
                  <Tag color="green">Schema 校验通过</Tag>
                ) : (
                  <Tag color="red">校验未通过</Tag>
                )}
                {result.attempts?.length > 1 && (
                  <Tag color="blue">重试 {result.attempts.length - 1} 次</Tag>
                )}
                {savedId && <Tag color="purple">已保存 #{savedId}</Tag>}
              </div>

              {!result.ok && result.error_message && (
                <Alert
                  type="error"
                  message="AI 生成失败"
                  description={result.error_message}
                  showIcon
                  style={{ marginBottom: 12 }}
                />
              )}

              {validation && validation.errors?.length > 0 && (
                <Alert
                  type="warning"
                  message="Schema 校验错误"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {validation.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  }
                  style={{ marginBottom: 12 }}
                />
              )}

              {!result.ok && lastAttempt?.errors?.length ? (
                <Alert
                  type="warning"
                  message="Sidecar schema 错误"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {lastAttempt.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  }
                  style={{ marginBottom: 12 }}
                />
              ) : null}

              {dsl && (
                <>
                  <div className={styles.dslWrap}>
                    <div className={styles.dslLabel}>DSL JSON</div>
                    <pre className={styles.dslJson}>{JSON.stringify(dsl, null, 2)}</pre>
                  </div>

                  {result.ok && (
                    <div className={styles.saveRow}>
                      <Space>
                        <Button onClick={handlePreview} loading={previewLoading}>
                          试算（看会命中谁）
                        </Button>
                        <Button
                          type="primary"
                          onClick={handleSave}
                          loading={saving}
                          disabled={!!savedId}
                        >
                          {savedId ? '已保存' : isEdit ? '保存修改' : '保存为规则'}
                        </Button>
                      </Space>
                    </div>
                  )}

                  {preview && preview.valid && preview.preview && (
                    <div className={styles.previewWrap}>
                      <div className={styles.dslLabel}>
                        试算结果 · 共命中 {preview.preview.total_matched} 人（最多显示 20 人）
                      </div>
                      <Table<AlertRulePreviewSample>
                        rowKey="student_id"
                        columns={previewColumns}
                        dataSource={preview.preview.samples}
                        pagination={false}
                        size="small"
                        locale={{ emptyText: '无命中学生' }}
                      />
                    </div>
                  )}

                  {preview && !preview.valid && (
                    <Alert
                      type="warning"
                      message="试算前校验未通过"
                      description={
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {(preview.errors ?? []).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      }
                      style={{ marginTop: 8 }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
