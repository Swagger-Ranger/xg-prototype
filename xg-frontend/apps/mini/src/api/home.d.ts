export interface HomeMetrics {
    pendingLeaveCount: number;
    unreadCount: number;
    pendingAppCount: number;
    monthSalary: number;
    /** YYYY-MM used for salary filter */
    month: string;
}
/**
 * Pulls 4 stats in parallel. Errors per call resolve to safe defaults so
 * that one missing endpoint doesn't blank out the whole home page.
 */
export declare function getHomeMetrics(): Promise<HomeMetrics>;
//# sourceMappingURL=home.d.ts.map