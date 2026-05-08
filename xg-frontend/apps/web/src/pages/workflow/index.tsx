import { useState, useMemo, useEffect } from 'react';
import { Table, Button, Input, Modal, Form, Tabs, Tag, Alert } from 'antd';
import { message } from '@/utils/antdApp';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RobotOutlined } from '@ant-design/icons';
import type { WorkflowDefinition } from '@xg1/shared';
import {
  listDefinitions,
  getDefinition,
  updateDefinition,
  publishDefinition,
  getWorkflowRoleCodes,
  type DefinitionQueryParams,
  type RoleCode,
  type UpdateDefinitionPayload,
} from '@/api/workflow';
import { describeApiError } from '@/utils/api-error';
import { functionModuleLabel, isFunctionalAndPublished } from '@/utils/workflow-labels';
import WorkflowFlowChart from './WorkflowFlowChart';
import WorkflowAuthorDrawer from './WorkflowAuthorDrawer';
import NodeListEditor from './NodeListEditor';
import { parseDsl, serializeDsl, validateDsl, type FlowDsl, type FlowNode } from './dsl';
import styles from './index.module.css';

const PAGE_SIZE = 50;

export default function WorkflowManagement() {
  const [page, setPage] = useState(1);

  const [editDef, setEditDef] = useState<WorkflowDefinition | null>(null);
  const [viewDef, setViewDef] = useState<WorkflowDefinition | null>(null);

  // Visual editor state. We split the form into two modes:
  //   - 'visual': edit the DSL via NodeListEditor; YAML is hidden
  //   - 'advanced': raw YAML textarea (for power users / publicity nodes)
  // editDsl holds the parsed tree we mutate locally; on save we serialize back
  // to YAML before calling the update API.
  const [editMode, setEditMode] = useState<'visual' | 'advanced'>('visual');
  const [editName, setEditName] = useState('');
  const [editYaml, setEditYaml] = useState('');
  const [editDsl, setEditDsl] = useState<FlowDsl | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [authorOpen, setAuthorOpen] = useState(false);

  const [editForm] = Form.useForm<UpdateDefinitionPayload>();

  const queryClient = useQueryClient();

  // Fetch all (small set, ~10 rows). The functional+published filter is local
  // so admins only see what's currently effective for a real business module.
  const queryParams: DefinitionQueryParams = {
    page: 1,
    size: 200,
  };

  const { data, isFetching } = useQuery({
    queryKey: ['workflowDefinitions', queryParams],
    queryFn: () => listDefinitions(queryParams),
  });

  const { data: roleCodes = [] } = useQuery<RoleCode[]>({
    queryKey: ['workflowRoleCodes'],
    queryFn: getWorkflowRoleCodes,
    staleTime: 5 * 60 * 1000,
  });

  const visibleRows = useMemo(
    () => (data?.data ?? []).filter(isFunctionalAndPublished),
    [data?.data],
  );

  /**
   * "Save & publish" combo: edits create a v+1 draft and we immediately
   * publish it so the list (which only shows published) always reflects the
   * latest state. RED-level breaking changes still get rejected by the
   * publish endpoint and surfaced as a clear error.
   */
  const saveAndPublishMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateDefinitionPayload }) => {
      const draft = await updateDefinition(id, payload);
      return await publishDefinition(draft.id);
    },
    onSuccess: () => {
      message.success('已保存并发布——同 code 的旧版本自动停用。');
      queryClient.invalidateQueries({ queryKey: ['workflowDefinitions'] });
      editForm.resetFields();
      setEditDef(null);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '保存或发布失败')),
  });

  const handleEditSubmit = async () => {
    if (!editDef) return;
    if (editMode === 'visual') {
      if (!editDsl) {
        message.error('流程数据未加载完成，请重试');
        return;
      }
      const errors = validateDsl(editDsl);
      if (errors.length > 0) {
        message.error(errors[0]);
        return;
      }
      const yamlText = serializeDsl(editDsl);
      saveAndPublishMutation.mutate({
        id: editDef.id,
        payload: { name: editName, configYaml: yamlText },
      });
    } else {
      // Advanced YAML mode — pass through verbatim, backend validates.
      saveAndPublishMutation.mutate({
        id: editDef.id,
        payload: { name: editName, configYaml: editYaml },
      });
    }
  };

  const handleOpenEdit = async (record: WorkflowDefinition) => {
    // refetch for freshest configYaml
    const def = await getDefinition(record.id);
    setEditDef(def);
    setEditName(def.name);
    setEditYaml(def.config_yaml);
    setParseError(null);
    try {
      setEditDsl(parseDsl(def.config_yaml));
      setEditMode('visual');
    } catch (e: unknown) {
      // Fall back to advanced YAML mode if the DSL can't be parsed — better
      // to let the user fix the YAML than to block them entirely.
      setEditDsl(null);
      setEditMode('advanced');
      setParseError(e instanceof Error ? e.message : '解析 YAML 失败');
    }
  };

  // When user switches modes, sync the underlying string ↔ object so neither
  // side goes stale. visual → advanced: serialize current DSL into the YAML
  // textarea. advanced → visual: re-parse the (possibly hand-edited) YAML.
  const handleModeChange = (toAdvanced: boolean) => {
    if (toAdvanced && editDsl) {
      setEditYaml(serializeDsl(editDsl));
      setEditMode('advanced');
    } else if (!toAdvanced) {
      try {
        setEditDsl(parseDsl(editYaml));
        setParseError(null);
        setEditMode('visual');
      } catch (e: unknown) {
        setParseError(e instanceof Error ? e.message : '解析 YAML 失败');
      }
    } else {
      setEditMode(toAdvanced ? 'advanced' : 'visual');
    }
  };

  // Reset internal state when the modal closes.
  useEffect(() => {
    if (editDef === null) {
      setEditDsl(null);
      setEditYaml('');
      setEditName('');
      setEditMode('visual');
      setParseError(null);
      setAuthorOpen(false);
    }
  }, [editDef]);

  const handleOpenView = async (record: WorkflowDefinition) => {
    const def = await getDefinition(record.id);
    setViewDef(def);
  };

  const columns: ColumnsType<WorkflowDefinition> = [
    { title: '名称', dataIndex: 'name', width: 200 },
    {
      title: '功能模块',
      key: 'functionModule',
      width: 200,
      render: (_, record) => (
        <Tag color="blue" style={{ margin: 0 }}>
          {functionModuleLabel(record)}
        </Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 160,
      render: (v: string | null) => {
        if (!v) return '-';
        return new Date(v).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => {
        return (
          <span>
            <button className={styles.actionLink} onClick={() => handleOpenView(record)}>
              查看
            </button>
            <button className={styles.actionLink} onClick={() => handleOpenEdit(record)}>
              编辑流程
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>系统管理 · 工作流定义</h1>
      </div>

      <div className={styles.tableCard}>
        <Table<WorkflowDefinition>
          rowKey="id"
          columns={columns}
          dataSource={visibleRows}
          loading={isFetching}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: visibleRows.length,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
            size: 'small',
          }}
          size="middle"
        />
      </div>

      {/* Edit modal — saves as v+1 draft and immediately publishes */}
      <Modal
        title={
          editDef
            ? `编辑流程 — ${editDef.name}（保存即发布为 v${editDef.version + 1}）`
            : '编辑流程'
        }
        open={editDef !== null}
        onCancel={() => setEditDef(null)}
        footer={
          <div className={styles.editFooter}>
            <button
              type="button"
              className={styles.advancedToggle}
              onClick={() => handleModeChange(editMode !== 'advanced')}
            >
              {editMode === 'advanced' ? '← 返回可视化编辑' : '高级配置'}
            </button>
            <div className={styles.editFooterRight}>
              <Button onClick={() => setEditDef(null)}>取消</Button>
              <Button
                type="primary"
                loading={saveAndPublishMutation.isPending}
                onClick={handleEditSubmit}
              >
                保存并发布
              </Button>
            </div>
          </div>
        }
        width="min(1200px, 100vw)"
        destroyOnHidden
      >
        <div style={{ marginTop: 8 }}>
          <Form layout="vertical">
            <Form.Item label="流程名称">
              <Input
                value={editName}
                placeholder="留空保持原值"
                onChange={(e) => setEditName(e.target.value)}
              />
            </Form.Item>

            {parseError && editMode === 'visual' && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="可视化模式不可用"
                description={`原 YAML 解析失败：${parseError}。已自动切到高级 YAML 模式。`}
              />
            )}

            {editMode === 'visual' && editDsl && (
              <div className={styles.editGrid}>
                <div className={styles.editLeft}>
                  <div className={styles.editLeftHeader}>
                    <span className={styles.editLeftLabel}>流程节点</span>
                    <Button
                      type="primary"
                      ghost
                      size="small"
                      icon={<RobotOutlined />}
                      onClick={() => setAuthorOpen(true)}
                    >
                      AI 修改
                    </Button>
                  </div>
                  <NodeListEditor
                    value={editDsl.nodes as FlowNode[]}
                    onChange={(nodes) =>
                      setEditDsl({ ...(editDsl as FlowDsl), nodes })
                    }
                    roleCodes={roleCodes}
                    startId={editDsl.start}
                  />
                </div>
                <div className={styles.editRight}>
                  <div className={styles.editRightLabel}>实时预览</div>
                  <WorkflowFlowChart
                    dsl={editDsl}
                    roleCodes={roleCodes}
                    height={520}
                  />
                </div>
              </div>
            )}

            {editMode === 'advanced' && (
              <Form.Item
                label="原始 YAML"
                required
                extra={
                  roleCodes.length > 0 ? (
                    <div className={styles.roleHint}>
                      <span className={styles.roleHintLabel}>系统角色（点击复制 code）：</span>
                      <div className={styles.roleHintChips}>
                        {roleCodes.map((r) => (
                          <button
                            key={r.code}
                            type="button"
                            className={styles.roleChip}
                            title={`${r.name}（${r.code}）— 点击复制`}
                            onClick={() => {
                              navigator.clipboard.writeText(r.code).then(
                                () => message.success(`已复制 ${r.code}`),
                                () => message.error('复制失败'),
                              );
                            }}
                          >
                            <code>{r.code}</code>
                            <span className={styles.roleChipName}>{r.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null
                }
              >
                <Input.TextArea
                  rows={20}
                  className={styles.yaml}
                  value={editYaml}
                  onChange={(e) => setEditYaml(e.target.value)}
                />
              </Form.Item>
            )}
          </Form>
        </div>
        <WorkflowAuthorDrawer
          open={authorOpen}
          onClose={() => setAuthorOpen(false)}
          currentDsl={editDsl}
          onApply={(next) => setEditDsl(next)}
        />
      </Modal>

      {/* View modal */}
      <Modal
        title={viewDef ? `${viewDef.name} · v${viewDef.version}` : '查看'}
        open={viewDef !== null}
        onCancel={() => setViewDef(null)}
        footer={[
          <Button key="close" onClick={() => setViewDef(null)}>
            关闭
          </Button>,
        ]}
        width={820}
        destroyOnHidden
      >
        {viewDef && (
          <div>
            <div className={styles.metaLine} style={{ marginBottom: 12 }}>
              功能模块: {functionModuleLabel(viewDef)}
            </div>
            <Tabs
              defaultActiveKey="visual"
              items={[
                {
                  key: 'visual',
                  label: '流程图',
                  children: (() => {
                    try {
                      const parsed = parseDsl(viewDef.config_yaml);
                      return (
                        <WorkflowFlowChart
                          dsl={parsed}
                          roleCodes={roleCodes}
                          height={520}
                        />
                      );
                    } catch (e) {
                      return (
                        <Alert
                          type="warning"
                          showIcon
                          message="可视化失败"
                          description={`YAML 解析错误：${e instanceof Error ? e.message : '未知错误'}`}
                        />
                      );
                    }
                  })(),
                },
                {
                  key: 'yaml',
                  label: '高级配置',
                  children: (
                    <Input.TextArea
                      rows={22}
                      className={styles.yaml}
                      value={viewDef.config_yaml}
                      readOnly
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </Modal>

    </div>
  );
}
