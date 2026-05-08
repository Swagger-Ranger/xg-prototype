/**
 * Direct calls to the Python AI sidecar (bypasses the Java backend's
 * /api/v1 baseURL). Used for tools that take/return free-form output and
 * have no business reason to flow through Java — keeps the Java controller
 * surface narrow.
 *
 * Auth headers (X-Tenant-Id / X-User-Id / X-User-Role) are sourced from
 * localStorage to mirror the shared axios client's contract; sidecar tools
 * with allowed_roles enforce per-role gates server-side.
 */

export interface SidecarToolResult {
  output: string;
  tool?: string;
}

export async function callSidecarTool(
  toolName: string,
  args: object,
): Promise<SidecarToolResult> {
  let tenantId: string | null = null;
  let userId: string | null = null;
  let role: string | null = null;
  try {
    const u = localStorage.getItem('xg_user');
    if (u) {
      const user = JSON.parse(u);
      tenantId = user.tenant_id ?? null;
      userId = user.id ? String(user.id) : null;
      // UserInfo carries `role_codes: string[]` (multi-role users like
      // counselor+admin are real); send all codes comma-separated so the
      // sidecar's allow-list match treats any matching role as authorized.
      const codes = Array.isArray(user.role_codes) ? user.role_codes : [];
      role = codes.length > 0 ? codes.join(',') : null;
    }
  } catch {
    /* noop */
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  if (userId) headers['X-User-Id'] = userId;
  if (role) headers['X-User-Role'] = role;

  // /ai prefix is a vite proxy → http://localhost:8000 sidecar.
  const resp = await fetch(`/ai/api/v1/tools/${toolName}/execute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ args }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`sidecar HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return (await resp.json()) as SidecarToolResult;
}

/**
 * L5 字段 copilot — recommends a numeric value for a leave-type field
 * (maxDays / advanceDays / termCapDays) based on prior-knowledge defaults
 * for typical Chinese universities. Returns parsed {value, reason}.
 */
export interface FieldRecommendation {
  value: number | null;
  reason: string;
}

/**
 * L2 改动摘要 — diffs the published config against the unsaved draft and
 * returns Markdown explaining what changed + likely impact + warnings.
 * Pure LLM, no DB. Safe to call after saveBaseDraft to surface the impact
 * before the teacher publishes.
 */
export async function explainBaseDiff(published: object, draft: object): Promise<string> {
  const r = await callSidecarTool('explain_base_diff', { published, draft });
  return r.output;
}

/**
 * Phase 3 配置体检 — full-config AI critic. Pulls live config + patches
 * server-side and returns a Chinese Markdown report with severity-tagged
 * findings (severe / medium / suggestion). No-arg from the UI side.
 */
export async function auditLeaveConfig(): Promise<string> {
  const r = await callSidecarTool('audit_leave_config', {});
  return r.output;
}

/**
 * 对话式 wizard 第 1-3 轮的统一解析器。
 * Round 1：解析假别清单
 * Round 2：解析数值（最长天数/提前/累计/证明）
 * Round 3：解析审批链
 */
export interface WizardChatResult {
  updated_types: unknown[];
  ai_message: string;
}

export async function wizardChat(
  round: 1 | 2 | 3,
  text: string,
  currentTypes: unknown[],
): Promise<WizardChatResult> {
  const r = await callSidecarTool('wizard_chat', {
    round,
    text,
    current_types: currentTypes,
  });
  try {
    const parsed = JSON.parse(r.output);
    return {
      updated_types: Array.isArray(parsed.updated_types) ? parsed.updated_types : currentTypes,
      ai_message: String(parsed.ai_message ?? '已更新').slice(0, 300),
    };
  } catch {
    return { updated_types: currentTypes, ai_message: r.output.slice(0, 300) };
  }
}

/**
 * Wizard 起步用的"建议默认"配置（基于真实学校请假系统截图整理）。
 * 返回 leaveTypes 列表 + notifications，可直接 setDraft。
 */
export async function getDefaultLeaveConfig(): Promise<{
  leaveTypes: unknown[];
  notifications: unknown[];
}> {
  const r = await callSidecarTool('get_default_leave_config', {});
  try {
    const parsed = JSON.parse(r.output);
    return {
      leaveTypes: Array.isArray(parsed.leaveTypes) ? parsed.leaveTypes : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    };
  } catch {
    return { leaveTypes: [], notifications: [] };
  }
}

export async function recommendLeaveTypeField(input: {
  code: string;
  name?: string;
  field: 'maxDays' | 'advanceDays' | 'termCapDays';
  currentValue?: number | null;
  schoolHint?: string;
}): Promise<FieldRecommendation> {
  const r = await callSidecarTool('recommend_leave_type_field', {
    code: input.code,
    name: input.name,
    field: input.field,
    current_value: input.currentValue,
    school_hint: input.schoolHint,
  });
  // Sidecar returns the JSON in the `output` string field.
  try {
    const parsed = JSON.parse(r.output);
    return {
      value: typeof parsed.value === 'number' ? parsed.value : null,
      reason: String(parsed.reason ?? '').slice(0, 200),
    };
  } catch {
    return { value: null, reason: r.output.slice(0, 200) };
  }
}

