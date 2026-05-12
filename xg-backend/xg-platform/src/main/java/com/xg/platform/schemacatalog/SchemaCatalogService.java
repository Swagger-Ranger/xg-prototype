package com.xg.platform.schemacatalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.platform.schemacatalog.model.SchemaColumn;
import com.xg.platform.schemacatalog.model.SchemaTable;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一 schema 注册中心。启动时扫描 classpath:schema-catalog/*.yaml,
 * 给 QueryGuard 提供"表/列是否被允许 + 角色 scope + 敏感等级",给 NL→SQL 入口
 * (AI 观察员 sidecar)提供 LLM 可读的 schema markdown。
 *
 * <p>_index.yaml 列出本目录下被启用的表名;未登记的 yaml warn skip,防误注册敏感表
 * (例如 sys_login_log 这种不该让 NL 查的表的 yaml 即使存在也不入白名单)。
 *
 * <p>FieldCatalogLoader 用的是同一种 SnakeYAML + Jackson 两步走方案,这里复制结构
 * 是为了把"NL→SQL 安全"放在 platform 层,不依赖 business 层。
 */
@Slf4j
@Service
public class SchemaCatalogService {

    private static final String INDEX_LOCATION = "classpath:schema-catalog/_index.yaml";
    private static final String TABLE_LOCATION_PATTERN = "classpath*:schema-catalog/*.yaml";

    /** 独立 mapper,跟 FieldCatalogLoader 同样的理由:全局 SNAKE_CASE 策略会破坏字段名 match。 */
    private static final ObjectMapper YAML_MAPPER = new ObjectMapper().findAndRegisterModules();

    /** key = 表名(小写)。LinkedHashMap 保留 _index.yaml 里的声明顺序,便于 LLM markdown 输出稳定。 */
    private final Map<String, SchemaTable> tables = new LinkedHashMap<>();

    @PostConstruct
    @SuppressWarnings("unchecked")
    public void load() {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

        // 1) 读 _index.yaml 拿到白名单
        List<String> allowedTables;
        try {
            Resource indexRes = resolver.getResource(INDEX_LOCATION);
            if (!indexRes.exists()) {
                throw new IllegalStateException("缺少 schema-catalog/_index.yaml");
            }
            try (InputStream in = indexRes.getInputStream()) {
                Map<String, Object> raw = new Yaml().load(in);
                Object list = raw == null ? null : raw.get("tables");
                if (!(list instanceof List<?>)) {
                    throw new IllegalStateException("_index.yaml 需要 tables: [...] 字段");
                }
                allowedTables = ((List<Object>) list).stream().map(Object::toString).toList();
            }
        } catch (RuntimeException re) {
            throw re;
        } catch (Exception e) {
            throw new IllegalStateException("加载 schema-catalog/_index.yaml 失败", e);
        }

        // 2) 扫描所有 yaml,只 register 在白名单里的
        Resource[] resources;
        try {
            resources = resolver.getResources(TABLE_LOCATION_PATTERN);
        } catch (Exception e) {
            throw new IllegalStateException("扫描 schema-catalog yaml 失败", e);
        }

        Map<String, SchemaTable> parsed = new HashMap<>();
        for (Resource res : resources) {
            String filename = res.getFilename();
            if (filename == null || filename.equals("_index.yaml")) continue;
            try (InputStream in = res.getInputStream()) {
                Map<String, Object> raw = new Yaml().load(in);
                if (raw == null) {
                    log.warn("schema-catalog 空文件,跳过:{}", filename);
                    continue;
                }
                SchemaTable t = YAML_MAPPER.convertValue(raw, SchemaTable.class);
                if (t.table() == null || t.table().isBlank()) {
                    throw new IllegalStateException("schema-catalog 缺 table 字段:" + filename);
                }
                if (parsed.put(t.table(), t) != null) {
                    throw new IllegalStateException("schema-catalog 表名重复:" + t.table());
                }
            } catch (RuntimeException re) {
                throw re;
            } catch (Exception e) {
                throw new IllegalStateException("schema-catalog 解析失败:" + filename, e);
            }
        }

        // 3) 按 _index 顺序登记,_index 里有但 yaml 不存在 → fail-fast
        for (String name : allowedTables) {
            SchemaTable t = parsed.get(name);
            if (t == null) {
                throw new IllegalStateException("_index.yaml 声明了表 " + name + " 但找不到对应 yaml");
            }
            tables.put(name.toLowerCase(), t);
        }

        // 4) 已解析但未登记的 → warn(防止偷塞敏感表)
        for (String name : parsed.keySet()) {
            if (!allowedTables.contains(name)) {
                log.warn("schema-catalog 发现未在 _index 登记的 yaml:{},已跳过", name);
            }
        }

        log.info("schema-catalog 加载完成,共 {} 张表:{}", tables.size(), tables.keySet());
    }

