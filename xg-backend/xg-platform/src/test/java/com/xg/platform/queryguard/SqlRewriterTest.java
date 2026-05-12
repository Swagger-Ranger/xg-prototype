package com.xg.platform.queryguard;

import com.xg.platform.schemacatalog.SchemaCatalogService;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.Select;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SqlRewriter 单测:scope 子句被注入到 AST 后,toString() 的 SQL 应包含对应 WHERE 片段。
 * 不真跑 SQL,只比较改写后的 SQL 字符串。
 */
class SqlRewriterTest {

    private SqlRewriter rewriter;

    @BeforeEach
    void setUp() {
        SchemaCatalogService catalog = new SchemaCatalogService();
        catalog.load();
        rewriter = new SqlRewriter(catalog);
    }

    @Test
    void dean_scope_injected_into_student_profile() throws Exception {
        Select select = (Select) CCJSqlParserUtil.parse(
                "SELECT sp.student_no FROM student_profile sp");
        rewriter.injectRoleScope(select, ExecContext.builder()
                .tenantId("default")
                .ownerId(1L)
                .ownerRole("dean")
                .ownerCollege("计算机学院")
                .build());
        String out = select.toString();
        assertThat(out).contains("sp.college = '计算机学院'");
    }

    @Test
    void counselor_scope_with_classes_list() throws Exception {
        Select select = (Select) CCJSqlParserUtil.parse(
                "SELECT sp.student_no FROM student_profile sp");
        rewriter.injectRoleScope(select, ExecContext.builder()
                .tenantId("default")
                .ownerId(1L)
                .ownerRole("counselor")
                .counselorClasses(List.of(101L, 102L, 103L))
                .build());
        String out = select.toString();
        assertThat(out).contains("sp.class_id IN (101, 102, 103)");
    }

    @Test
    void dean_missing_college_rejected() throws Exception {
        Select select = (Select) CCJSqlParserUtil.parse(
                "SELECT sp.student_no FROM student_profile sp");
        assertThatThrownBy(() -> rewriter.injectRoleScope(select, ExecContext.builder()
                        .tenantId("default")
                        .ownerId(1L)
                        .ownerRole("dean")
                        .build()))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.ROLE_SCOPE_MISSING_BINDING));
    }

    @Test
    void student_self_scope_applied() throws Exception {
        Select select = (Select) CCJSqlParserUtil.parse(
                "SELECT lr.id FROM leave_request lr WHERE lr.status = 'approved'");
        rewriter.injectRoleScope(select, ExecContext.builder()
                .tenantId("default")
                .ownerId(999L)
                .ownerRole("student")
                .build());
        String out = select.toString();
        assertThat(out).contains("lr.student_id = 999");
        // 原 WHERE 也保留
        assertThat(out).contains("status = 'approved'");
    }

    @Test
    void director_no_scope_added() throws Exception {
        Statement raw = CCJSqlParserUtil.parse(
                "SELECT lr.id FROM leave_request lr WHERE lr.status = 'pending'");
        Select select = (Select) raw;
        String before = select.toString();
        rewriter.injectRoleScope(select, ExecContext.builder()
                .tenantId("default")
                .ownerId(1L)
                .ownerRole("student_affairs_director")
                .build());
        String after = select.toString();
        // director scope 是空,SQL 应当不变(除可能的格式归一化外)
        assertThat(normalize(after)).isEqualTo(normalize(before));
    }

    @Test
    void alias_remap_works_when_sql_uses_different_alias() throws Exception {
        // yaml 里 student_profile 别名 = sp。SQL 这里换成 p。注入后必须把 sp.college 映射成 p.college。
        Select select = (Select) CCJSqlParserUtil.parse(
                "SELECT p.student_no FROM student_profile p");
        rewriter.injectRoleScope(select, ExecContext.builder()
                .tenantId("default")
                .ownerId(1L)
                .ownerRole("dean")
                .ownerCollege("艺术学院")
                .build());
        String out = select.toString();
        assertThat(out).contains("p.college = '艺术学院'");
        assertThat(out).doesNotContain("sp.college");
    }

    private static String normalize(String sql) {
        return sql.replaceAll("\\s+", " ").trim();
    }
}
