package com.xg.platform.notification.recipient;

import java.util.Map;

/**
 * 通知收件人类型 — Orchestrator 解析模板的 recipients JSONB 时,按 type 派发到
 * 对应 RecipientTypeResolver。每加一个新 type 都需要同时:
 *  1. 在这里加 enum 值 + 中文 label(给 UI / AI 用)
 *  2. 写一个 @Component 实现 RecipientTypeResolver,type() 返回这里的 code
 */
public enum RecipientType {

    APPLICANT("applicant", "申请人"),
    CURRENT_APPROVER("current_approver", "当前审批人"),
    APPLICANT_COUNSELOR("applicant_counselor", "申请人的辅导员"),
    APPLICANT_CLASS_MASTER("applicant_class_master", "申请人的班主任"),
    APPLICANT_CLASS_MONITOR("applicant_class_monitor", "申请人班级的班长"),
    APPLICANT_DEAN("applicant_dean", "申请人所在学院的院长"),
    STATIC_USER("static_user", "指定用户");

    private final String code;
    private final String labelZh;

    RecipientType(String code, String labelZh) {
        this.code = code;
        this.labelZh = labelZh;
    }

    public String code() { return code; }
    public String labelZh() { return labelZh; }

    private static final Map<String, RecipientType> BY_CODE;
    static {
        Map<String, RecipientType> m = new java.util.HashMap<>();
        for (RecipientType t : values()) m.put(t.code, t);
        BY_CODE = Map.copyOf(m);
    }

    public static RecipientType fromCode(String code) {
        return BY_CODE.get(code);
    }
}
