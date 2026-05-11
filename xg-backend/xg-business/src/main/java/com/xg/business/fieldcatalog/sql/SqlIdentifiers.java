package com.xg.business.fieldcatalog.sql;

import java.util.regex.Pattern;

/**
 * Yaml 里的列名 / 表别名 等 identifier 注入到 SQL 字符串前必须过这个校验。
 * yaml 文件在版本控制里可信,但守住这个边界让"误改 yaml 引入注入"变成不可能事件。
 */
final class SqlIdentifiers {
    private static final Pattern VALID = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*(\\.[a-zA-Z_][a-zA-Z0-9_]*)?$");

    private SqlIdentifiers() {}

    static String requireValid(String id, String desc) {
        if (id == null || !VALID.matcher(id).matches()) {
            throw new IllegalArgumentException(desc + " 非法标识符:" + id);
        }
        return id;
    }
}
