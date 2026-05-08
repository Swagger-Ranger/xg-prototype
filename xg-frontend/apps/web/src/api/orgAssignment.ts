import api from './index';

/**
 * 组织派班 API。班主任挂在 org_unit.leader_id（class 节点 1:1），辅导员挂在
 * counselor_org_mapping（N:N，可在 college 也可在 class，is_primary 区分主辅）。
 *
 * 字段命名跟全局 Jackson 配置对齐：snake_case + Long id 序列化为 string。
 */

export interface OrgTreeNode {
  id: string;
  parent_id: string | null;
  name: string;
  type: 'college' | 'class';
  sort_order: number | null;
  leader_id: string | null;
  leader_name: string | null;
  counselors: CounselorMapping[];
}

export interface CounselorMapping {
  id: string;
  counselor_id: string;
  counselor_name: string;
  org_id: string;
  org_name: string;
  org_type: 'college' | 'class';
  is_primary: boolean;
}

export interface AssignableUser {
  id: string;
  real_name: string;
  username: string;
}

export function fetchOrgTree(): Promise<OrgTreeNode[]> {
  return api.get('/org/tree').then((res) => res.data);
}

export function listClassMasters(): Promise<AssignableUser[]> {
  return api.get('/org/class-masters').then((res) => res.data);
}

export function listCounselors(): Promise<AssignableUser[]> {
  return api.get('/org/counselors').then((res) => res.data);
}

/** leaderId=null 即清空班主任。Body 用 snake_case，跟全局 Jackson SNAKE_CASE 命名策略对齐。 */
export function updateLeader(classId: string, leaderId: string | null): Promise<void> {
  return api.put(`/org/${classId}/leader`, { leader_id: leaderId }).then(() => undefined);
}

export function createCounselorMapping(req: {
  counselorId: string;
  orgId: string;
  isPrimary?: boolean;
}): Promise<CounselorMapping> {
  return api
    .post('/org/counselor-mappings', {
      counselor_id: req.counselorId,
      org_id: req.orgId,
      is_primary: req.isPrimary ?? false,
    })
    .then((res) => res.data);
}

export function updateMappingPrimary(id: string, isPrimary: boolean): Promise<void> {
  return api
    .put(`/org/counselor-mappings/${id}`, { is_primary: isPrimary })
    .then(() => undefined);
}

export function deleteCounselorMapping(id: string): Promise<void> {
  return api.delete(`/org/counselor-mappings/${id}`).then(() => undefined);
}
