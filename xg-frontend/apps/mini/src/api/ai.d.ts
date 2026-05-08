export interface PolishRejectionResponse {
    polished: string;
    model: string;
    error_message: string | null;
}
export declare function polishRejection(draft: string, context?: string): Promise<PolishRejectionResponse>;
//# sourceMappingURL=ai.d.ts.map