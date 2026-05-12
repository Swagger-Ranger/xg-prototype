package com.xg.platform.schemacatalog;

import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 暴露 SchemaCatalog 给 AI sidecar(NL→SQL 翻译时 prompt 里要把"哪些表 / 哪些列 / 哪些是
 * 当前角色应当看见的"喂给 LLM)。
 *
 * <p>双路径:
 * <ul>
 *   <li>{@code /internal/schema-catalog/markdown?role=dean} — sidecar 用,走 /internal/** 白名单</li>
 *   <li>{@code /api/v1/schema-catalog/markdown?role=dean} — 前端调试用,走登录态</li>
 * </ul>
 */
@RestController
@RequiredArgsConstructor
public class SchemaCatalogController {

    private final SchemaCatalogService catalog;

    @GetMapping({"/api/v1/schema-catalog/markdown", "/internal/schema-catalog/markdown"})
    public R<Map<String, String>> markdown(@RequestParam(value = "role", defaultValue = "school_admin") String role) {
        return R.ok(Map.of("role", role, "markdown", catalog.renderForLlm(role)));
    }
}
