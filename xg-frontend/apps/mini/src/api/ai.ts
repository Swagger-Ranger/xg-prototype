/**
 * AI 辅助端点（走 Java 后端，由后端再转发到 sidecar）。
 * Sidecar 不可用时后端会回退，error_message 非空即提示用户保留原稿。
 */
import { post } from '../utils/request';

export interface PolishRejectionResponse {
  polished: string;
  model: string;
  error_message: string | null;
}

export function polishRejection(draft: string, context?: string) {
  return post<PolishRejectionResponse>('/ai/polish-rejection', { draft, context });
}
