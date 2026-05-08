package com.xg.platform.workflow.catalog;

import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Read-mostly endpoints over the field catalog. The AI sidecar calls
 * {@code /search} during proposal generation; admin tooling can call
 * {@code /bootstrap} to re-scan published workflows after an external import.
 */
@RestController
@RequestMapping("/api/v1/field-catalog")
@RequiredArgsConstructor
public class FieldCatalogController {

    private final FieldCatalogService catalogService;

    @GetMapping("/search")
    public R<List<FieldCatalogCandidate>> search(@RequestParam("q") String query,
                                                  @RequestParam(value = "limit", defaultValue = "5") int limit) {
        int safe = Math.max(1, Math.min(limit, 20));
        return R.ok(catalogService.search(query, safe));
    }

    @PostMapping("/bootstrap")
    public R<Integer> bootstrap() {
        return R.ok(catalogService.bootstrapFromDefinitions());
    }
}
