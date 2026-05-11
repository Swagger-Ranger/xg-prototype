import api from './index';

/**
 * 后端 yaml 字段目录的前端镜像。一份 yaml 驱动:后端 SqlBuilder + AI tool schema +
 * 前端 chip 渲染。前端拿到这份描述后,知道每个 filter 应该用什么样的控件、选项从哪来、
 * 父级是谁、是否被租户开关门控。
 *
 * 加新字段 = 改 yaml 一处,这里类型不需要动。
 */
export interface FieldCatalogResponse {
  page: string;
  fields: FieldDef[];
}

export interface FieldDef {
  key: string;
  label: string;
  /** AI prompt 用的描述,前端目前不展示。 */
  description?: string | null;
  type: 'text' | 'enum';
  /** 父级 filter 的 key,用于级联(选了父级才显示子级)。 */
  parent?: string | null;
  /** 租户开关名:tenantSettings 上对应字段为 true 才渲染。null 表示无门控。 */
  tenant_setting?: string | null;
  /** 静态枚举选项 (e.g. gender / status / 学院列表)。 */
  options?: { value: string; label: string }[] | null;
  /** 父级值分组的静态选项 (e.g. 学院↔专业) — parent 选了某 college,子选项就是对应 group。 */
  cascading_static?: CascadingStatic | null;
  /** 动态选项:调一个 url 拿,父级值通过 scoped_by 传参。 */
  dynamic?: DynamicHint | null;
  /** AI 别名,前端不直接用,只在 LLM prompt 里。 */
  aliases?: { phrase: string; value: string }[] | null;
}

export interface CascadingStatic {
  parent_key: string;
  groups: Record<string, string[]>;
}

export interface DynamicHint {
  url?: string | null;
  key?: string | null;
  /** 父级 filter 的 key 列表,作为请求参数透传 */
  scoped_by?: string[] | null;
}

export function getFieldCatalog(page: string): Promise<FieldCatalogResponse> {
  return api.get(`/field-catalog/${page}`).then((res) => res.data);
}
