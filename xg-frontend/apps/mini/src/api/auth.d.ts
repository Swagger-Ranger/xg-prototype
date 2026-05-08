/**
 * 前端使用的用户视图（camelCase）。
 * 注意：后端走 Jackson SNAKE_CASE，wire payload 用 real_name / tenant_id / role_codes，
 * 由 login() 在 boundary 处转成 camelCase 后存进 storage，下游访问保持 camelCase 一致。
 */
export interface MiniUser {
    id: string;
    username: string;
    realName: string | null;
    tenantId: string | null;
    roleCodes: string[];
}
export interface LoginPayload {
    username: string;
    password: string;
    tenantId?: string;
}
export interface LoginResp {
    token: string;
    refreshToken: string | null;
    user: MiniUser;
}
export declare function login(payload: LoginPayload): Promise<LoginResp>;
//# sourceMappingURL=auth.d.ts.map