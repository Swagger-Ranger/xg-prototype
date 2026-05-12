package com.xg.platform.queryguard;

import java.util.List;
import java.util.Map;

/**
 * QueryGuard.safeExecute 的结果:rows + 性能元信息 + 用户可见的 warning 列表。
 *
 * <p>warnings 是结构化字符串数组,前端把它当 banner 显示("扫描行 > 50k" / "phone 已脱敏" 等)。
 * planCost / planRows 从 EXPLAIN (FORMAT JSON) 的 root node 抽出来,actualMs 是真实执行耗时。
 * cached=true 时 planCost/planRows 是缓存命中前的值,actualMs ≈ 0。
 */
public record QueryGuardResult(
        List<Map<String, Object>> rows,
        long planCost,
        long planRows,
        long actualMs,
        boolean cached,
        List<String> warnings
) {
}
