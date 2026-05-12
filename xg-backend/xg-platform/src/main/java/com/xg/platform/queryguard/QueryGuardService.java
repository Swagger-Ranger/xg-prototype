package com.xg.platform.queryguard;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.xg.platform.schemacatalog.SchemaCatalogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.sf.jsqlparser.statement.select.Select;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 一次 safeExecute 的全链路:
 * <pre>
 *   raw SQL
 *     → SqlAstValidator.parseAndValidate(): SELECT-only / 白名单表 / 敏感列
 *     → SqlRewriter.injectRoleScope(): 注入角色 scope 子句
 *     → EXPLAIN (FORMAT JSON): cost / rows 闸门
 *     → NamedParameterJdbcTemplate.queryForList: 执行
 *     → 落 query_guard_log(慢或被拒都落)
 *     → QueryGuardResult
 * </pre>
 *
 * <p>缓存层(#171)和 Caffeine 暂留 TODO,本次先打通主链路;test #172 跑通后再补。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QueryGuardService {

    /** EXPLAIN cost 上限。10000 大致对应 PG 默认参数下"扫几万行 + 几个 hash join"。 */
    private static final long COST_LIMIT = 10_000L;
    /** EXPLAIN plan rows 上限。100k 超过就拒,避免 NL→SQL 不小心写出"全班全表 JOIN"。 */
    private static final long ROWS_LIMIT = 100_000L;
    /** 慢查询阈值。实际耗时超过这个就异步落库。 */
    private static final long SLOW_MS = 500L;

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SchemaCatalogService schemaCatalog;
    private final NamedParameterJdbcTemplate jdbc;

    /**
     * 结果缓存:同 (sql_hash + tenantId + ownerId + ownerRole + ownerCollege) 5 分钟复用。
     * ownerRole / ownerCollege 进 key 是因为 scope 注入后 SQL 实际跑的是不同语句,
     * 但缓存按"调用方原始 SQL"做 key,所以必须把会影响 scope 的字段都加进 key。
     * maximumSize 1000:超出后按 LRU 淘汰,占内存约几 MB。
     */
    private final Cache<String, QueryGuardResult> resultCache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(Duration.ofMinutes(5))
            .build();

    /**
     * 校验 + 改写 + 执行。任一闸门失败抛 QueryGuardException,调用方按 code 决定文案。
     */
    public QueryGuardResult safeExecute(String sql, Map<String, Object> params, ExecContext ctx) {
        if (ctx != null && !ctx.bypassCache()) {
            String key = cacheKey(sql, params, ctx);
            QueryGuardResult hit = resultCache.getIfPresent(key);
            if (hit != null) {
                return new QueryGuardResult(hit.rows(), hit.planCost(), hit.planRows(),
                        0L, true, hit.warnings());
            }
            QueryGuardResult fresh = run(sql, params, ctx, "external", false);
            resultCache.put(key, fresh);
            return fresh;
        }
        return run(sql, params, ctx, "external", false);
    }

    /** 显式清缓存(数据更新后调用方可触发,或写入观察员卡时清自家 key)。 */
    public void invalidateAll() {
        resultCache.invalidateAll();
    }

    /** 只跑到 EXPLAIN 不执行,给 AI 观察员"保存卡前体检"用。 */
    public QueryGuardResult explainOnly(String sql, Map<String, Object> params, ExecContext ctx) {
        return run(sql, params, ctx, "external_preview", true);
    }

    private QueryGuardResult run(String sql, Map<String, Object> params, ExecContext ctx,
                                  String source, boolean explainOnly) {
        Map<String, Object> safeParams = params == null ? Map.of() : params;
        long t0 = System.currentTimeMillis();
        String rewritten = null;
        try {
            // 1) AST 验证
            SqlAstValidator validator = new SqlAstValidator(schemaCatalog);
            Select select = validator.parseAndValidate(sql);
            validator.validate(select);

            // 2) 角色 scope 注入
            SqlRewriter rewriter = new SqlRewriter(schemaCatalog);
            rewriter.injectRoleScope(select, ctx);
            rewritten = select.toString();

            // 3) EXPLAIN
            long[] explainResult = explain(rewritten, safeParams);
            long planCost = explainResult[0];
            long planRows = explainResult[1];

            List<String> warnings = new ArrayList<>();
            if (planCost > COST_LIMIT) {
                throwRejected(ctx, source, rewritten, safeParams,
                        QueryGuardException.Code.QUERY_TOO_HEAVY,
                        "查询太重(cost=" + planCost + " > " + COST_LIMIT + "),换种说法或加更细的过滤");
            }
            if (planRows > ROWS_LIMIT) {
                throwRejected(ctx, source, rewritten, safeParams,
                        QueryGuardException.Code.QUERY_TOO_HEAVY,
                        "扫描行太多(rows=" + planRows + " > " + ROWS_LIMIT + "),换种说法或加更细的过滤");
            }
            if (planCost > COST_LIMIT / 2) {
                warnings.add("查询较重 (cost=" + planCost + "),响应可能较慢");
            }
            if (planRows > ROWS_LIMIT / 2) {
                warnings.add("扫描行较多 (rows≈" + planRows + ")");
            }

            // 4) 执行(或跳过 — preview)
            List<Map<String, Object>> rows = explainOnly
                    ? List.of()
                    : jdbc.queryForList(rewritten, new MapSqlParameterSource(safeParams));
            long actualMs = System.currentTimeMillis() - t0;

            // 5) 落日志(慢查询 或 大结果)
            if (!explainOnly && (actualMs > SLOW_MS || rows.size() > 1000)) {
                asyncLog(ctx, source, rewritten, safeParams, null,
                        planCost, planRows, (int) actualMs, rows.size());
            }
            return new QueryGuardResult(rows, planCost, planRows, actualMs, false, warnings);

        } catch (QueryGuardException qge) {
            // 已经在 throwRejected 里落过日志的话不再重复;其它 QueryGuardException 在这里落
            // 简单起见:reject_code 类的异常都落,执行阶段异常也落
            asyncLog(ctx, source, rewritten == null ? sql : rewritten, safeParams,
                    qge.guardCode().name(), 0, 0, (int) (System.currentTimeMillis() - t0), 0);
            throw qge;
        } catch (RuntimeException e) {
            asyncLog(ctx, source, rewritten == null ? sql : rewritten, safeParams,
                    QueryGuardException.Code.EXECUTE_FAILED.name(),
                    0, 0, (int) (System.currentTimeMillis() - t0), 0);
            throw new QueryGuardException(QueryGuardException.Code.EXECUTE_FAILED,
                    "执行失败:" + e.getMessage());
        }
    }

    /* ===== EXPLAIN ===== */

    private long[] explain(String rewrittenSql, Map<String, Object> params) {
        String explainSql = "EXPLAIN (FORMAT JSON) " + rewrittenSql;
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList(explainSql, new MapSqlParameterSource(params));
        } catch (RuntimeException e) {
            throw new QueryGuardException(
                    QueryGuardException.Code.EXPLAIN_FAILED,
                    "EXPLAIN 失败:" + e.getMessage());
        }
        if (rows.isEmpty()) {
            throw new QueryGuardException(
                    QueryGuardException.Code.EXPLAIN_FAILED, "EXPLAIN 返回空");
        }
        // PG 的 EXPLAIN (FORMAT JSON) 返回一行,列名 "QUERY PLAN",值是 JSON 数组的字符串或对象
        Object planValue = rows.get(0).values().iterator().next();
        try {
            JsonNode root;
            if (planValue instanceof String s) {
                root = JSON.readTree(s);
            } else {
                root = JSON.valueToTree(planValue);
            }
            // root 通常是 [ { "Plan": { "Total Cost": x, "Plan Rows": y, ... } } ]
            JsonNode first = root.isArray() && root.size() > 0 ? root.get(0) : root;
            JsonNode plan = first.path("Plan");
            long cost = plan.path("Total Cost").asLong(0);
            long planRows = plan.path("Plan Rows").asLong(0);
            return new long[]{cost, planRows};
        } catch (Exception e) {
            throw new QueryGuardException(
                    QueryGuardException.Code.EXPLAIN_FAILED,
                    "EXPLAIN 输出解析失败:" + e.getMessage());
        }
    }

    private void throwRejected(ExecContext ctx, String source, String rewrittenSql,
                                Map<String, Object> params,
                                QueryGuardException.Code code, String msg) {
        asyncLog(ctx, source, rewrittenSql, params, code.name(), 0, 0, 0, 0);
        throw new QueryGuardException(code, msg);
    }

    /* ===== 异步落日志 ===== */

    @Async
    public void asyncLog(ExecContext ctx, String source, String sqlText, Map<String, Object> params,
                          String rejectCode, long planCost, long planRows, int actualMs, int rowCount) {
        try {
            String hash = sqlHash(sqlText, params);
            String truncated = sqlText == null ? null
                    : (sqlText.length() > 1024 ? sqlText.substring(0, 1024) + "..." : sqlText);
            jdbc.update("""
                    INSERT INTO public.query_guard_log
                        (tenant_id, owner_id, owner_role, source, reject_code,
                         sql_hash, sql_text, plan_cost, plan_rows, actual_ms, row_count)
                    VALUES
                        (:tenant_id, :owner_id, :owner_role, :source, :reject_code,
                         :sql_hash, :sql_text, :plan_cost, :plan_rows, :actual_ms, :row_count)
                    """, new MapSqlParameterSource()
                    .addValue("tenant_id", ctx == null ? "unknown" : ctx.tenantId())
                    .addValue("owner_id", ctx == null ? null : ctx.ownerId())
                    .addValue("owner_role", ctx == null ? null : ctx.ownerRole())
                    .addValue("source", source)
                    .addValue("reject_code", rejectCode)
                    .addValue("sql_hash", hash)
                    .addValue("sql_text", truncated)
                    .addValue("plan_cost", planCost)
                    .addValue("plan_rows", planRows)
                    .addValue("actual_ms", actualMs)
                    .addValue("row_count", rowCount));
        } catch (Exception e) {
            // log writing 永远不能影响主路径
            log.warn("query_guard_log insert failed: {}", e.getMessage());
        }
    }

    private static String cacheKey(String sql, Map<String, Object> params, ExecContext ctx) {
        return sqlHash(sql, params) + "|" + ctx.tenantId() + "|" + ctx.ownerId()
                + "|" + ctx.ownerRole() + "|" + ctx.ownerCollege();
    }

    private static String sqlHash(String sql, Map<String, Object> params) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update((sql == null ? "" : sql).getBytes(StandardCharsets.UTF_8));
            // 参数顺序无关 hash:用 TreeMap 排序
            if (params != null) {
                new TreeMap<>(params).forEach((k, v) ->
                        md.update((k + "=" + v + ";").getBytes(StandardCharsets.UTF_8)));
            }
            return HexFormat.of().formatHex(md.digest()).substring(0, 64);
        } catch (Exception e) {
            return "hash_err";
        }
    }
}
