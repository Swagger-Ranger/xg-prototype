import api from './index';

/**
 * IDs come back from the backend as strings (Snowflake Long → JSON string to
 * avoid JS Number precision loss). Treat them as opaque tokens — never
 * arithmetic on them.
 */
export type FileId = string | number;

export interface FileMetadata {
  id: FileId;
  original_name: string;
  content_type: string | null;
  file_size: number;
  biz_type: string;
  biz_id: FileId;
  created_at: string;
}

export function uploadFile(
  file: File,
  bizType: string,
  bizId: FileId,
): Promise<FileMetadata> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('bizType', bizType);
  fd.append('bizId', String(bizId));
  return api
    .post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((res) => res.data);
}

export function getFilePresignedUrl(fileId: FileId, expiryMinutes = 30): Promise<string> {
  return api
    .get(`/files/${fileId}/url`, { params: { expiry: expiryMinutes } })
    .then((res) => res.data?.url as string);
}

export function getFileMetadata(fileId: FileId): Promise<FileMetadata> {
  return api.get(`/files/${fileId}`).then((res) => res.data);
}

export function fileDownloadUrl(fileId: FileId): string {
  return `/api/v1/files/${fileId}/download`;
}
