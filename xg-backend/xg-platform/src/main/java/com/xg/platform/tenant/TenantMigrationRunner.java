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

    /** Create the schema if missing and bring it up to the latest tenant migration. */
    public void migrateTenantSchema(String schemaName) {
        if (!VALID_SCHEMA.matcher(schemaName).matches()) {
            throw new IllegalArgumentException("Invalid schema name: " + schemaName);
        }
        ensureSchemaExists(schemaName);

        boolean legacy = hasNonFlywayTables(schemaName) && !hasFlywayHistory(schemaName);
        String baseline = legacy ? maxClasspathMigrationVersion() : "0";

        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .schemas(schemaName)
                .defaultSchema(schemaName)
                .locations(TENANT_MIGRATION_LOCATION)
                .table(FLYWAY_HISTORY_TABLE)
                .baselineOnMigrate(true)
                .baselineVersion(baseline)
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
