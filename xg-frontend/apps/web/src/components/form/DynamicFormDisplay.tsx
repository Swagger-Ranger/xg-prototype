import { useEffect, useState } from 'react';
import { Descriptions, Image, Skeleton, Space, Tag } from 'antd';
import { DownloadOutlined, FileOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getFormSchema, type FormFieldSchema } from '@/api/workflow';
import { fileDownloadUrl, getFileMetadata, getFilePresignedUrl, type FileId, type FileMetadata } from '@/api/file';

interface Props {
  bizType?: string;
  instanceId?: string | number;
  formData: Record<string, unknown> | null | undefined;
  /** Filter out keys not in the schema. Default: true. */
  schemaOnly?: boolean;
  column?: number;
  /**
   * Extra schema fields merged into the fetched workflow schema. Used when
   * the rendered formData spans multiple schemas (e.g. leave_type extra_fields
   * flattened into form_data alongside the workflow form schema).
   */
  extraFields?: FormFieldSchema[];
}

export default function DynamicFormDisplay({
  bizType,
  instanceId,
  formData,
  schemaOnly = true,
  column = 1,
  extraFields,
}: Props) {
  const enabled = bizType != null || instanceId != null;
  const { data, isLoading } = useQuery({
    queryKey: ['formSchema', bizType, instanceId ?? null],
    queryFn: () =>
      getFormSchema(instanceId != null ? { instanceId } : { bizType: bizType! }),
    enabled,
    staleTime: 60 * 1000,
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;

  const fetched = enabled ? (data?.fields ?? []) : [];
  // Workflow fields take precedence on name collision: extras seeded first,
  // workflow fields written after so Map.set overwrites.
  const fieldByName = new Map<string, FormFieldSchema>();
  for (const f of extraFields ?? []) {
    if (!f.deprecated) fieldByName.set(f.name, f);
  }
  for (const f of fetched) {
    if (!f.deprecated) fieldByName.set(f.name, f);
  }
  const entries = Object.entries(formData ?? {}).filter(([k, v]) => {
    if (v == null) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (schemaOnly && !fieldByName.has(k)) return false;
    return true;
  });

  if (entries.length === 0) return null;

  return (
    <Descriptions column={column} size="small" bordered>
      {entries.map(([k, v]) => {
        const field = fieldByName.get(k);
        return (
          <Descriptions.Item key={k} label={field?.label ?? k}>
            <FieldValueRenderer field={field} value={v} />
          </Descriptions.Item>
        );
      })}
    </Descriptions>
  );
}

function FieldValueRenderer({
  field,
  value,
}: {
  field: FormFieldSchema | undefined;
  value: unknown;
}) {
  if (field?.type === 'file' && Array.isArray(value)) {
    // Backend serializes Long IDs as strings (Snowflake precision); accept both.
    const ids = value.filter(
      (x): x is FileId =>
        typeof x === 'number' || (typeof x === 'string' && x !== ''),
    );
    if (ids.length === 0) return <span style={{ color: 'var(--fg-3)' }}>—</span>;
    return <FileList fileIds={ids} />;
  }
  if (field?.type === 'boolean') {
    return value ? <Tag color="green">是</Tag> : <Tag>否</Tag>;
  }
  if (Array.isArray(value)) {
    return <span>{value.map((v) => String(v)).join(', ')}</span>;
  }
  return <span>{String(value)}</span>;
}

function FileList({ fileIds }: { fileIds: FileId[] }) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {fileIds.map((id) => (
        <FilePreview key={String(id)} fileId={id} />
      ))}
    </Space>
  );
}

function FilePreview({ fileId }: { fileId: FileId }) {
  const [meta, setMeta] = useState<FileMetadata | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFileMetadata(fileId)
      .then((m) => {
        if (cancelled) return;
        setMeta(m);
        // Always fetch presigned URL — needed for image preview, PDF iframe
        // thumbnail, and "open in new tab" link for unknown types. The URL
        // is short-lived (30 min) so caching it client-side is fine.
        getFilePresignedUrl(fileId).then((url) => {
          if (!cancelled) setPreviewUrl(url);
        }).catch(() => {});
      })
      .catch(() => !cancelled && setError('文件加载失败'));
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (error) return <span style={{ color: 'var(--err)' }}>{error}（id={fileId}）</span>;
  if (!meta) return <span style={{ color: 'var(--fg-3)' }}>加载中…</span>;

  const imageLike = looksLikeImage(meta);
  const pdfLike = looksLikePdf(meta);

  if (imageLike && previewUrl) {
    return (
      <Space align="start">
        <Image
          src={previewUrl}
          width={120}
          height={120}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          preview={{ src: previewUrl }}
          alt={meta.original_name}
        />
        <Space direction="vertical" size={2}>
          <span style={{ fontSize: 12 }}>{meta.original_name}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            {humanSize(meta.file_size)}
          </span>
        </Space>
      </Space>
    );
  }

  if (pdfLike && previewUrl) {
    return (
      <Space align="start">
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            width: 120,
            height: 120,
            border: '1px solid var(--bd-2)',
            borderRadius: 4,
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--bg-3)',
          }}
          title="点击在新标签预览"
        >
          <iframe
            src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
            title={meta.original_name}
            style={{
              width: 200,
              height: 200,
              transform: 'scale(0.6)',
              transformOrigin: 'top left',
              border: 'none',
              pointerEvents: 'none',
            }}
          />
        </a>
        <Space direction="vertical" size={2}>
          <span style={{ fontSize: 12 }}>{meta.original_name}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>
            {humanSize(meta.file_size)}
          </span>
          <a href={previewUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
            预览
          </a>
        </Space>
      </Space>
    );
  }

  // Unknown / non-previewable type: show a small thumbnail card with the
  // extension and filename. Click opens the presigned URL in a new tab so
  // the browser previews natively if possible (e.g. text, csv, json).
  const ext = (meta.original_name.split('.').pop() ?? '').toUpperCase().slice(0, 6);
  const openHref = previewUrl ?? fileDownloadUrl(fileId);
  return (
    <Space align="start">
      <a
        href={openHref}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: 120,
          height: 120,
          border: '1px solid var(--bd-2)',
          borderRadius: 4,
          background: 'var(--bg-3)',
          color: 'var(--fg-2)',
          textDecoration: 'none',
        }}
        title="点击在新标签打开"
      >
        <FileOutlined style={{ fontSize: 32, color: 'var(--ac)' }} />
        <span style={{ fontSize: 11, marginTop: 6, color: 'var(--fg-3)' }}>{ext || 'FILE'}</span>
      </a>
      <Space direction="vertical" size={2}>
        <span style={{ fontSize: 12 }}>{meta.original_name}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{humanSize(meta.file_size)}</span>
        <a href={fileDownloadUrl(fileId)} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
          <DownloadOutlined /> 下载
        </a>
      </Space>
    </Space>
  );
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

function looksLikeImage(meta: FileMetadata): boolean {
  if (meta.content_type && meta.content_type.toLowerCase().startsWith('image/')) return true;
  const ext = meta.original_name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTS.includes(ext);
}

function looksLikePdf(meta: FileMetadata): boolean {
  if (meta.content_type && meta.content_type.toLowerCase().includes('pdf')) return true;
  const ext = meta.original_name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'pdf';
}

function humanSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
