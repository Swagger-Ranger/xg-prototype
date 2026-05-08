export type InsightSeverity = 'info' | 'warn' | 'critical';
export interface InsightItem {
    severity: InsightSeverity;
    category: string;
    title: string;
    detail: string;
    suggestion: string;
    evidence?: string[];
}
export interface WorkspaceInsight {
    id: string | null;
    role: 'counselor' | 'dean';
    scope_key: string;
    generated_at: string;
    expired_at: string | null;
    model: string;
    /** 原 JSON 字符串；用 parseInsights 解析。 */
    insights: string;
    status: 'ready' | 'error' | 'pending';
    error_message: string | null;
}
export declare function getLatestInsight(role: 'counselor' | 'dean'): Promise<WorkspaceInsight | null>;
export declare function parseInsights(raw: string | null | undefined): InsightItem[];
/** 按严重度排序，未识别 severity 视为 info（最末尾）。 */
export declare function sortBySeverity(items: InsightItem[]): InsightItem[];
//# sourceMappingURL=insight.d.ts.map