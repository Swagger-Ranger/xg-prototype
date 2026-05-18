package com.xg.platform.auth;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 让"代码默认权限"可审计(RBAC 落地方案 §8.1):核心角色矩阵稳定、不漂移。
 *
 * <p>纯单测,不连 DB。"DEFAULTS code ∈ seed sys_permission" 这条通过解析 Flyway
 * 迁移文件得到 seed 权限码集合 —— 若 DEFAULTS 里写错一个 code,会被静默授成"0 权限",
 * 本测正是要把这种 typo 在 CI 拦下。
 */
class RolePermissionDefaultsTest {

    /** sys_permission 的 seed 分散在这三个 tenant 迁移里(列序均 id,tenant_id,code,...)。 */
    private static final List<String> SEED_MIGRATIONS = List.of(
            "V020__seed_initial_data.sql",
            "V058__rbac_employer_role_and_workstudy_perms.sql",
            "V103__seed_button_permissions.sql");

    /** 行形如 `(106, '${tenant_id}', 'system:ai:metrics', ...)` —— 锚定到 code 字段。 */
    private static final Pattern ROW =
            Pattern.compile("\\(\\s*\\d+\\s*,\\s*'\\$\\{tenant_id}'\\s*,\\s*'([^']+)'");

    @Test
    void coreSixRoles_allPresent() {
        assertThat(RolePermissionDefaults.CORE_ROLE_CODES).containsExactlyInAnyOrder(
                "student", "teacher", "college_admin", "school_admin", "super_admin", "employer");
        assertThat(RolePermissionDefaults.DEFAULTS.keySet())
                .containsAll(RolePermissionDefaults.CORE_ROLE_CODES);
    }

    @Test
    void everyDefaultPermCode_existsInSeedSysPermission() {
        Set<String> seeded = loadSeededPermissionCodes();
        // sanity:解析确实拿到了 seed(否则下面的 ⊆ 校验会变成空集恒真,等于没测)
        assertThat(seeded).as("seed sys_permission codes parsed").hasSizeGreaterThan(30);

        Set<String> unknown = new HashSet<>();
        for (Map.Entry<String, Set<String>> e : RolePermissionDefaults.DEFAULTS.entrySet()) {
            for (String code : e.getValue()) {
                if (RolePermissionDefaults.WILDCARD.equals(code)) continue; // '*' 不是真实 perm 行
                if (!seeded.contains(code)) unknown.add(e.getKey() + " → " + code);
            }
        }
        assertThat(unknown)
                .as("DEFAULTS 里引用了 seed sys_permission 中不存在的 perm code(typo / 漏 seed)")
                .isEmpty();
    }

    @Test
    void student_hasNoManagementPermissions() {
        Set<String> p = RolePermissionDefaults.DEFAULTS.get("student");
        assertThat(p).noneMatch(c -> c.startsWith("system:"));
        assertThat(p).noneMatch(c -> c.endsWith(":manage"));
        assertThat(p).doesNotContain("student:sensitive");
    }

    @Test
    void employer_hasNoSensitiveOrSystemPermissions() {
        Set<String> p = RolePermissionDefaults.DEFAULTS.get("employer");
        assertThat(p).doesNotContain("student:sensitive");
        assertThat(p).noneMatch(c -> c.startsWith("system:"));
    }

    @Test
    void superAdmin_isWildcardOnly() {
        assertThat(RolePermissionDefaults.DEFAULTS.get("super_admin"))
                .containsExactly(RolePermissionDefaults.WILDCARD);
    }

    @Test
    void legacyAliases_mapToExpectedCoreSets() {
        Map<String, Set<String>> d = RolePermissionDefaults.DEFAULTS;
        // 别名复用对应核心身份的权限集(过渡期,P5 数据迁移后清理)
        assertThat(d.get("counselor")).isEqualTo(d.get("teacher"));
        assertThat(d.get("class_master")).isEqualTo(d.get("teacher"));
        assertThat(d.get("class_monitor")).isEqualTo(d.get("student"));
        assertThat(d.get("dean")).isEqualTo(d.get("college_admin"));
        assertThat(d.get("college_secretary")).isEqualTo(d.get("college_admin"));
        assertThat(d.get("student_affairs_officer")).isEqualTo(d.get("school_admin"));
        assertThat(d.get("student_affairs_director")).isEqualTo(d.get("school_admin"));
        assertThat(d.get("aid_center_officer")).isEqualTo(d.get("school_admin"));
    }

    // ---- seed 解析 ----

    /** 只取 `INSERT INTO sys_permission ... ;` 语句块内的 code:V020 同形 sys_role 行不能混入。 */
    private Set<String> loadSeededPermissionCodes() {
        Path dir = resolveMigrationDir();
        Set<String> codes = new HashSet<>();
        for (String file : SEED_MIGRATIONS) {
            String sql;
            try {
                sql = Files.readString(dir.resolve(file));
            } catch (IOException ex) {
                throw new IllegalStateException("读不到 seed 迁移 " + file + ":" + ex.getMessage(), ex);
            }
            for (String block : extractSysPermissionInserts(sql)) {
                Matcher m = ROW.matcher(block);
                while (m.find()) codes.add(m.group(1));
            }
        }
        return codes;
    }

    /** 抓出每个 `INSERT INTO sys_permission` 到下一个 `;` 之间的语句体(可多段)。 */
    private List<String> extractSysPermissionInserts(String sql) {
        List<String> blocks = new java.util.ArrayList<>();
        int from = 0;
        while (true) {
            int start = sql.indexOf("INSERT INTO sys_permission", from);
            if (start < 0) break;
            int end = sql.indexOf(';', start);
            if (end < 0) end = sql.length();
            blocks.add(sql.substring(start, end));
            from = end + 1;
        }
        return blocks;
    }

    /** 迁移在 xg-app 模块;:xg-platform:test 工作目录是 xg-platform/,故多候选 + 向上找,找不到 fail-loud。 */
    private Path resolveMigrationDir() {
        String tail = "xg-app/src/main/resources/db/migration/tenant";
        List<Path> candidates = List.of(
                Paths.get("..", tail),
                Paths.get(tail),
                Paths.get("..", "..", tail));
        for (Path c : candidates) {
            if (Files.isDirectory(c)) return c;
        }
        // 从 user.dir 向上逐级找 xg-app
        Path p = Paths.get("").toAbsolutePath();
        for (int i = 0; i < 5 && p != null; i++, p = p.getParent()) {
            Path cand = p.resolve(tail);
            if (Files.isDirectory(cand)) return cand;
        }
        throw new IllegalStateException(
                "定位不到 seed 迁移目录(" + tail + "),工作目录=" + Paths.get("").toAbsolutePath()
                        + "。该断言不允许静默跳过 —— 修正路径解析后再跑。");
    }
}
