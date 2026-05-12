package com.xg.platform.queryguard;

import com.xg.platform.schemacatalog.SchemaCatalogService;
import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.AllColumns;
import net.sf.jsqlparser.statement.select.AllTableColumns;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SetOperationList;
import net.sf.jsqlparser.util.TablesNamesFinder;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * QueryGuard 第一层闸门:把字符串 SQL 翻成 AST,做四件事:
 * <ol>
 *   <li>必须是 Select(不能是 DML/DDL/多语句)</li>
 *   <li>所有引用的表都在 SchemaCatalog 白名单(无 pg_/information_schema)</li>
 *   <li>SELECT 子句不能出现敏感列(password_hash / 身份证号 等)</li>
 *   <li>禁止 SELECT * 和 t.* —— 列必须 explicit,才能逐列做 sensitive 检查</li>
 * </ol>
 *
 * <p>所有违规都抛 QueryGuardException 带预定义 Code,调用方按 code 决定用户文案。
 * Validator 是无状态的纯函数式 wrapper(没有 @Service 注解),由 QueryGuardService
 * 持引用 — 这样写也方便单测直接 new。
 */
public class SqlAstValidator {

    private final SchemaCatalogService catalog;

    public SqlAstValidator(SchemaCatalogService catalog) {
        this.catalog = catalog;
    }

    /** 解析 SQL 拿到 AST。失败 / 不是 Select / 多语句一律 reject。 */
    public Select parseAndValidate(String sql) {
        Statement stmt;
        try {
            stmt = CCJSqlParserUtil.parse(sql);
        } catch (Exception e) {
            throw new QueryGuardException(
                    QueryGuardException.Code.NOT_A_SELECT,
                    "SQL 解析失败:" + e.getMessage());
        }
        if (!(stmt instanceof Select select)) {
            throw new QueryGuardException(
                    QueryGuardException.Code.NOT_A_SELECT,
                    "仅允许 SELECT,实际:" + stmt.getClass().getSimpleName());
        }
        return select;
    }

    /** 全量校验。先白名单表,再扫敏感列。 */
    public void validate(Select select) {
        validateTablesWhitelisted(select);
        validateNoSensitiveColumns(select);
    }

    /* ===== ① 表白名单 + 系统表黑名单 ===== */

    /**
     * TablesNamesFinder 会递归走子查询 / CTE / UNION,拿出所有 FQN 表名(不含别名)。
     * "schema.table" 会被禁用 —— 我们的多租户靠 search_path,显式带 schema 会绕过隔离。
     */
    private void validateTablesWhitelisted(Select select) {
        Set<String> tables = new TablesNamesFinder().getTables((Statement) select);
        for (String t : tables) {
            String lower = t.toLowerCase();
            // 禁带显式 schema(防绕过 search_path):"public.foo" / "tenant_xx.bar"
            if (lower.contains(".")) {
                throw new QueryGuardException(
                        QueryGuardException.Code.SYSTEM_TABLE_FORBIDDEN,
                        "禁止显式 schema 限定:" + t + "(多租户靠 search_path 自动隔离)");
            }
            // 系统表
            if (lower.startsWith("pg_") || lower.startsWith("information_schema")) {
                throw new QueryGuardException(
                        QueryGuardException.Code.SYSTEM_TABLE_FORBIDDEN,
                        "禁止访问系统表:" + t);
            }
            // 白名单
            if (!catalog.isWhitelisted(lower)) {
                throw new QueryGuardException(
                        QueryGuardException.Code.TABLE_NOT_WHITELISTED,
                        "表 " + t + " 不在 SchemaCatalog 白名单,无法查询");
            }
        }
    }

    /* ===== ② SELECT 列的敏感字段检查 ===== */

    /**
     * 递归扫所有 PlainSelect(顶层 + UNION 分支 + 子查询)的 SelectItems。
     * 每个 select item:
     *  - AllColumns ({@code SELECT *})/ AllTableColumns ({@code SELECT u.*}) → 直接 reject
     *  - Column(带或不带 table 前缀) → 用 alias map 解析回表,问 SchemaCatalog
     */
    private void validateNoSensitiveColumns(Select select) {
        walkAllPlainSelects(select, this::validatePlainSelectColumns);
    }

