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
  email: string | null;
  phone: string | null;
  /** male / female / unknown — backend stores English, UI translates. */
  gender: string | null;
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
  | 'class_master'
  | 'class_monitor'
  | 'college_admin'
  | 'college_secretary'
  | 'dean'
  | 'student_affairs_officer'
  | 'student_affairs_director'
  | 'school_admin'
  | 'super_admin'
  | 'employer';
