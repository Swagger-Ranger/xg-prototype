// 知识库管理页 — 仿 Dify 的三层导航：
//   KB 列表（卡片）→ KB 详情（三 tab：文档 / 设置 / 命中测试）→ 文档详情（chunks 抽屉）
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Radio,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EyeOutlined,
  InboxOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  createEvalCase,
  createKb,
  deleteDocument,
  deleteEvalCase,
  deleteKb,
  getKb,
  hitTest as hitTestApi,
  listChunks,
  listDocuments,
  listEvalCases,
  listKbs,
  runEvaluation,
  toggleChunk,
  updateKb,
  uploadDocument,
  type EvalCase,
  type EvalResult,
  type HitTestResult,
  type KbChunk,
  type KbDocument,
  type KnowledgeBase,
  type RetrievalMode,
} from '@/api/kb';

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;

const STATUS_LABEL: Record<string, string> = {
  pending: '排队中', processing: '处理中', done: '已完成', error: '失败',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'default', processing: 'processing', done: 'success', error: 'error',
};
const MODE_LABEL: Record<RetrievalMode, string> = {
  vector: '向量', keyword: '关键词', hybrid: '混合（推荐）',
};

export default function KnowledgePanel() {
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  return selectedKbId ? (
    <KbDetail kbId={selectedKbId} onBack={() => setSelectedKbId(null)} />
  ) : (
    <KbList onSelect={(id) => setSelectedKbId(id)} />
  );
}

// ===================== KbList =====================

