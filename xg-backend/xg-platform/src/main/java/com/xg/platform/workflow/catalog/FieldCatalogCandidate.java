package com.xg.platform.workflow.catalog;

import lombok.Data;

import java.util.List;

/**
 * Search-result projection: a single candidate returned to the AI sidecar /
 * frontend for reuse recommendation. Carries enough metadata for the LLM to
 * disambiguate and the UI to render a one-line description with provenance.
 */
@Data
public class FieldCatalogCandidate {
    private String name;
    private String label;
    private String type;
    private String description;
    private boolean canonical;
    private int usageCount;
    private String category;
    private double similarity;
    /** Workflow codes that already declare this field. */
    private List<String> usedInFlows;
}
