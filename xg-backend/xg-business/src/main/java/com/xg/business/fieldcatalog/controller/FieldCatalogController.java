package com.xg.business.fieldcatalog.controller;

import com.xg.business.fieldcatalog.model.FieldCatalog;
import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import com.xg.business.fieldcatalog.service.FieldCatalogService;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 给前端 / AI sidecar 暴露字段目录(去掉 sql 取数实现)。
 *
 * 公共投影只含三方都需要的元信息:key / label / type / 父级 (cascade) / 租户开关 /
 * 选项 (静态枚举 or 动态来源 hint) / AI 别名。
 *
 * sql.* 不暴露:它是后端 SqlBuilder 的实现细节,泄漏 DB 列名 / strategy 名都没价值。
 */
@RestController
@RequiredArgsConstructor
public class FieldCatalogController {

    private final FieldCatalogService catalogService;

    /**
     * 双路径:/api/v1/... 给前端(走 SaToken 登录拦截);/internal/... 给 AI sidecar
     * (走 SaToken 白名单 + 网络隔离),省得 sidecar 自己拼用户态。返回数据一致。
     */
    @GetMapping({"/api/v1/field-catalog/{page}", "/internal/field-catalog/{page}"})
    public R<PublicCatalog> get(@PathVariable String page) {
        FieldCatalog catalog = catalogService.getByPage(page);
        return R.ok(new PublicCatalog(catalog.page(), catalog.fields().stream().map(FieldCatalogController::toPublic).toList()));
    }

    private static PublicField toPublic(FieldDef f) {
        var opts = f.options();
        return new PublicField(
                f.key(), f.label(), f.description(), f.type(), f.parent(),
                f.visibility() == null ? null : f.visibility().tenantSetting(),
                opts == null ? null : opts.staticOptions(),
                opts == null ? null : opts.cascadingStatic(),
                opts == null || opts.dynamic() == null ? null : new DynamicHint(
                        opts.dynamic().url(),
                        opts.dynamic().key(),
                        opts.dynamic().scopedBy()),
                f.aliases() == null ? null : f.aliases().stream()
                        .map(a -> new AliasView(a.phrase(), a.value())).toList()
        );
    }

    public record PublicCatalog(String page, List<PublicField> fields) {}

    public record PublicField(
            String key,
            String label,
            String description,
            String type,
            String parent,
            String tenantSetting,
            List<FieldCatalog.EnumOption> options,
            FieldCatalog.CascadingStatic cascadingStatic,
            DynamicHint dynamic,
            List<AliasView> aliases
    ) {}

    public record DynamicHint(String url, String key, List<String> scopedBy) {}

    public record AliasView(String phrase, String value) {}
}
