import { useMemo, useState } from 'react';
import { Drawer, Empty, Input, Modal, Spin, Tag, Timeline, Button, Tooltip } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdApp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listConfigVersions,
  rollbackConfig,
  updateConfigSummary,
  type ConfigVersion,
} from '@/api/workflowConfig';
import { describeApiError } from '@/utils/api-error';

interface Props {
  open: boolean;
  onClose: () => void;
  bizType: 'leave' | 'leave_return';
  /** 当前 AI 待应用的 proposal 数(>0 时回滚需要警告) */
  pendingProposals?: number;
}

/**
 * 工作流配置版本历史 + 一键回滚 Drawer。
 *
 * 行为:前向回滚(把目标 version 的 yaml 拷成新 version+1 重新 published),
 * 历史不删可继续往前回滚。回滚到当前版本会被后端零改动拦截。
 *
 * UX:
 *  - 时间轴展示所有版本(version DESC),published 高亮
 *  - 每行右侧"回到此版本"按钮,点击 → 二次确认 → 调 rollback
 *  - 有未应用 AI proposal 时,回滚按钮 onClick 加一个警告
 */
export default function ConfigHistoryDrawer({
  open,
  onClose,
  bizType,
  pendingProposals = 0,
}: Props) {
  const qc = useQueryClient();
  const { data: versions = [], isLoading } = useQuery<ConfigVersion[]>({
    queryKey: ['configVersions', bizType],
    queryFn: () => listConfigVersions(bizType),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const currentVersion = useMemo(
    () => versions.find((v) => v.status === 'published')?.version ?? null,
    [versions],
  );

  const rollbackMutation = useMutation({
    mutationFn: (toVersion: number) => rollbackConfig(bizType, toVersion),
    onSuccess: (saved) => {
      message.success(`已回滚,新版本 v${saved.version}`);
      // 刷新摘要 + 历史 + AI 提案缓存
      qc.invalidateQueries({ queryKey: ['workflow-config.summary'] });
      qc.invalidateQueries({ queryKey: ['configVersions', bizType] });
      qc.invalidateQueries({ queryKey: ['leaveTypes'] });
      onClose();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '回滚失败')),
  });

  // 行内编辑状态:同时只允许编辑一行,避免多行未保存丢失。
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const summaryMutation = useMutation({
    mutationFn: (args: { version: number; summary: string }) =>
      updateConfigSummary(bizType, args.version, args.summary),
    onSuccess: () => {
      message.success('已保存');
      qc.invalidateQueries({ queryKey: ['configVersions', bizType] });
      setEditingVersion(null);
      setEditingDraft('');
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存失败')),
  });
  const startEdit = (v: ConfigVersion) => {
    setEditingVersion(v.version);
    setEditingDraft(v.change_summary ?? '');
  };
  const cancelEdit = () => {
    setEditingVersion(null);
    setEditingDraft('');
  };
  const saveEdit = (version: number) => {
    summaryMutation.mutate({ version, summary: editingDraft });
  };

  const triggerRollback = (v: ConfigVersion) => {
    Modal.confirm({
      title: `确认回滚到 v${v.version}?`,
      content: (
        <div>
          <p>
            回滚后会创建一个新版本(v{(currentVersion ?? 0) + 1}),内容拷自 v{v.version}。
            历史记录保留,之后可以再回滚到任意版本。
          </p>
          <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 8 }}>
            · 已生效的请假实例不受影响(用旧 yaml 跑完)<br />
            · 新提交的请假按回滚后的规则走<br />
            · 不会发通知给学生 / 老师
          </p>
          {pendingProposals > 0 && (
            <p style={{ color: 'var(--warn, #d4881e)', fontSize: 13, marginTop: 8, fontWeight: 500 }}>
              ⚠️ 检测到 {pendingProposals} 个未应用的 AI 改动建议,回滚后这些建议仍然在线
              但应用时基于回滚后的版本计算,可能出现不一致。建议先取消这些建议再回滚。
            </p>
          )}
        </div>
      ),
      okText: '确认回滚',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => rollbackMutation.mutateAsync(v.version),
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`配置历史 · ${bizType === 'leave' ? '请假' : '销假'}`}
      placement="right"
      width={520}
    >
      {isLoading ? (
        <Spin />
      ) : versions.length === 0 ? (
        <Empty description="暂无历史版本" />
      ) : (
        <Timeline
          items={versions.map((v) => ({
            color: v.status === 'published' ? 'green' : 'gray',
            children: (
              <div style={{ paddingBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>v{v.version}</span>
                  {v.status === 'published' ? (
                    <Tag color="green" style={{ margin: 0 }}>当前生效</Tag>
                  ) : (
                    <Tag style={{ margin: 0 }}>历史</Tag>
                  )}
                  {v.status !== 'published' && (
                    <Tooltip
                      title={
                        v.change_summary
                          ? `回到 v${v.version}:${v.change_summary}`
                          : `回到 v${v.version}`
                      }
                    >
                      <Button
                        size="small"
                        type="link"
                        loading={rollbackMutation.isPending}
                        onClick={() => triggerRollback(v)}
                        style={{ padding: 0, height: 'auto', fontSize: 12 }}
                      >
                        回到此版本
                      </Button>
                    </Tooltip>
                  )}
                </div>
                {editingVersion === v.version ? (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Input.TextArea
                      autoSize={{ minRows: 1, maxRows: 4 }}
                      maxLength={200}
                      showCount
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      placeholder="一句话变更记录(最多 200 字)"
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="small"
                        type="primary"
                        loading={summaryMutation.isPending}
                        onClick={() => saveEdit(v.version)}
                      >
                        保存
                      </Button>
                      <Button size="small" onClick={cancelEdit}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      color: 'var(--fg-2)',
                      fontSize: 13,
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {v.change_summary || (
                        <span style={{ color: 'var(--fg-3)' }}>(无摘要)</span>
                      )}
                    </span>
                    <Tooltip title={v.change_summary ? '修改摘要' : '补一句话变更记录'}>
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => startEdit(v)}
                        style={{ padding: '0 4px', height: 22 }}
                      />
                    </Tooltip>
                  </div>
                )}
                <div style={{ color: 'var(--fg-3)', fontSize: 11, marginTop: 2 }}>
                  {formatTime(v.updated_at)}
                  {v.updated_by != null && ` · 操作人 #${v.updated_by}`}
                </div>
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}