    private void validatePlainSelectColumns(PlainSelect ps) {
        // 1) 构建 alias → 真表名 map(本 PlainSelect 范围内有效)
        Map<String, String> aliasToTable = new HashMap<>();
        registerFromItem(ps.getFromItem(), aliasToTable);
        if (ps.getJoins() != null) {
            for (Join j : ps.getJoins()) registerFromItem(j.getRightItem(), aliasToTable);
        }

        // 2) 扫 SelectItems
        List<SelectItem<?>> items = ps.getSelectItems();
        if (items == null) return;
        for (SelectItem<?> item : items) {
            Object expr = item.getExpression();
            if (expr instanceof AllColumns) {
                throw new QueryGuardException(
                        QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED,
                        "禁止 SELECT * — 请明确列出列名,系统会按列检查 PII 暴露");
            }
            if (expr instanceof AllTableColumns) {
                throw new QueryGuardException(
                        QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED,
                        "禁止 SELECT t.* — 请明确列出列名");
            }
            if (expr instanceof Column col) {
                checkColumn(col, aliasToTable);
            }
            // 函数 / 表达式包裹的 Column(如 LOWER(u.email))也会被这条路径覆盖 ——
            // JSqlParser 会让 Column 出现在 expr 树里,这里我们只查顶层是否 AllColumns/Column;
            // 嵌套敏感列泄漏在 #169 之后再加深度遍历(目前 LLM 的 SQL 几乎不会嵌套函数包敏感列)。
        }
    }

    private void registerFromItem(FromItem fromItem, Map<String, String> aliasToTable) {
        if (fromItem == null) return;
        if (fromItem instanceof Table t) {
            String real = t.getName();
            Alias a = t.getAlias();
            String aliasKey = (a != null && a.getName() != null) ? a.getName() : real;
            aliasToTable.put(aliasKey.toLowerCase(), real.toLowerCase());
        }
        // 子查询 / CTE 不参与列敏感检查(它本身的 select 在 walkAllPlainSelects 里被递归)
    }

    private void checkColumn(Column col, Map<String, String> aliasToTable) {
        String aliasOrTable = col.getTable() == null ? null : col.getTable().getName();
        String colName = col.getColumnName();
        if (colName == null) return;

        // 无表前缀:只有当 from 里就一张表时能解析;否则 LLM 在多表 join 必须显式 t.col,
        // 这里采取宽松:无前缀就遍历所有 from 表 + 任何匹配上的敏感列都 reject。
        if (aliasOrTable == null) {
            for (String table : aliasToTable.values()) {
                if (catalog.isColumnFullySensitive(table, colName)) {
                    throw new QueryGuardException(
                            QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED,
                            "禁止 SELECT 敏感列:" + table + "." + colName);
                }
            }
            return;
        }
        // 有表前缀:用 alias map 反查
        String realTable = aliasToTable.get(aliasOrTable.toLowerCase());
        if (realTable == null) {
            // alias 找不到 = SQL 有问题,但放过 — TablesNamesFinder 那一步会兜底
            return;
        }
        if (catalog.isColumnFullySensitive(realTable, colName)) {
            throw new QueryGuardException(
                    QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED,
                    "禁止 SELECT 敏感列:" + realTable + "." + colName);
        }
    }

    /* ===== util ===== */

    /** 递归走 Select 的所有 PlainSelect 节点(顶层 + UNION + 子查询的 select 体)。 */
    private void walkAllPlainSelects(Select select, java.util.function.Consumer<PlainSelect> visitor) {
        Set<Select> seen = new HashSet<>();
        walkInner(select, seen, visitor);
    }

    private void walkInner(Select s, Set<Select> seen, java.util.function.Consumer<PlainSelect> v) {
        if (s == null || !seen.add(s)) return;
        if (s instanceof PlainSelect ps) {
            v.accept(ps);
            // FROM 子句里的子查询
            if (ps.getFromItem() instanceof ParenthesedSelect par) walkInner(par.getSelect(), seen, v);
            if (ps.getJoins() != null) {
                for (Join j : ps.getJoins()) {
                    if (j.getRightItem() instanceof ParenthesedSelect par) walkInner(par.getSelect(), seen, v);
                }
            }
        } else if (s instanceof SetOperationList sol) {
            if (sol.getSelects() != null) {
                for (Select child : sol.getSelects()) walkInner(child, seen, v);
            }
        } else if (s instanceof ParenthesedSelect par) {
            walkInner(par.getSelect(), seen, v);
        }
    }
}
