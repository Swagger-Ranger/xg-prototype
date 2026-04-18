import api from './index';

export interface QAItem {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  category: string;
  helpful: boolean | null;
  created_at: string;
}

export interface AskQuestionData {
  question: string;
}

export interface QAHistoryParams {
  page: number;
  size: number;
}

export function askQuestion(data: AskQuestionData): Promise<QAItem> {
  return api.post('/knowledge/questions', data).then((res) => res.data);
}

export function getQAHistory(params: QAHistoryParams): Promise<{ data: QAItem[]; total: number }> {
  return api.get('/knowledge/qa-history', { params }).then((res) => res.data);
}

export function submitFeedback(id: string, helpful: boolean): Promise<void> {
  return api.post(`/knowledge/${id}/feedback`, { helpful }).then(() => undefined);
}
