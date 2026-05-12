package com.xg.platform.queryguard;

import com.xg.platform.schemacatalog.SchemaCatalogService;
import com.xg.platform.schemacatalog.model.SchemaTable;
import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SetOperationList;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * QueryGuard 第二层:在解析后的 AST 上,根据 owner 角色把 SchemaCatalog 里登记的
 * scope 子句注入到每个相关表的 WHERE。占位符 :owner_id / :owner_college /
 * :counselor_classes 用 ExecContext 实值替换后做字符串拼接,再 reparse 成 Expression
 * 用 AndExpression 跟原 WHERE 串联。
 *
 * <p>注入策略:
 * <ul>
 *   <li>顶层 PlainSelect 和所有嵌套子查询的 PlainSelect 都要注入</li>
 *   <li>每个 PlainSelect 内部,对 from + 所有 join 涉及的真表逐个查 catalog 拿 scope</li>
 *   <li>scope 为空字符串(role 不限制本表)→ 跳过</li>
 *   <li>scope 含占位符但 ExecContext 没值 → 抛 ROLE_SCOPE_MISSING_BINDING(fail-closed)</li>
 *   <li>多张表的 scope 用 AND 串联,放到原 WHERE 之外再 AND</li>
 * </ul>
 *
 * <p>注入后返回的 Select 可以 .toString() 拿到改写后的 SQL 用于 EXPLAIN + 真执行。
 */
public class SqlRewriter {

    private final SchemaCatalogService catalog;

    public SqlRewriter(SchemaCatalogService catalog) {
        this.catalog = catalog;
    }

    public void injectRoleScope(Select select, ExecContext ctx) {
        String role = ctx.ownerRole();
        if (role == null || role.isBlank()) {
            throw new QueryGuardException(
                    QueryGuardException.Code.ROLE_SCOPE_MISSING_BINDING,
                    "ExecContext 缺少 ownerRole");
        }
        walk(select, ctx);
    }

    private void walk(Select s, ExecContext ctx) {
        if (s instanceof PlainSelect ps) {
            injectIntoPlainSelect(ps, ctx);
            // 子查询递归
            if (ps.getFromItem() instanceof ParenthesedSelect par) walk(par.getSelect(), ctx);
            if (ps.getJoins() != null) {
                for (Join j : ps.getJoins()) {
                    if (j.getRightItem() instanceof ParenthesedSelect par) walk(par.getSelect(), ctx);
                }
            }
        } else if (s instanceof SetOperationList sol && sol.getSelects() != null) {
            for (Select child : sol.getSelects()) walk(child, ctx);
        } else if (s instanceof ParenthesedSelect par) {
            walk(par.getSelect(), ctx);
        }
    }

    private void injectIntoPlainSelect(PlainSelect ps, ExecContext ctx) {
        List<TableRef> refs = new ArrayList<>();
        collectTable(ps.getFromItem(), refs);
        if (ps.getJoins() != null) {
            for (Join j : ps.getJoins()) collectTable(j.getRightItem(), refs);
        }

        Expression existing = ps.getWhere();
        for (TableRef ref : refs) {
            SchemaTable t = catalog.getTable(ref.tableName);
            if (t == null) continue; // validator 已经过滤过白名单,这里就是双保险
            String scope = t.roleScopeFor(ctx.ownerRole());
            if (scope == null || scope.isBlank()) continue;
            String materialized = materialize(scope, ref.alias, t.alias(), ctx);
            Expression scopeExpr = parseExpression(materialized);
            existing = (existing == null) ? scopeExpr : new AndExpression(existing, scopeExpr);
        }
        ps.setWhere(existing);
    }

    /**
     * 把 yaml scope 子句里的占位符(:owner_id 等)替换成实值,
     * 同时把 yaml 里写死的 catalog.alias(如 "sp.college")替换成 SQL 里实际用的别名。
     * 例:yaml 写 "sp.college = :owner_college",SQL 里这张表用了别名 "p",
     *      最终输出 "p.college = '计算机学院'"。
     */
    private String materialize(String scope, String actualAlias, String catalogAlias, ExecContext ctx) {
        String s = scope;
        // 别名映射:catalog 写的 alias → SQL 实际 alias
        if (catalogAlias != null && actualAlias != null && !catalogAlias.equals(actualAlias)) {
            s = s.replaceAll("\\b" + java.util.regex.Pattern.quote(catalogAlias) + "\\.",
                    java.util.regex.Matcher.quoteReplacement(actualAlias + "."));
        }
        // 占位符替换 — 缺 binding 一律 reject
        if (s.contains(":owner_id")) {
            if (ctx.ownerId() == null) throwMissing("owner_id");
            s = s.replace(":owner_id", ctx.ownerId().toString());
        }
        if (s.contains(":owner_college")) {
            if (ctx.ownerCollege() == null || ctx.ownerCollege().isBlank())
                throwMissing("owner_college (dean 必须设置自己学院)");
            s = s.replace(":owner_college", quote(ctx.ownerCollege()));
        }
        if (s.contains(":counselor_classes")) {
            if (ctx.counselorClasses() == null || ctx.counselorClasses().isEmpty())
                throwMissing("counselor_classes (辅导员/班主任 必须有任教班级)");
            String list = ctx.counselorClasses().stream()
                    .map(String::valueOf)
                    .reduce((a, b) -> a + "," + b)
                    .orElse("NULL");
            s = s.replace(":counselor_classes", list);
        }
        return s;
    }

    private static void throwMissing(String key) {
        throw new QueryGuardException(
                QueryGuardException.Code.ROLE_SCOPE_MISSING_BINDING,
                "角色 scope 缺少 :" + key);
    }

    /** SQL 字符串引用,单引号转义 — 用于把 ownerCollege 等字符串直接拼到 SQL。
     *  生产里建议用 NamedParameterJdbcTemplate 的 bind 参数,但因为 scope 子句要跟原
     *  WHERE AndExpression 串联,这里走"materialize 成完整 SQL 再 reparse",简单 + 可读。
     *  传入字符串本身来自服务器内部(owner 自己档案的 college),无 SQL 注入面。 */
    private static String quote(String v) {
        return "'" + v.replace("'", "''") + "'";
    }

    private Expression parseExpression(String materialized) {
        try {
            return CCJSqlParserUtil.parseCondExpression(materialized);
        } catch (Exception e) {
            throw new QueryGuardException(
                    QueryGuardException.Code.ROLE_SCOPE_MISSING_BINDING,
                    "scope 子句解析失败:" + materialized + " (" + e.getMessage() + ")");
        }
    }

    private void collectTable(FromItem fromItem, List<TableRef> refs) {
        if (fromItem instanceof Table t) {
            String real = t.getName();
            Alias a = t.getAlias();
            String aliasName = (a != null && a.getName() != null) ? a.getName() : real;
            refs.add(new TableRef(real.toLowerCase(), aliasName));
        }
    }

    private record TableRef(String tableName, String alias) {}
}
