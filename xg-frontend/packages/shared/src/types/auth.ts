export interface LoginRequest {
  username: string;
  password: string;
  tenant_id?: string;
}

export interface LoginResponse {
  token: string;
  refresh_token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  username: string;
  real_name: string;
  avatar_url: string | null;
  role_codes: RoleCode[];
  permissions: string[];
  tenant_id: string;
  tenant_name: string;
  org_id: string | null;
  org_name: string | null;
}

export type RoleCode =
  | 'student'
  | 'counselor'
  | 'college_admin'
  | 'dean'
  | 'student_affairs_officer'
  | 'school_admin'
  | 'super_admin';
