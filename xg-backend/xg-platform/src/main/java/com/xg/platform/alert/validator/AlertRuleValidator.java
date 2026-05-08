package com.xg.platform.alert.validator;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import com.xg.platform.alert.catalog.AlertDimension;
import com.xg.platform.alert.catalog.AlertFieldCatalog;
import com.xg.platform.alert.dsl.AggregationSpec;
import com.xg.platform.alert.dsl.AlertRuleDsl;
import com.xg.platform.alert.expression.ConditionSyntaxException;
import com.xg.platform.alert.expression.RuleConditionEvaluator;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class AlertRuleValidator {

    private static final Set<String> OPS_REQUIRING_FIELD = Set.of("sum", "avg", "max", "min");

    private final ObjectMapper objectMapper;
    private final RuleConditionEvaluator conditionEvaluator;

    private JsonSchema schema;
    private ObjectMapper nonNullMapper;

    @PostConstruct
    public void initSchema() throws IOException {
        try (InputStream in = new ClassPathResource("alert/alert-rule.schema.json").getInputStream()) {
            JsonNode schemaNode = objectMapper.readTree(in);
            JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7);
            this.schema = factory.getSchema(schemaNode);
        }
        this.nonNullMapper = objectMapper.copy().setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }

    public ValidationResult validate(AlertRuleDsl dsl) {
        List<String> errors = new ArrayList<>();

        JsonNode dslNode = nonNullMapper.valueToTree(dsl);
        Set<ValidationMessage> schemaErrors = schema.validate(dslNode);
        for (ValidationMessage m : schemaErrors) {
            errors.add("schema: " + m.getMessage());
        }
        if (!errors.isEmpty()) return new ValidationResult(false, errors);

        try {
            conditionEvaluator.validateSyntax(dsl.condition());
        } catch (ConditionSyntaxException e) {
            errors.add("condition: " + e.getMessage());
        }

        if (dsl.aggregations() != null) {
            for (Map.Entry<String, AggregationSpec> entry : dsl.aggregations().entrySet()) {
                validateAggregation(entry.getKey(), entry.getValue(), errors);
            }
        }

        return new ValidationResult(errors.isEmpty(), errors);
    }

    private void validateAggregation(String alias, AggregationSpec agg, List<String> errors) {
        AlertDimension dim;
        try {
            dim = AlertDimension.fromCode(agg.dimension());
        } catch (IllegalArgumentException e) {
            errors.add("aggregations." + alias + ".dimension: unknown '" + agg.dimension() + "'");
            return;
        }
        if (agg.field() != null && !AlertFieldCatalog.hasField(dim, agg.field())) {
            errors.add("aggregations." + alias + ".field: '" + agg.field()
                    + "' not defined for dimension " + dim.code());
        }
        if (OPS_REQUIRING_FIELD.contains(agg.op()) && agg.field() == null) {
            errors.add("aggregations." + alias + ".field: required for op=" + agg.op());
        }
        // filter is validated at SQL-compile time (not via the condition evaluator,
        // which uses a different grammar subset)
    }

    public record ValidationResult(boolean valid, List<String> errors) {}
}
