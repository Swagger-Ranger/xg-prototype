package com.xg.business.collection.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.collection.dto.CollectionQueryRequest;
import com.xg.business.collection.dto.CopyFormRequest;
import com.xg.business.collection.dto.CreateFormRequest;
import com.xg.business.collection.dto.SubmitFormRequest;
import com.xg.business.collection.mapper.CollectionFormMapper;
import com.xg.business.collection.mapper.CollectionSubmissionMapper;
import com.xg.business.collection.model.CollectionForm;
import com.xg.business.collection.model.CollectionSubmission;
import com.xg.common.base.PageResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CollectionService {

    private final CollectionFormMapper collectionFormMapper;
    private final CollectionSubmissionMapper collectionSubmissionMapper;
    private final ObjectMapper objectMapper;

    @Transactional
    public CollectionForm createForm(CreateFormRequest req, Long creatorId) {
        CollectionForm form = new CollectionForm();
        form.setTitle(req.getTitle());
        form.setDescription(req.getDescription());
        form.setFields(req.getFields() != null ? req.getFields() : "[]");
        form.setCreatorId(creatorId);
        form.setScopeType(req.getScopeType() != null ? req.getScopeType() : "class");
        form.setScopeOrgIds(toJson(req.getScopeOrgIds()));
        form.setStatus("draft");
        form.setDeadline(req.getDeadline());
        form.setAllowEdit(req.getAllowEdit() != null ? req.getAllowEdit() : true);
        collectionFormMapper.insert(form);
        return form;
    }

    @Transactional
    public CollectionForm copyForm(Long sourceFormId, CopyFormRequest req, Long creatorId) {
        CollectionForm source = getFormOrThrow(sourceFormId);

        CollectionForm form = new CollectionForm();
        form.setTitle(req.getTitle());
        form.setDescription(source.getDescription());
        form.setFields(source.getFields());
        form.setCreatorId(creatorId);
        form.setScopeType(source.getScopeType());
        form.setScopeOrgIds(req.getScopeOrgIds() != null ? toJson(req.getScopeOrgIds()) : source.getScopeOrgIds());
        form.setStatus("draft");
        form.setDeadline(req.getDeadline());
        form.setAllowEdit(source.getAllowEdit());
        form.setSourceFormId(sourceFormId);
        collectionFormMapper.insert(form);
        return form;
    }

    @Transactional
    public void updateForm(Long id, CreateFormRequest req, Long userId) {
        CollectionForm form = getFormOrThrow(id);
        if (!userId.equals(form.getCreatorId())) {
            throw CollectionErrorCode.FORM_NOT_FOUND.exception();
        }
        if (!"draft".equals(form.getStatus())) {
            throw CollectionErrorCode.EDIT_NOT_ALLOWED.exception();
        }
        form.setTitle(req.getTitle());
        form.setDescription(req.getDescription());
        if (req.getFields() != null) {
            form.setFields(req.getFields());
        }
        if (req.getScopeType() != null) {
            form.setScopeType(req.getScopeType());
        }
        if (req.getScopeOrgIds() != null) {
            form.setScopeOrgIds(toJson(req.getScopeOrgIds()));
        }
        if (req.getDeadline() != null) {
            form.setDeadline(req.getDeadline());
        }
        if (req.getAllowEdit() != null) {
            form.setAllowEdit(req.getAllowEdit());
        }
        collectionFormMapper.updateById(form);
    }

    @Transactional
    public void publishForm(Long id, Long userId) {
        CollectionForm form = getFormOrThrow(id);
        if (!userId.equals(form.getCreatorId())) {
            throw CollectionErrorCode.FORM_NOT_FOUND.exception();
        }
        form.setStatus("published");
        collectionFormMapper.updateById(form);
    }

    @Transactional
    public void closeForm(Long id, Long userId) {
        CollectionForm form = getFormOrThrow(id);
        if (!userId.equals(form.getCreatorId())) {
            throw CollectionErrorCode.FORM_NOT_FOUND.exception();
        }
        form.setStatus("closed");
        collectionFormMapper.updateById(form);
    }

    public PageResult<CollectionForm> myForms(Long creatorId, CollectionQueryRequest query) {
        Page<CollectionForm> page = query.toPage();
        LambdaQueryWrapper<CollectionForm> wrapper = new LambdaQueryWrapper<CollectionForm>()
                .eq(CollectionForm::getCreatorId, creatorId)
                .eq(query.getStatus() != null, CollectionForm::getStatus, query.getStatus())
                .like(query.getSearch() != null, CollectionForm::getTitle, query.getSearch())
                .orderByDesc(CollectionForm::getCreatedAt);
        return PageResult.of(collectionFormMapper.selectPage(page, wrapper));
    }

    public Map<String, Object> formProgress(Long formId, Long userId) {
        getFormOrThrow(formId);

        long submittedCount = collectionSubmissionMapper.selectCount(
                new LambdaQueryWrapper<CollectionSubmission>()
                        .eq(CollectionSubmission::getFormId, formId)
        );

        List<CollectionSubmission> submissions = collectionSubmissionMapper.selectList(
                new LambdaQueryWrapper<CollectionSubmission>()
                        .eq(CollectionSubmission::getFormId, formId)
                        .orderByDesc(CollectionSubmission::getSubmittedAt)
        );

        Map<String, Object> result = new HashMap<>();
        result.put("totalStudents", 0);
        result.put("submittedCount", submittedCount);
        result.put("submissions", submissions);
        return result;
    }

    public void remind(Long formId, Long userId) {
        getFormOrThrow(formId);
        log.info("Remind triggered for form {} by user {} — notification service integration pending", formId, userId);
    }

    @Transactional
    public CollectionSubmission submit(Long formId, SubmitFormRequest req, Long studentId) {
        CollectionForm form = getFormOrThrow(formId);

        if (!"published".equals(form.getStatus())) {
            throw CollectionErrorCode.FORM_NOT_PUBLISHED.exception();
        }
        if (form.getDeadline() != null && OffsetDateTime.now().isAfter(form.getDeadline())) {
            throw CollectionErrorCode.FORM_DEADLINE_PASSED.exception();
        }

        long existing = collectionSubmissionMapper.selectCount(
                new LambdaQueryWrapper<CollectionSubmission>()
                        .eq(CollectionSubmission::getFormId, formId)
                        .eq(CollectionSubmission::getStudentId, studentId)
        );
        if (existing > 0) {
            throw CollectionErrorCode.ALREADY_SUBMITTED.exception();
        }

        CollectionSubmission submission = new CollectionSubmission();
        submission.setFormId(formId);
        submission.setStudentId(studentId);
        submission.setData(toJson(req.getData()));
        submission.setStatus("submitted");
        submission.setSubmittedAt(OffsetDateTime.now());
        collectionSubmissionMapper.insert(submission);
        return submission;
    }

    @Transactional
    public CollectionSubmission updateSubmission(Long submissionId, SubmitFormRequest req, Long studentId) {
        CollectionSubmission submission = collectionSubmissionMapper.selectById(submissionId);
        if (submission == null) {
            throw CollectionErrorCode.SUBMISSION_NOT_FOUND.exception();
        }
        if (!studentId.equals(submission.getStudentId())) {
            throw CollectionErrorCode.SUBMISSION_NOT_FOUND.exception();
        }

        CollectionForm form = getFormOrThrow(submission.getFormId());
        if (!Boolean.TRUE.equals(form.getAllowEdit())) {
            throw CollectionErrorCode.EDIT_NOT_ALLOWED.exception();
        }

        submission.setData(toJson(req.getData()));
        submission.setStatus("edited");
        collectionSubmissionMapper.updateById(submission);
        return submission;
    }

    public PageResult<CollectionSubmission> mySubmissions(Long studentId, CollectionQueryRequest query) {
        Page<CollectionSubmission> page = query.toPage();
        LambdaQueryWrapper<CollectionSubmission> wrapper = new LambdaQueryWrapper<CollectionSubmission>()
                .eq(CollectionSubmission::getStudentId, studentId)
                .eq(query.getStatus() != null, CollectionSubmission::getStatus, query.getStatus())
                .orderByDesc(CollectionSubmission::getSubmittedAt);
        return PageResult.of(collectionSubmissionMapper.selectPage(page, wrapper));
    }

    // --- Private helpers ---

    private CollectionForm getFormOrThrow(Long formId) {
        CollectionForm form = collectionFormMapper.selectById(formId);
        if (form == null) {
            throw CollectionErrorCode.FORM_NOT_FOUND.exception();
        }
        return form;
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize value to JSON: {}", e.getMessage());
            return null;
        }
    }
}
