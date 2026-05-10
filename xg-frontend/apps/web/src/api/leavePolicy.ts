// 请假规则页政策提示 — 走 sidecar /ai 代理。
// 国家政策硬编码在 sidecar,本校来自 RAG 召回。失败时只返回国家政策。

const BASE = '/ai/api/v1/leave-policy';

export interface PolicyItem {
  ref: string;
  text: string;
}

export interface LeavePolicyHints {
  national: PolicyItem[];
  school: PolicyItem[];
}

export async function getLeavePolicyHints(): Promise<LeavePolicyHints> {
  const res = await fetch(`${BASE}/hints`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
