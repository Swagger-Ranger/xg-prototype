export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface AlertSummary {
    /** Long → string on wire；前端转 number 自处理 */
    open_total: string;
    by_severity: Partial<Record<AlertSeverity, string>>;
}
export declare function getAlertSummary(): Promise<AlertSummary>;
//# sourceMappingURL=alert.d.ts.map