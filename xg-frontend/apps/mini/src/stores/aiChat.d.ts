export type MsgKind = 'text' | 'event';
export interface AIMsg {
    role: 'user' | 'assistant';
    kind: MsgKind;
    text: string;
}
interface AIChatState {
    isOpen: boolean;
    messages: AIMsg[];
    conversationId: string | null;
    loading: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    newConversation: () => void;
    pushAssistantText: (text: string) => void;
    /** 发送消息。空态 quick action 与 dock 输入都走这里。 */
    send: (text: string) => Promise<void>;
}
export declare const useAIChatStore: import("zustand").UseBoundStore<import("zustand").StoreApi<AIChatState>>;
export {};
//# sourceMappingURL=aiChat.d.ts.map