function KbList({ onSelect }: { onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: kbs = [], isFetching } = useQuery({
    queryKey: ['kb', 'list'],
    queryFn: listKbs,
    staleTime: 30_000,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const createMut = useMutation({
    mutationFn: createKb,
    onSuccess: () => {
      message.success('知识库创建成功');
      qc.invalidateQueries({ queryKey: ['kb', 'list'] });
      setCreateOpen(false);
      createForm.resetFields();
    },
    onError: (e: Error) => message.error(e.message || '创建失败'),
  });
  const deleteMut = useMutation({
    mutationFn: deleteKb,
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
    onError: (e: Error) => message.error(e.message || '删除失败'),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space style={{ justifyContent: 'space-between', display: 'flex' }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {kbs.length === 0 ? '尚未创建知识库' : `共 ${kbs.length} 个知识库`}
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建知识库
        </Button>
      </Space>

      {isFetching && kbs.length === 0 ? (
        <Card><Spin size="small" /> 加载中…</Card>
      ) : kbs.length === 0 ? (
        <Empty description="点右上角「新建知识库」开始" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {kbs.map((kb) => (
            <Card
              key={kb.id}
              hoverable
              onClick={() => onSelect(kb.id)}
              actions={[
                <Popconfirm
                  key="del"
                  title="确认删除？"
                  description="软删除，可在数据库恢复。"
                  okButtonProps={{ danger: true }}
                  onConfirm={(e) => { e?.stopPropagation(); deleteMut.mutate(kb.id); }}
                  onCancel={(e) => e?.stopPropagation()}
                >
                  <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                </Popconfirm>,
              ]}
              styles={{ body: { padding: 16 } }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text strong style={{ fontSize: 15 }}>{kb.name}</Text>
                <Tag bordered={false} color="blue">{MODE_LABEL[kb.retrieval_mode]}</Tag>
              </div>
              {kb.description && (
                <Paragraph
                  type="secondary"
                  style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}
                  ellipsis={{ rows: 2 }}
                >
                  {kb.description}
                </Paragraph>
              )}
              <Space style={{ marginTop: 12 }} size={6} wrap>
                <Tag>{kb.doc_count} 文档</Tag>
                <Tag>{kb.chunk_count} chunks</Tag>
                <Tag>{kb.embedding_dim}d</Tag>
              </Space>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title="新建知识库"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createMut.isPending}
        width="min(560px, 100vw)"
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            chunk_size: 500, chunk_overlap: 50,
            retrieval_mode: 'hybrid', top_k: 5,
            embedding_model: 'qwen-text-embedding-v3',
          }}
          onFinish={(values) => createMut.mutate(values)}
        >
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请填写名称' }]}>
            <Input placeholder="例如：教务规章" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="可选" maxLength={200} showCount />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="chunk_size" label="切分长度" style={{ flex: 1 }}
              rules={[{ required: true }]}>
              <InputNumber min={100} max={4000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="chunk_overlap" label="重叠" style={{ flex: 1 }}
              rules={[{ required: true }]}>
              <InputNumber min={0} max={500} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="retrieval_mode" label="检索模式" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: '向量', value: 'vector' },
                { label: '关键词', value: 'keyword' },
                { label: '混合（推荐）', value: 'hybrid' },
              ]}
            />
          </Form.Item>
          <Form.Item name="top_k" label="Top K" rules={[{ required: true }]}>
            <InputNumber min={1} max={50} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="embedding_model" label="嵌入模型">
            <Select
              options={[
                { label: 'qwen-text-embedding-v3 (1024d)', value: 'qwen-text-embedding-v3' },
                { label: 'BGE M3 (1024d)', value: 'bge-m3' },
                { label: 'sentence-transformers/local (512d)', value: 'st-local' },
              ]}
            />
          </Form.Item>
          <Alert
            type="info" showIcon
            message="提示：嵌入维度由后端实际模型决定（当前 sidecar 使用 512d 本地模型）。"
          />
        </Form>
      </Modal>
    </div>
  );
}

// ===================== KbDetail =====================

function KbDetail({ kbId, onBack }: { kbId: string; onBack: () => void }) {
  const { data: kbs = [] } = useQuery({ queryKey: ['kb', 'list'], queryFn: listKbs });
  const kb = useMemo(() => kbs.find((k) => k.id === kbId), [kbs, kbId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Space>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回列表</Button>
        <Text strong style={{ fontSize: 16 }}>{kb?.name ?? '加载中…'}</Text>
        {kb && <Tag bordered={false}>{MODE_LABEL[kb.retrieval_mode]} · top {kb.top_k}</Tag>}
      </Space>
      <Tabs
        defaultActiveKey="documents"
        items={[
          { key: 'documents', label: '文档', children: <DocumentsTab kbId={kbId} /> },
          { key: 'settings', label: '设置', children: kb ? <SettingsTab kb={kb} /> : <Spin /> },
          { key: 'hit-test', label: '命中测试', children: kb ? <HitTestTab kb={kb} /> : <Spin /> },
          { key: 'evaluation', label: '评估', children: <EvaluationTab kbId={kbId} /> },
        ]}
      />
    </div>
  );
}

// ----------- Documents Tab -----------

function DocumentsTab({ kbId }: { kbId: string }) {
  const qc = useQueryClient();
  const { data: docs = [], isFetching, refetch } = useQuery({
    queryKey: ['kb', kbId, 'docs'],
    queryFn: () => listDocuments(kbId),
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      return data.some((d) => d.indexing_status === 'pending' || d.indexing_status === 'processing')
        ? 2000 : false;
    },
  });
  const [chunksDoc, setChunksDoc] = useState<KbDocument | null>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDocument(kbId, file),
    onSuccess: () => {
      message.success('文档上传成功，正在向量化…');
      refetch();
    },
    onError: (e: Error) => message.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['kb', kbId, 'docs'] });
      qc.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const draggerProps: UploadProps = {
    multiple: true,
    accept: '.md,.markdown,.txt,.pdf,.docx',
    showUploadList: false,
    beforeUpload: (file) => {
      uploadMut.mutate(file);
      return false; // never let antd auto-upload
    },
  };

  const cols: ColumnsType<KbDocument> = [
    { title: '名称', dataIndex: 'name' },
    {
      title: '状态', dataIndex: 'indexing_status', width: 120,
      render: (s: string, r) => (
        <Space>
          <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_LABEL[s] ?? s}</Tag>
          {s === 'error' && r.indexing_error && (
            <Tooltip title={r.indexing_error}>
              <Text type="danger" style={{ fontSize: 11, cursor: 'help' }}>查看错误</Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    { title: '字数', dataIndex: 'char_count', width: 80, render: (v) => v ?? '—' },
    { title: 'Chunks', dataIndex: 'chunk_count', width: 80, render: (v) => v ?? '—' },
    {
      title: '创建', dataIndex: 'created_at', width: 130,
      render: (v) => v ? dayjs(v).format('MM-DD HH:mm') : '—',
    },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small" type="link" icon={<EyeOutlined />}
            disabled={r.indexing_status !== 'done'}
            onClick={() => setChunksDoc(r)}
          >chunks</Button>
          <Popconfirm title="删除该文档及全部 chunks？" okButtonProps={{ danger: true }}
            onConfirm={() => deleteMut.mutate(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Dragger {...draggerProps} style={{ padding: 12 }}>
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽上传 .md / .txt / .pdf / .docx</p>
        <p className="ant-upload-hint" style={{ fontSize: 12 }}>
          上传后自动按 KB 配置切分并嵌入；状态会在表格里同步刷新
        </p>
      </Dragger>
      <Table<KbDocument>
        size="small"
        rowKey="id"
        loading={isFetching}
        columns={cols}
        dataSource={docs}
        pagination={false}
      />
      <ChunksDrawer doc={chunksDoc} onClose={() => setChunksDoc(null)} />
    </div>
  );
}

function ChunksDrawer({ doc, onClose }: { doc: KbDocument | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: chunks = [], isFetching } = useQuery({
    queryKey: ['kb', 'doc', doc?.id, 'chunks'],
    queryFn: () => listChunks(doc!.id),
    enabled: !!doc,
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleChunk(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb', 'doc', doc?.id, 'chunks'] }),
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <Drawer
      open={!!doc}
      onClose={onClose}
      title={doc ? `${doc.name} · ${chunks.length} chunks` : ''}
      width="min(720px, 100vw)"
      destroyOnHidden
    >
      {isFetching && chunks.length === 0 ? (
        <Spin />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chunks.map((c: KbChunk) => (
            <Card
              key={c.id} size="small"
              title={
                <Space>
                  <Tag>#{c.chunk_index}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>{c.char_count} 字</Text>
                </Space>
              }
              extra={
                <Switch
                  size="small" checked={c.enabled}
                  onChange={(checked) => toggleMut.mutate({ id: c.id, enabled: checked })}
                />
              }
              styles={{ body: { padding: '10px 12px', fontSize: 12, lineHeight: 1.6 } }}
            >
              <Paragraph
                ellipsis={{ rows: 6, expandable: true, symbol: '展开' }}
                style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}
              >
                {c.content}
              </Paragraph>
            </Card>
          ))}
        </div>
      )}
    </Drawer>
  );
}

// ----------- Settings Tab -----------

function SettingsTab({ kb }: { kb: KnowledgeBase }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const updateMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateKb(kb.id, payload),
    onSuccess: () => {
      message.success('已保存');
      qc.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={kb}
      onFinish={(values) => updateMut.mutate(values)}
      style={{ maxWidth: 600 }}
    >
      <Form.Item name="name" label="名称" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="description" label="描述">
        <Input.TextArea rows={2} maxLength={200} showCount />
      </Form.Item>
      <Alert
        type="warning" showIcon style={{ marginBottom: 12 }}
        message="切分长度变化后旧 chunks 不会自动重切；想生效请删除文档重新上传。"
      />
      <Space size={12} style={{ display: 'flex' }}>
        <Form.Item name="chunk_size" label="切分长度" style={{ flex: 1 }}>
          <InputNumber min={100} max={4000} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="chunk_overlap" label="重叠" style={{ flex: 1 }}>
          <InputNumber min={0} max={500} style={{ width: '100%' }} />
        </Form.Item>
      </Space>
      <Form.Item name="retrieval_mode" label="检索模式">
        <Radio.Group
          options={[
            { label: '向量', value: 'vector' },
            { label: '关键词', value: 'keyword' },
            { label: '混合（推荐）', value: 'hybrid' },
          ]}
        />
      </Form.Item>
      <Space size={12} style={{ display: 'flex' }}>
        <Form.Item name="top_k" label="Top K" style={{ flex: 1 }}>
          <InputNumber min={1} max={50} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="score_threshold" label="得分阈值（向量模式生效）" style={{ flex: 1 }}>
          <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
        </Form.Item>
      </Space>
      <Form.Item name="rerank_model" label="重排模型（暂未启用）">
        <Select
          allowClear
          options={[
            { label: '不使用', value: null },
            { label: 'BGE Reranker (本地)', value: 'bge-reranker-base' },
            { label: 'Cohere Rerank', value: 'cohere-rerank' },
            { label: '通义 Rerank', value: 'qwen-rerank' },
          ]}
        />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={updateMut.isPending}>
        保存
      </Button>
    </Form>
  );
}

// ----------- HitTest Tab -----------

function HitTestTab({ kb }: { kb: KnowledgeBase }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<RetrievalMode>(kb.retrieval_mode);
  const [topK, setTopK] = useState<number>(kb.top_k);
  const [results, setResults] = useState<HitTestResult[]>([]);
  const ranOnceRef = useRef(false);

  const mut = useMutation({
    mutationFn: () => hitTestApi(kb.id, { query: query.trim(), mode, top_k: topK }),
    onSuccess: (rows) => {
      setResults(rows);
      ranOnceRef.current = true;
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card size="small">
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入查询语句，例如：请假 5 天怎么走流程？"
            onPressEnter={() => query.trim() && mut.mutate()}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => query.trim() && mut.mutate()} loading={mut.isPending}>
            查询
          </Button>
        </Space.Compact>
        <Space style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>检索模式</Text>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as RetrievalMode)}
            options={[
              { label: '向量', value: 'vector' },
              { label: '关键词', value: 'keyword' },
              { label: '混合', value: 'hybrid' },
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>Top K</Text>
          <InputNumber min={1} max={20} value={topK} onChange={(v) => v != null && setTopK(v)} size="small" style={{ width: 70 }} />
        </Space>
      </Card>

      {!ranOnceRef.current && results.length === 0 ? (
        <Empty description="输入查询后点回车 / 「查询」开始命中测试" />
      ) : results.length === 0 ? (
        <Empty description="未命中任何 chunk，可调大 Top K 或切换检索模式" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((r, i) => (
            <Card
              key={r.chunk_id} size="small"
              title={
                <Space size={6}>
                  <Tag color="blue">#{i + 1}</Tag>
                  <Tag>{r.source}</Tag>
                  <Text style={{ fontSize: 13 }}>{r.document_name ?? '—'}</Text>
                </Space>
              }
              extra={
                <Space size={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>chunk #{r.chunk_index}</Text>
                  <Progress
                    type="dashboard" size={32}
                    percent={Math.min(100, Math.round(r.score * 1000) / 10)}
                    format={() => r.score.toFixed(3)}
                  />
                </Space>
              }
              styles={{ body: { padding: '10px 12px' } }}
            >
              <Paragraph
                style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}
                ellipsis={{ rows: 5, expandable: true, symbol: '展开' }}
              >
                {r.content}
              </Paragraph>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------- Evaluation Tab -----------
//
// 用法：
//   1) 维护一组「query → 期望命中文档」的测试用例
//   2) 点「运行评估」让 retriever 跑全部用例，按 doc 级 recall@K + MRR 打分
//   3) 改 chunking / 阈值 / reranker / embedding 等参数前后各跑一次，看分数变化
//
// 指标怎么读：
//   - Recall@5：top-5 里命中正确文档的查询比例。≥90% 优秀，70-90% 良好，<70% 要改
//   - MRR：正确文档的平均排名倒数。1.0 = 永远第 1，0.5 = 平均第 2，0 = 都没命中
//   - 失败 case：列在下方表格中，针对性补文档 / 加同义词

function EvaluationTab({ kbId }: { kbId: string }) {
  const qc = useQueryClient();
  const { data: kb } = useQuery({
    queryKey: ['kb', kbId, 'detail'],
    queryFn: () => getKb(kbId),
  });
  const { data: cases = [], isFetching: casesLoading } = useQuery({
    queryKey: ['kb', kbId, 'eval-cases'],
    queryFn: () => listEvalCases(kbId),
  });
  const { data: docs = [] } = useQuery({
    queryKey: ['kb', kbId, 'docs'],
    queryFn: () => listDocuments(kbId),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();

  const runMut = useMutation({
    mutationFn: () => runEvaluation(kbId, 5),
    onSuccess: () => {
      message.success('评估完成');
      qc.invalidateQueries({ queryKey: ['kb', kbId, 'detail'] });
      qc.invalidateQueries({ queryKey: ['kb', 'list'] });
    },
    onError: (e: Error) => message.error(e.message),
  });
  const createCaseMut = useMutation({
    mutationFn: (payload: { query: string; expected_doc_ids: string[]; note?: string }) =>
      createEvalCase(kbId, payload),
    onSuccess: () => {
      message.success('已添加用例');
      qc.invalidateQueries({ queryKey: ['kb', kbId, 'eval-cases'] });
      setAddOpen(false);
      addForm.resetFields();
    },
    onError: (e: Error) => message.error(e.message),
  });
  const deleteCaseMut = useMutation({
    mutationFn: deleteEvalCase,
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['kb', kbId, 'eval-cases'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const lastResult: EvalResult | null = kb?.last_eval_result ?? null;
  const lastAt = kb?.last_eval_at;
  const docNameById = useMemo(
    () => new Map(docs.map((d) => [d.id, d.name])),
    [docs],
  );

  const caseCols: ColumnsType<EvalCase> = [
    { title: '查询', dataIndex: 'query', ellipsis: true },
    {
      title: '期望命中文档', dataIndex: 'expected_doc_ids', width: 280,
      render: (ids: string[]) => (
        <Space size={4} wrap>
          {ids.map((id) => (
            <Tag key={id}>{docNameById.get(id) ?? id}</Tag>
          ))}
        </Space>
      ),
    },
    { title: '备注', dataIndex: 'note', width: 120, render: (v) => v || '—' },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_, r) => (
        <Popconfirm title="删除此用例？" okButtonProps={{ danger: true }}
          onConfirm={() => deleteCaseMut.mutate(r.id)}>
          <Button size="small" type="link" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const detailCols: ColumnsType<NonNullable<EvalResult['per_case']>[number]> = [
    {
      title: '通过', dataIndex: 'passed', width: 70,
      render: (p: boolean) => p
        ? <Tag color="success">✓</Tag>
        : <Tag color="error">✗</Tag>,
    },
    { title: '查询', dataIndex: 'query', ellipsis: true },
    {
      title: '命中位次', dataIndex: 'hit_rank', width: 100,
      render: (r: number | null) => r ? `#${r}` : <Text type="secondary">未命中</Text>,
    },
    {
      title: '期望文档', dataIndex: 'expected_doc_ids', width: 220,
      render: (ids: string[]) => (
        <Space size={4} wrap>
          {ids.map((id) => <Tag key={id}>{docNameById.get(id) ?? id}</Tag>)}
        </Space>
      ),
    },
    {
      title: 'top-5 命中', dataIndex: 'hits', width: 320,
      render: (hits: EvalResult['per_case'][number]['hits'], row) => (
        <Space size={4} wrap>
          {hits.length === 0 ? <Text type="secondary">—</Text> : hits.map((h) => {
            const isExpected = row.expected_doc_ids.includes(h.document_id);
            return (
              <Tag key={`${h.document_id}-${h.rank}`} color={isExpected ? 'success' : 'default'}>
                #{h.rank} {h.document_name ?? '—'}
              </Tag>
            );
          })}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Alert
        type="info" showIcon
        message="如何使用评估"
        description={
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            <div><b>1.</b> 在「测试用例」表里维护一组 query → 期望命中的文档</div>
            <div><b>2.</b> 改完参数（chunking / 阈值 / 模型）后点「运行评估」</div>
            <div><b>3.</b> 看 <b>Recall@5</b>（≥90% 优秀 / 70–90% 良好 / &lt;70% 要改）和 <b>MRR</b>（越接近 1 越好）</div>
            <div><b>4.</b> 失败的 case 在下方明细表里，针对性补文档 / 加同义词</div>
          </div>
        }
      />

      {/* 指标卡 + 运行按钮 */}
      <Card size="small">
        <Space size={32} wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space size={32} wrap>
            <Metric
              label="Recall@5" tip="top-5 命中正确文档的查询比例"
              value={lastResult ? `${(lastResult.recall_at_k * 100).toFixed(1)}%` : '—'}
              tone={lastResult ? scoreTone(lastResult.recall_at_k) : undefined}
            />
            <Metric
              label="MRR" tip="正确文档的平均排名倒数 (1.0 = 永远第 1)"
              value={lastResult ? lastResult.mrr.toFixed(3) : '—'}
              tone={lastResult ? scoreTone(lastResult.mrr) : undefined}
            />
            <Metric
              label="测试用例" tip="当前测试集大小"
              value={`${cases.length}`}
            />
            <Metric
              label="上次运行" tip="last_eval_at"
              value={lastAt ? dayjs(lastAt).format('MM-DD HH:mm') : '—'}
            />
          </Space>
          <Button
            type="primary" size="large"
            loading={runMut.isPending}
            disabled={cases.length === 0}
            onClick={() => runMut.mutate()}
          >
            运行评估
          </Button>
        </Space>
      </Card>

      {/* 测试用例 */}
      <Card
        size="small"
        title={<Text strong>测试用例</Text>}
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            新增用例
          </Button>
        }
      >
        <Table<EvalCase>
          size="small" rowKey="id"
          loading={casesLoading}
          columns={caseCols}
          dataSource={cases}
          pagination={false}
          locale={{ emptyText: '尚无用例，点右上角「新增」添加' }}
        />
      </Card>

      {/* 上次运行明细 */}
      {lastResult && lastResult.per_case.length > 0 && (
        <Card
          size="small"
          title={
            <Space>
              <Text strong>上次运行明细</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {lastResult.passed_cases}/{lastResult.total_cases} 通过 · {dayjs(lastResult.ran_at).format('MM-DD HH:mm:ss')}
              </Text>
            </Space>
          }
        >
          <Table
            size="small" rowKey="case_id"
            columns={detailCols}
            dataSource={lastResult.per_case}
            pagination={false}
          />
        </Card>
      )}

      {/* 新增用例 Modal */}
      <Modal
        title="新增测试用例"
        open={addOpen}
        onCancel={() => { setAddOpen(false); addForm.resetFields(); }}
        onOk={() => addForm.submit()}
        confirmLoading={createCaseMut.isPending}
        width="min(520px, 100vw)"
        destroyOnHidden
      >
        <Form
          form={addForm} layout="vertical"
          onFinish={(values) => createCaseMut.mutate(values)}
        >
          <Form.Item name="query" label="查询语句" rules={[{ required: true, message: '请输入查询' }]}>
            <Input.TextArea rows={2} placeholder="例：请假超过3天怎么审批" maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="expected_doc_ids" label="期望命中的文档" rules={[{ required: true, message: '至少选 1 个' }]}>
            <Select
              mode="multiple" placeholder="多选；查询命中其中任一即视为通过"
              options={docs.map((d) => ({ label: d.name, value: d.id }))}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="note" label="备注（可选）">
            <Input placeholder="例：高频问题 / 易错样本" maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function Metric({
  label, value, tip, tone,
}: { label: string; value: string; tip?: string; tone?: 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? '#3f8600'
    : tone === 'warning' ? '#cf8e00'
    : tone === 'danger' ? '#cf1322'
    : undefined;
  return (
    <div>
      <Tooltip title={tip}>
        <Text type="secondary" style={{ fontSize: 12, cursor: tip ? 'help' : undefined }}>
          {label}
        </Text>
      </Tooltip>
      <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function scoreTone(v: number): 'success' | 'warning' | 'danger' {
  if (v >= 0.9) return 'success';
  if (v >= 0.7) return 'warning';
  return 'danger';
}
