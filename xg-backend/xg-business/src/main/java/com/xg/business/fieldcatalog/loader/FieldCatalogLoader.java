package com.xg.business.fieldcatalog.loader;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.fieldcatalog.model.FieldCatalog;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 启动期扫描 classpath:field-catalog/*.yaml,SnakeYAML 解析为 Map,Jackson 转 record。
 * 两步走是为了避开 SnakeYAML 对 List&lt;Record&gt; 的 TypeDescription 配置成本 ——
 * Jackson 已经在用,record + ParameterNamesModule 都自带了。
 *
 * 加载结果按 page 名 (yaml 里的 page 字段) 索引,fail-fast:启动时任一文件解析失败
 * 直接抛 IllegalStateException 终止启动,而不是悄悄跑起来后筛选行为残缺。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FieldCatalogLoader {

    private static final String LOCATION_PATTERN = "classpath*:field-catalog/*.yaml";

    private final ObjectMapper objectMapper;

    private final Map<String, FieldCatalog> catalogs = new HashMap<>();

    @PostConstruct
    public void load() {
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources;
        try {
            resources = resolver.getResources(LOCATION_PATTERN);
        } catch (Exception e) {
            throw new IllegalStateException("扫描 field-catalog yaml 失败", e);
        }
        for (Resource res : resources) {
            try (InputStream in = res.getInputStream()) {
                Map<String, Object> raw = new Yaml().load(in);
                if (raw == null) {
                    log.warn("field-catalog 空文件,跳过:{}", res.getFilename());
                    continue;
                }
                FieldCatalog catalog = objectMapper.convertValue(raw, FieldCatalog.class);
                if (catalog.page() == null || catalog.page().isBlank()) {
                    throw new IllegalStateException("field-catalog 缺少 page 字段:" + res.getFilename());
                }
                FieldCatalog prev = catalogs.put(catalog.page(), catalog);
                if (prev != null) {
                    throw new IllegalStateException("field-catalog page 重复:" + catalog.page());
                }
                log.info("field-catalog 加载: page={} fields={}", catalog.page(), catalog.fields().size());
            } catch (Exception e) {
                throw new IllegalStateException("field-catalog 解析失败:" + res.getFilename(), e);
            }
        }
    }

    public Map<String, FieldCatalog> getAll() {
        return Map.copyOf(catalogs);
    }
}
