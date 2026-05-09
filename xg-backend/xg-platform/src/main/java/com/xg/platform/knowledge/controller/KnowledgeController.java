package com.xg.platform.knowledge.controller;

import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.base.R;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.knowledge.dto.AskQuestionRequest;
import com.xg.platform.knowledge.dto.KnowledgeFeedbackRequest;
import com.xg.platform.knowledge.model.KnowledgeQa;
import com.xg.platform.knowledge.service.KnowledgeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequiredArgsConstructor
public class KnowledgeController {

    private final KnowledgeService knowledgeService;

    @PostMapping("/api/v1/knowledge/questions")
    public R<KnowledgeQa> ask(@RequestBody @Validated AskQuestionRequest req) {
        return R.ok(knowledgeService.ask(req, CurrentUser.id()));
    }

    @GetMapping("/api/v1/knowledge/qa-history")
    public R<PageResult<KnowledgeQa>> history(@Validated PageQuery query) {
        return R.ok(knowledgeService.history(CurrentUser.id(), query));
    }

    @PostMapping("/api/v1/knowledge/{id}/feedback")
    public R<Void> feedback(
            @PathVariable Long id,
            @RequestBody @Validated KnowledgeFeedbackRequest req) {
        knowledgeService.feedback(id, req, CurrentUser.id());
        return R.ok();
    }
}
