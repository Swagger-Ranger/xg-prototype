package com.xg.platform.queryguard;

import com.xg.common.exception.BizException;

/**
 * QueryGuard reject 出来的 BizException 子类。code 用预定义枚举,
 * 调用方按 code 决定面向用户的文案 / 是否折叠成"换种说法"。
 */
public class QueryGuardException extends BizException {

    public enum Code {
        /** SQL 解析失败 / 非 SELECT / 多语句 */
        NOT_A_SELECT,
        /** 命中 pg_catalog / information_schema 等系统表 */
        SYSTEM_TABLE_FORBIDDEN,
        /** 表不在 SchemaCatalog 白名单 */
        TABLE_NOT_WHITELISTED,
        /** SELECT 子句出现 sensitive 列 */
        SENSITIVE_COLUMN_LEAKED,
        /** 角色 scope 占位符没值(dean 没 college 等) */
        ROLE_SCOPE_MISSING_BINDING,
        /** EXPLAIN cost 或 rows 超阈值 */
        QUERY_TOO_HEAVY,
        /** EXPLAIN 失败 */
        EXPLAIN_FAILED,
        /** 实际执行报错 */
        EXECUTE_FAILED
    }

    private final Code guardCode;

    public QueryGuardException(Code code, String message) {
        super("QUERY_GUARD_" + code.name(), message);
        this.guardCode = code;
    }

    public Code guardCode() {
        return guardCode;
    }
}
