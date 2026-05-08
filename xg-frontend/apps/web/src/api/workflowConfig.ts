import api from './index';

/**
 * 「请销假配置」简化版 API。读 workflow_definition 当前 published YAML 渲染
 * 出的中文 markdown 摘要。前端不接触 YAML / 节点 / executor 等技术词。
 *
 * 写操作走 AI 助手 + sidecar wizard tool 路径，不在这里。
 */

export interface ConfigSummary {
  biz_type: string;
  college_id: number | null;
  /** workflow_definition.version；null 表示该 (bizType, collegeId) 尚无 published 配置。 */
  version: number | null;
  /** workflow_definition.name；同上,缺失时 null。 */
  name: string | null;
  /** 中文 markdown,前端 ReactMarkdown 直接渲染。 */
  summary_md: string;
}

export function getConfigSummary(
  bizType: 'leave' | 'leave_return',
  collegeId?: number,
): Promise<ConfigSummary> {
  const params: Record<string, unknown> = { biz_type: bizType };
  if (collegeId != null) params.college_id = collegeId;
  return api.get('/workflow-config/summary', { params }).then((res) => res.data);
}
