package com.xg.business.collection.controller;

import com.xg.business.collection.dto.CollectionQueryRequest;
import com.xg.business.collection.dto.CopyFormRequest;
import com.xg.business.collection.dto.CreateFormRequest;
import com.xg.business.collection.dto.SubmitFormRequest;
import com.xg.business.collection.model.CollectionForm;
import com.xg.business.collection.model.CollectionSubmission;
import com.xg.business.collection.service.CollectionService;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
public class CollectionController {

    private final CollectionService collectionService;

    @PostMapping("/api/v1/collections/forms")
    public R<CollectionForm> createForm(
            @RequestBody @Validated CreateFormRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(collectionService.createForm(req, userId));
    }

    @PostMapping("/api/v1/collections/forms/{id}/copy")
    public R<CollectionForm> copyForm(
            @PathVariable Long id,
            @RequestBody @Validated CopyFormRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(collectionService.copyForm(id, req, userId));
    }

    @PutMapping("/api/v1/collections/forms/{id}")
    public R<Void> updateForm(
            @PathVariable Long id,
            @RequestBody @Validated CreateFormRequest req) {
        Long userId = CurrentUser.id();
        collectionService.updateForm(id, req, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/collections/forms/{id}/publish")
    public R<Void> publishForm(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        collectionService.publishForm(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/collections/forms/{id}/close")
    public R<Void> closeForm(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        collectionService.closeForm(id, userId);
        return R.ok();
    }

    @GetMapping("/api/v1/collections/forms")
    public R<PageResult<CollectionForm>> myForms(
            @Validated CollectionQueryRequest query) {
        Long userId = CurrentUser.id();
        return R.ok(collectionService.myForms(userId, query));
    }

    @GetMapping("/api/v1/collections/forms/{id}/progress")
    public R<Map<String, Object>> formProgress(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        return R.ok(collectionService.formProgress(id, userId));
    }

    @PostMapping("/api/v1/collections/forms/{id}/remind")
    public R<Void> remind(
            @PathVariable Long id) {
        Long userId = CurrentUser.id();
        collectionService.remind(id, userId);
        return R.ok();
    }

    @PostMapping("/api/v1/collections/forms/{id}/submissions")
    public R<CollectionSubmission> submit(
            @PathVariable Long id,
            @RequestBody @Validated SubmitFormRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(collectionService.submit(id, req, userId));
    }

    @PutMapping("/api/v1/collections/submissions/{id}")
    public R<CollectionSubmission> updateSubmission(
            @PathVariable Long id,
            @RequestBody @Validated SubmitFormRequest req) {
        Long userId = CurrentUser.id();
        return R.ok(collectionService.updateSubmission(id, req, userId));
    }

    @GetMapping("/api/v1/collections/my-submissions")
    public R<PageResult<CollectionSubmission>> mySubmissions(
            @Validated CollectionQueryRequest query) {
        Long userId = CurrentUser.id();
        return R.ok(collectionService.mySubmissions(userId, query));
    }
}
