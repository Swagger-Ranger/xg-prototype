package com.xg.platform.tenant;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Applies tenant-scoped Flyway migrations on startup, and exposes a method to
 * migrate a newly provisioned tenant schema.
 *
 * Handles two cases:
 *  - Fresh schema (no user tables): baseline at "0", run every V*.sql.
 *  - Legacy schema with tables already populated manually (e.g. tenant_demo from P0 dev):
 *    baseline at the highest classpath version so existing migrations are skipped,
 *    future migrations run normally.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TenantMigrationRunner implements ApplicationRunner {

    private static final Pattern VALID_SCHEMA = Pattern.compile("^[a-zA-Z0-9_]{1,64}$");
    private static final Pattern MIGRATION_FILE = Pattern.compile("^V(\\d+(?:_\\d+)*)__.*\\.sql$");
    private static final String TENANT_MIGRATION_LOCATION = "classpath:db/migration/tenant";
    private static final String FLYWAY_HISTORY_TABLE = "flyway_schema_history";

    private final DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        // 演示环境：如果没有租户，自动创建 default 租户
        ensureDefaultTenantExists();

        List<String> schemas = listActiveTenantSchemas();
        log.info("Tenant migration runner: {} active tenant schema(s)", schemas.size());
        for (String schema : schemas) {
            try {
                migrateTenantSchema(schema);
            } catch (Exception e) {
                log.error("Tenant migration failed for schema={}", schema, e);
            }
        }
    }

    /** 演示环境：如果没有租户，自动创建 default 租户 */
    private void ensureDefaultTenantExists() {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT COUNT(*) FROM public.tenant")) {
            if (rs.next() && rs.getInt(1) == 0) {
                log.info("No tenants found, creating default tenant for demo environment");
                stmt.execute("INSERT INTO public.tenant (id, name, code, schema_name, status, config, school_city, created_at, updated_at) " +
                        "VALUES ('default', '默认租户', 'default', 'tenant_default', 'active', '{}', '北京市', NOW(), NOW()) " +
                        "ON CONFLICT DO NOTHING");
                log.info("Default tenant created");
            }
        } catch (Exception e) {
            log.warn("Could not ensure default tenant exists: {}", e.getMessage());
        }
    }

    /** Create the schema if missing and bring it up to the latest tenant migration. */
    public void migrateTenantSchema(String schemaName) {
        if (!VALID_SCHEMA.matcher(schemaName).matches()) {
            throw new IllegalArgumentException("Invalid schema name: " + schemaName);
        }
        ensureSchemaExists(schemaName);

        // TODO(liufei, P1 后处理): 这段 legacy 判定过于"乐观"——只要 schema 里有任意表 + 没有
        //   flyway_schema_history,就一刀切把 baseline 设到 classpath 最高版本,跳过所有 V*.sql。
        //   原意是兼容 P0 早期手工接管的 tenant_demo,但任何用 deploy 脚本 / psql 手工灌过表
        //   (哪怕只灌了 sys_user 3 张表) 的演示库都会被误判,从而漏跑后续所有迁移,导致表/列
        //   缺失、登录炸 (典型症状: sys_role.kind / work_study_application.engagement_status
        //   does not exist)。2026-05 已踩坑一次。
        //   建议: (a) 删 legacy 分支,强制所有 schema 走标准 Flyway 流程;
        //         (b) 或改成显式 opt-in (读 schema 内的标记表 / 启动参数,而不是猜);
        //         (c) 改动需配回归测试 (新 schema / 残缺 schema / 完整 schema 三种状态)。
        //   等当前产品功能稳定后再单独提 PR,本次不动避免影响面扩散。
        boolean legacy = hasNonFlywayTables(schemaName) && !hasFlywayHistory(schemaName);
        String baseline = legacy ? maxClasspathMigrationVersion() : "0";

        String tenantId = schemaName.startsWith("tenant_") ? schemaName.substring(7) : schemaName;
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .schemas(schemaName)
                .defaultSchema(schemaName)
                .locations(TENANT_MIGRATION_LOCATION)
                .table(FLYWAY_HISTORY_TABLE)
                .baselineOnMigrate(true)
                .baselineVersion(baseline)
                .placeholders(Map.of("tenant_id", tenantId))
                .load();
        int applied = flyway.migrate().migrationsExecuted;
        log.info("Tenant migration: schema={} legacy={} baseline={} applied={}",
                schemaName, legacy, baseline, applied);
    }

    private List<String> listActiveTenantSchemas() {
        List<String> result = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT schema_name FROM public.tenant WHERE status = 'active'")) {
            while (rs.next()) {
                result.add(rs.getString(1));
            }
        } catch (Exception e) {
            log.warn("Could not list tenants (table may be absent at first boot): {}", e.getMessage());
        }
        return result;
    }

    private void ensureSchemaExists(String schema) {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("CREATE SCHEMA IF NOT EXISTS \"" + schema + "\"");
        } catch (Exception e) {
            throw new RuntimeException("Failed to create schema: " + schema, e);
        }
    }

    private boolean hasFlywayHistory(String schema) {
        return tableExists(schema, FLYWAY_HISTORY_TABLE);
    }

    private boolean hasNonFlywayTables(String schema) {
        String sql = "SELECT COUNT(*) FROM information_schema.tables " +
                "WHERE table_schema = ? AND table_name <> ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, FLYWAY_HISTORY_TABLE);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        } catch (Exception e) {
            log.warn("Failed to inspect schema={}", schema, e);
            return false;
        }
    }

    private boolean tableExists(String schema, String table) {
        String sql = "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        } catch (Exception e) {
            log.warn("Failed to check table exists: {}.{}", schema, table, e);
            return false;
        }
    }

    /** Scan classpath:db/migration/tenant for V*__*.sql and return highest version. */
    private String maxClasspathMigrationVersion() {
        try {
            Resource[] resources = new PathMatchingResourcePatternResolver()
                    .getResources(TENANT_MIGRATION_LOCATION + "/V*__*.sql");
            String max = "0";
            for (Resource r : resources) {
                String name = r.getFilename();
                if (name == null) continue;
                Matcher m = MIGRATION_FILE.matcher(name);
                if (!m.matches()) continue;
                String v = m.group(1);
                if (compareVersion(v, max) > 0) {
                    max = v;
                }
            }
            return max;
        } catch (Exception e) {
            log.warn("Failed to scan tenant migration resources", e);
            return "0";
        }
    }

    private int compareVersion(String a, String b) {
        String[] as = a.split("_");
        String[] bs = b.split("_");
        int n = Math.max(as.length, bs.length);
        for (int i = 0; i < n; i++) {
            int ai = i < as.length ? Integer.parseInt(as[i]) : 0;
            int bi = i < bs.length ? Integer.parseInt(bs[i]) : 0;
            if (ai != bi) return Integer.compare(ai, bi);
        }
        return 0;
    }
}
