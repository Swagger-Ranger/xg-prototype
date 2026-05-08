export declare function get<T>(path: string, params?: Record<string, unknown>): Promise<T>;
export declare function postAi<T>(path: string, body?: unknown): Promise<T>;
export declare function post<T>(path: string, body?: unknown, opts?: {
    skipAuth?: boolean;
}): Promise<T>;
export declare function put<T>(path: string, body?: unknown): Promise<T>;
//# sourceMappingURL=request.d.ts.map