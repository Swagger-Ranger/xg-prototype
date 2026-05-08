import { useEffect, useRef, useState } from 'react';
import { Button, Space, Spin } from 'antd';
import { message } from '@/utils/antdApp';
import { ClearOutlined, CheckOutlined, EditOutlined } from '@ant-design/icons';
import { uploadFile, getFilePresignedUrl, type FileId, type FileMetadata } from '@/api/file';
import { getFileMetadata } from '@/api/file';

interface Props {
  /** Controlled value: array of file_ids (matches the file-field convention). */
  value?: FileId[];
  onChange?: (ids: FileId[]) => void;
  /** Drawing area dimensions in CSS pixels. */
  width?: number;
  height?: number;
}

/**
 * Hand-written signature pad. Reuses the file pipeline: when the user clicks
 * "保存签名" we read the canvas as PNG, upload via the existing /files/upload
 * endpoint with bizType="workflow_form", and surface the resulting file_id
 * up to the parent form (so it serializes the same way as a regular file
 * upload field).
 */
export default function SignaturePad({ value, onChange, width = 460, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const savedFileId = value && value.length > 0 ? value[0] : null;

  // Initialize canvas + DPI scaling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2937';
    ctxRef.current = ctx;
  }, [width, height]);

  // When parent provides an existing signature (file_id), load preview.
  useEffect(() => {
    let cancelled = false;
    if (savedFileId) {
      Promise.all([getFileMetadata(savedFileId), getFilePresignedUrl(savedFileId)])
        .then(([meta, url]) => {
          if (cancelled) return;
          if (meta && (meta.content_type ?? '').toLowerCase().startsWith('image/')) {
            setPreviewUrl(url);
          }
        })
        .catch(() => {
          // Ignore — fall back to "no saved signature" state.
        });
    } else {
      setPreviewUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [savedFileId]);

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    drawingRef.current = true;
    const pos = getPos(e);
    lastPointRef.current = pos;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
    if (!hasInk) setHasInk(true);
  };

  const handleEnd = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    setHasInk(false);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasInk) {
      message.warning('请先签名');
      return;
    }
    setUploading(true);
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) {
        message.error('签名导出失败');
        return;
      }
      const file = new File([blob], `signature-${Date.now()}.png`, { type: 'image/png' });
      const meta: FileMetadata = await uploadFile(file, 'workflow_form', 0);
      onChange?.([meta.id]);
      message.success('签名已保存');
    } catch (e) {
      message.error(`保存签名失败：${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRedraw = () => {
    onChange?.([]);
    setPreviewUrl(null);
    setHasInk(false);
  };

  if (savedFileId && previewUrl) {
    return (
      <div
        style={{
          border: '1px solid var(--bd-2)',
          borderRadius: 'var(--r)',
          padding: 8,
          background: 'var(--bg-2)',
          display: 'inline-block',
        }}
      >
        <img
          src={previewUrl}
          alt="signature"
          style={{ display: 'block', maxWidth: width, maxHeight: height }}
        />
        <Space style={{ marginTop: 8 }}>
          <Button size="small" icon={<EditOutlined />} onClick={handleRedraw}>
            重写
          </Button>
        </Space>
      </div>
    );
  }

  return (
    <Spin spinning={uploading} tip="上传中…">
      <div
        style={{
          display: 'inline-block',
          border: '1px dashed var(--bd-2)',
          borderRadius: 'var(--r)',
          padding: 8,
          background: 'var(--bg-2)',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            background: '#fff',
            borderRadius: 'var(--r-sm)',
            cursor: 'crosshair',
            touchAction: 'none',
          }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
        <Space style={{ marginTop: 8 }}>
          <Button size="small" icon={<ClearOutlined />} onClick={clearCanvas}>
            清除
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleSave}
            disabled={!hasInk}
          >
            保存签名
          </Button>
        </Space>
      </div>
    </Spin>
  );
}
