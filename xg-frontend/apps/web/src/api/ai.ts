import api from './index';

export interface PolishRejectionResponse {
  polished: string;
  model: string;
  error_message: string | null;
}

/**
 * 让 AI 把"驳回原因"草稿改写成给学生看的版本。Sidecar 不可用时后端会回退
 * 到原文 + error_message，前端 UI 不阻塞。
 */
export function polishRejection(draft: string, context?: string): Promise<PolishRejectionResponse> {
  return api
    .post('/ai/polish-rejection', { draft, context })
    .then((res) => res.data);
}
