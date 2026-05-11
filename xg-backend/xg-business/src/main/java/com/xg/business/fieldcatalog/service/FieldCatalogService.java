package com.xg.business.fieldcatalog.service;

import com.xg.business.fieldcatalog.loader.FieldCatalogLoader;
import com.xg.business.fieldcatalog.model.FieldCatalog;
import com.xg.business.fieldcatalog.model.FieldCatalog.FieldDef;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * 字段目录的查询入口。所有调用方 (SqlBuilder / REST 端点 / AI sidecar 同步逻辑)
 * 都从这里拿,不直接读 yaml,也不直接持有 Loader,方便后续替换成 DB-backed 实现。
 */
@Service
@RequiredArgsConstructor
public class FieldCatalogService {

    private final FieldCatalogLoader loader;

    public FieldCatalog getByPage(String page) {
        FieldCatalog catalog = loader.getAll().get(page);
        if (catalog == null) {
            throw new BizException("FIELD_CATALOG_NOT_FOUND", "字段目录不存在:" + page);
        }
        return catalog;
    }

    public Optional<FieldDef> findField(String page, String key) {
        return getByPage(page).fields().stream()
                .filter(f -> f.key().equals(key))
                .findFirst();
    }

    public List<FieldDef> fields(String page) {
        return getByPage(page).fields();
    }
}