    /* ===== Lookup API ===== */

    /** 是不是白名单里的表(QueryGuard 第一道闸门)。 */
    public boolean isWhitelisted(String table) {
        return table != null && tables.containsKey(table.toLowerCase());
    }

    /** 找表定义,不在白名单返回 null。 */
    public SchemaTable getTable(String table) {
        return table == null ? null : tables.get(table.toLowerCase());
    }

    /** 找列定义。table 不在白名单 / 列不存在 都返回 null。 */
    public SchemaColumn getColumn(String table, String column) {
        SchemaTable t = getTable(table);
        return t == null ? null : t.findColumn(column);
    }

    /** 列是否 FULLY sensitive(QueryGuard reject 这种列出现在 SELECT 子句)。 */
    public boolean isColumnFullySensitive(String table, String column) {
        SchemaColumn c = getColumn(table, column);
        return c != null && c.isFullySensitive();
    }

    /** 该角色查该表时要追加到 WHERE 的 SQL 片段(占位符未替换)。 */
    public String roleScopeClause(String table, String role) {
        SchemaTable t = getTable(table);
        return t == null ? "" : t.roleScopeFor(role);
    }

    public Map<String, SchemaTable> allTables() {
        return Collections.unmodifiableMap(tables);
    }

    /**
     * 渲染所有白名单表的 schema markdown 喂给 LLM(AI 观察员 NL→SQL 用)。
     * 按 _index.yaml 顺序输出,标 sensitive 的列不显示给 LLM(防 LLM 出 SELECT 敏感列);
     * role 用于裁剪:LLM 只看自己角色 scope 内的表。当前实现仍输出所有表,真实 scope 在
     * QueryGuard 注入时强制,LLM 看见的"全表清单"也是 explain-friendly 的。
     */
    public String renderForLlm(String role) {
        StringBuilder sb = new StringBuilder();
        sb.append("# 可查询的表(每张表的列清单,sensitive 列不暴露)\n\n");
        for (SchemaTable t : tables.values()) {
            sb.append("## ").append(t.table());
            if (t.alias() != null && !t.alias().isBlank()) {
                sb.append(" (别名 ").append(t.alias()).append(")");
            }
            sb.append("\n");
            if (t.description() != null) sb.append(t.description()).append("\n");
            if (t.columns() != null) {
                for (SchemaColumn c : t.columns()) {
                    if (c.isFullySensitive()) continue;
                    sb.append("- `").append(c.name()).append("` ");
                    sb.append(c.type() == null ? "" : c.type());
                    if (c.label() != null) sb.append(" — ").append(c.label());
                    if (c.aliases() != null && !c.aliases().isEmpty()) {
                        sb.append(" (别名: ").append(String.join(", ", c.aliases())).append(")");
                    }
                    if (c.enumValues() != null && !c.enumValues().isEmpty()) {
                        sb.append(" [枚举: ").append(String.join(", ", c.enumValues())).append("]");
                    }
                    if (Boolean.TRUE.equals(c.indexed())) sb.append(" ✓ indexed");
                    if ("PARTIAL".equals(c.sensitivityLevel())) sb.append(" ⚠️ PII,系统会自动脱敏");
                    sb.append("\n");
                }
            }
            if (t.joinKeys() != null && !t.joinKeys().isEmpty()) {
                sb.append("\nJoin keys: ");
                t.joinKeys().forEach((k, v) ->
                        sb.append(k).append("→").append(v.get("table")).append(".").append(v.get("on")).append("; "));
                sb.append("\n");
            }
            String scope = t.roleScopeFor(role);
            if (scope != null && !scope.isBlank()) {
                sb.append("\n注意:**作为 ").append(role)
                        .append(" 你查 ").append(t.table())
                        .append(" 时,系统会自动追加** `").append(scope).append("`\n");
            }
            sb.append("\n");
        }
        return sb.toString();
    }
}
