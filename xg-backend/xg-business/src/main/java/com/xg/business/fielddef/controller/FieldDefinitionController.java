package com.xg.business.fielddef.controller;

import com.xg.business.fielddef.dto.FieldDefinitionRequest;
import com.xg.business.fielddef.model.FieldDefinition;
import com.xg.business.fielddef.service.FieldDefinitionService;
import com.xg.common.base.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequiredArgsConstructor
public class FieldDefinitionController {

    private final FieldDefinitionService service;

    @GetMapping("/api/v1/field-definitions")
    public R<List<FieldDefinition>> list(@RequestParam(required = false) Boolean onlyEnabled) {
        return R.ok(service.list(Boolean.TRUE.equals(onlyEnabled)));
    }

    @PostMapping("/api/v1/field-definitions")
    public R<FieldDefinition> create(@RequestBody @Validated FieldDefinitionRequest req) {
        return R.ok(service.create(req));
    }

    @PutMapping("/api/v1/field-definitions/{id}")
    public R<FieldDefinition> update(@PathVariable Long id,
                                     @RequestBody @Validated FieldDefinitionRequest req) {
        return R.ok(service.update(id, req));
    }

    @DeleteMapping("/api/v1/field-definitions/{id}")
    public R<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return R.ok();
    }
}
