package com.xg.business.fieldcatalog.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * 字段目录:一份 yaml 描述一个页面能按什么筛 + 每条筛选项怎么取数 / 怎么显示 / AI 怎么映射别名。
 *
 * 一个 page 对应一个 yaml 文件 (e.g. field-catalog/student.yaml),启动时由
 * {@link com.xg.business.fieldcatalog.loader.FieldCatalogLoader} 全部读入内存,
 * 由 {@link com.xg.business.fieldcatalog.service.FieldCatalogService} 暴露查询。
 *
 * 设计为不可变 record,加载后不允许修改 (热更新 P0 不做)。
 */
public record FieldCatalog(String page, List<FieldDef> fields) {

    public record FieldDef(
            String key,
            String label,
            /** AI prompt 用的字段说明,可选;不填则只用 label,LLM 拿到的提示就比较干。 */
            String description,
            String type,
            SqlConfig sql,
            OptionsConfig options,
            String parent,
            Visibility visibility,
            List<Alias> aliases
    ) {}

    public record SqlConfig(
            String strategy,
            String column,
            List<String> columns,
            String residentialType,
            String jsonbPath
    ) {}

    public record OptionsConfig(
            /* yaml key 是 'static',Java 关键字冲突,这里用 staticOptions */
            @JsonProperty("static") List<EnumOption> staticOptions,
            CascadingStatic cascadingStatic,
            DynamicSource dynamic
    ) {}

    /**
     * 父级值分组的静态选项。例如 college=计算机学院 → ["软件工程", ...]。
     * 父级未选时前端展开所有 group 的扁平合集。
     */
    public record CascadingStatic(
            /** 父级 filter 的 key,通常和 FieldDef.parent 相同;冗余写一份是为了 yaml 单点可读。 */
            String parentKey,
            /** 父级值 → 该子级可选项 (option label 直接用 value)。 */
            java.util.Map<String, List<String>> groups
    ) {}

    public record EnumOption(String value, String label) {}

    public record DynamicSource(
            String source,
            String column,
            String url,
            String key,
            List<String> scopedBy
    ) {}

    public record Visibility(String tenantSetting) {}

    public record Alias(String phrase, String value) {}
}
