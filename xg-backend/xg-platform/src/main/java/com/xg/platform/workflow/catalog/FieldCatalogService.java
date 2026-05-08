package com.xg.platform.workflow.catalog;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.workflow.catalog.mapper.FieldCatalogMapper;
import com.xg.platform.workflow.form.FormField;
import com.xg.platform.workflow.form.FormSchema;
import com.xg.platform.workflow.mapper.WorkflowDefinitionMapper;
import com.xg.platform.workflow.model.WorkflowDefinition;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class FieldCatalogService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final FieldCatalogMapper catalogMapper;
    private final WorkflowDefinitionMapper definitionMapper;
    private final JdbcTemplate jdbc;

    /**
     * Trigram-similarity search across {@code label} and {@code description}.
     * Returns top {@code limit} candidates ordered by canonical-then-usage-then-
     * similarity composite ranking.
     *
     * <p>The similarity threshold (0.18) is tuned for short Chinese labels —
     * lower than typical English defaults (0.3) because Chinese trigrams
     * partition characters into smaller overlapping segments. Below 0.15 we
     * see noise; above 0.3 we miss legitimate paraphrases like
     * "紧急联系人电话" vs "紧急情况联络电话".
     */
    public List<FieldCatalogCandidate> search(String query, int limit) {
        if (query == null || query.isBlank()) return List.of();
        String tenantId = TenantContext.getRequiredTenantId();
        String schema = TenantContext.getSchemaName();
        String tableRef = schema != null ? schema + ".field_catalog" : "field_catalog";

        // GREATEST(label_sim, desc_sim) handles the case where the query phrase
        // overlaps the description ("家长能联系到的紧急电话") even if the label
        // doesn't share many characters ("紧急联系人电话").
        String sql = "SELECT id, name, label, type, description, canonical, usage_count, category, " +
                "       used_in_flows, " +
                "       GREATEST(similarity(label, ?), COALESCE(similarity(description, ?), 0)) AS sim " +
                "  FROM " + tableRef +
                " WHERE tenant_id = ? AND deleted_at IS NULL AND deprecated = FALSE " +
                "   AND (similarity(label, ?) > 0.18 OR similarity(COALESCE(description,''), ?) > 0.18) " +
                " ORDER BY canonical DESC, sim DESC, usage_count DESC " +
                " LIMIT ?";

        return jdbc.query(sql,
                ps -> {
                    ps.setString(1, query);
                    ps.setString(2, query);
                    ps.setString(3, tenantId);
                    ps.setString(4, query);
                    ps.setString(5, query);
                    ps.setInt(6, limit);
                },
                (rs, i) -> {
                    FieldCatalogCandidate c = new FieldCatalogCandidate();
                    c.setName(rs.getString("name"));
                    c.setLabel(rs.getString("label"));
                    c.setType(rs.getString("type"));
                    c.setDescription(rs.getString("description"));
                    c.setCanonical(rs.getBoolean("canonical"));
                    c.setUsageCount(rs.getInt("usage_count"));
                    c.setCategory(rs.getString("category"));
                    c.setSimilarity(rs.getDouble("sim"));
                    c.setUsedInFlows(parseStringArray(rs.getString("used_in_flows")));
                    return c;
                });
    }

    /** Look up a single entry by tenant-scoped name. */
    public FieldCatalogEntry findByName(String name) {
        String tenantId = TenantContext.getRequiredTenantId();
        return catalogMapper.selectOne(
                new LambdaQueryWrapper<FieldCatalogEntry>()
                        .eq(FieldCatalogEntry::getTenantId, tenantId)
                        .eq(FieldCatalogEntry::getName, name)
                        .last("LIMIT 1"));
    }

    /**
     * Increment the usage_count and append a flow code to used_in_flows
     * (de-duped). Atomically updates both via a single SQL statement so two
     * concurrent reuse calls don't race.
     */
    public void recordUsage(String name, String flowCode) {
        String tenantId = TenantContext.getRequiredTenantId();
        String schema = TenantContext.getSchemaName();
        String tableRef = schema != null ? schema + ".field_catalog" : "field_catalog";

        // Append flow_code only if not already present:
        //   used_in_flows = (existing minus flow_code) || [flow_code]
        // updated_at via NOW() so admin can audit recent additions.
        String sql = "UPDATE " + tableRef +
                "   SET usage_count = usage_count + 1, " +
                "       used_in_flows = (used_in_flows - ?::text) || ?::jsonb, " +
                "       updated_at = NOW() " +
                " WHERE tenant_id = ? AND name = ? AND deleted_at IS NULL";
        jdbc.update(sql, flowCode, "[\"" + flowCode + "\"]", tenantId, name);
    }

    /**
     * Insert a new catalog entry from a form field declaration. Used both by
     * the bootstrap pass and on-demand when AI flow creates a brand-new field.
     * Idempotent against {@code (tenant_id, name)} unique constraint.
     */
    @Transactional
    public void upsertFromField(FormField field, String flowCode) {
        if (field == null || field.getName() == null) return;
        FieldCatalogEntry existing = findByName(field.getName());
        if (existing != null) {
            recordUsage(field.getName(), flowCode);
            return;
        }
        FieldCatalogEntry e = new FieldCatalogEntry();
        e.setName(field.getName());
        e.setLabel(field.getLabel() != null ? field.getLabel() : field.getName());
        e.setType(field.getType() != null ? field.getType() : "string");
        e.setRequired(field.isRequired());
        e.setPlaceholder(field.getPlaceholder());
        e.setPattern(field.getPattern());
        e.setMinLength(field.getMinLength());
        e.setMaxLength(field.getMaxLength());
        if (field.getMin() != null) e.setMinValue(java.math.BigDecimal.valueOf(field.getMin()));
        if (field.getMax() != null) e.setMaxValue(java.math.BigDecimal.valueOf(field.getMax()));
        e.setCanonical(false);
        e.setUsageCount(1);
        e.setWriteStrategy("none");
        e.setSensitivity("normal");
        e.setIndexStrategy("none");
        e.setDeprecated(false);
        catalogMapper.insert(e);
        // used_in_flows starts as ["flow_code"] via raw UPDATE since the
        // entity doesn't map JSONB arrays.
        if (flowCode != null && !flowCode.isBlank()) {
            String tenantId = TenantContext.getRequiredTenantId();
            String schema = TenantContext.getSchemaName();
            String tableRef = schema != null ? schema + ".field_catalog" : "field_catalog";
            jdbc.update("UPDATE " + tableRef +
                    " SET used_in_flows = ?::jsonb WHERE tenant_id = ? AND name = ?",
                    "[\"" + flowCode + "\"]", tenantId, e.getName());
        }
    }

    /**
     * One-shot: scan every published workflow definition's form.fields and
     * register them in the catalog. Designed to be safe to re-run; duplicate
     * (tenant_id, name) entries just bump usage_count.
     */
    @Transactional
    public int bootstrapFromDefinitions() {
        List<WorkflowDefinition> defs = definitionMapper.selectList(
                new LambdaQueryWrapper<WorkflowDefinition>()
                        .eq(WorkflowDefinition::getStatus, "published")
                        .isNull(WorkflowDefinition::getDeletedAt));
        int total = 0;
        for (WorkflowDefinition def : defs) {
            try {
                FormSchema schema = FormSchema.fromSnapshot(def.getConfigJson());
                if (schema == null || schema.getFields() == null) continue;
                for (FormField field : schema.getFields()) {
                    if (field == null || field.getName() == null) continue;
                    if (field.isDeprecated()) continue;
                    upsertFromField(field, def.getCode());
                    total++;
                }
            } catch (Exception ex) {
                log.warn("bootstrap skip definition id={} code={}: {}",
                        def.getId(), def.getCode(), ex.getMessage());
            }
        }
        return total;
    }

    @SuppressWarnings("unchecked")
    private List<String> parseStringArray(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            Object parsed = JSON.readValue(json, new TypeReference<Object>() {});
            if (parsed instanceof List) {
                List<String> out = new ArrayList<>();
                for (Object item : (List<Object>) parsed) {
                    if (item != null) out.add(item.toString());
                }
                return out;
            }
        } catch (Exception ignored) {
        }
        return Collections.emptyList();
    }
}
