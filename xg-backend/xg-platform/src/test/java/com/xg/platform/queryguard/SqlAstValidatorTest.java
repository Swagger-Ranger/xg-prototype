package com.xg.platform.queryguard;

import com.xg.platform.schemacatalog.SchemaCatalogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SqlAstValidator 单测:不依赖 DB,只检查 AST 校验逻辑。
 * 借真的 SchemaCatalogService 读真 yaml,确保白名单 + sensitive 标记跟生产一致。
 */
class SqlAstValidatorTest {

    private SqlAstValidator validator;

    @BeforeEach
    void setUp() {
        SchemaCatalogService catalog = new SchemaCatalogService();
        catalog.load();
        validator = new SqlAstValidator(catalog);
    }

    @Test
    void valid_select_passes() {
        var select = validator.parseAndValidate(
                "SELECT sp.student_no, sp.real_name AS name, sp.college FROM student_profile sp WHERE sp.status = 'active'");
        // real_name 是 sys_user 上的列,但是验证器对未前缀且只有 1 张表时不强校验。
        // 这里测的是 explicit sp.student_no / sp.college 这种正常路径
        validator.validate(select);
    }

    @Test
    void drop_statement_rejected() {
        assertThatThrownBy(() -> validator.parseAndValidate("DROP TABLE student_profile"))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.NOT_A_SELECT));
    }

    @Test
    void update_statement_rejected() {
        assertThatThrownBy(() -> validator.parseAndValidate("UPDATE student_profile SET status='withdrawn'"))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.NOT_A_SELECT));
    }

    @Test
    void delete_statement_rejected() {
        assertThatThrownBy(() -> validator.parseAndValidate("DELETE FROM leave_request"))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.NOT_A_SELECT));
    }

    @Test
    void pg_catalog_rejected() {
        var select = validator.parseAndValidate("SELECT relname FROM pg_class");
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.SYSTEM_TABLE_FORBIDDEN));
    }

    @Test
    void schema_prefix_rejected() {
        var select = validator.parseAndValidate("SELECT student_no FROM public.student_profile");
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.SYSTEM_TABLE_FORBIDDEN));
    }

    @Test
    void non_whitelisted_table_rejected() {
        var select = validator.parseAndValidate("SELECT id FROM secret_table");
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.TABLE_NOT_WHITELISTED));
    }

    @Test
    void select_star_rejected() {
        var select = validator.parseAndValidate("SELECT * FROM student_profile sp");
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED));
    }

    @Test
    void select_table_star_rejected() {
        var select = validator.parseAndValidate("SELECT u.* FROM sys_user u");
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED));
    }

    @Test
    void sensitive_column_rejected() {
        // password_hash 在 sys_user.yaml 标 sensitive: true,直接 SELECT 应被 reject
        var select = validator.parseAndValidate("SELECT u.password_hash FROM sys_user u");
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED));
    }

    @Test
    void external_id_rejected() {
        var select = validator.parseAndValidate("SELECT u.external_id FROM sys_user u");
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class);
    }

    @Test
    void pii_partial_passes() {
        // phone 标 sensitive: pii_partial,validator 阶段允许通过(运行时由别处脱敏)。
        var select = validator.parseAndValidate("SELECT u.phone FROM sys_user u");
        validator.validate(select);
    }

    @Test
    void join_with_alias_columns_pass() {
        var select = validator.parseAndValidate("""
                SELECT sp.student_no, u.real_name
                FROM student_profile sp JOIN sys_user u ON u.id = sp.user_id
                WHERE sp.college = '计算机学院'
                """);
        validator.validate(select);
    }

    @Test
    void join_with_sensitive_in_joined_table_rejected() {
        var select = validator.parseAndValidate("""
                SELECT sp.student_no, u.password_hash
                FROM student_profile sp JOIN sys_user u ON u.id = sp.user_id
                """);
        assertThatThrownBy(() -> validator.validate(select))
                .isInstanceOf(QueryGuardException.class)
                .satisfies(e -> assertThat(((QueryGuardException) e).guardCode())
                        .isEqualTo(QueryGuardException.Code.SENSITIVE_COLUMN_LEAKED));
    }
}
