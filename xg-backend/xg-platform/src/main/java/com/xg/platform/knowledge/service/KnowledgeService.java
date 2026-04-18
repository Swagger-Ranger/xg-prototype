package com.xg.platform.knowledge.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageQuery;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import com.xg.platform.knowledge.dto.AskQuestionRequest;
import com.xg.platform.knowledge.dto.KnowledgeFeedbackRequest;
import com.xg.platform.knowledge.mapper.KnowledgeQaMapper;
import com.xg.platform.knowledge.model.KnowledgeQa;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * P0 stub for knowledge Q&A. Actual RAG/answer generation lives in the AI sidecar;
 * the Java side only persists question/answer history and feedback so admins can review.
 * The frontend primarily drives knowledge Q&A through the AI panel (which calls the sidecar).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeService {

    private static final String PLACEHOLDER_ANSWER =
            "知识库 RAG 服务正在建设中，请通过 AI 助手直接提问以获得即时回答。";

    private final KnowledgeQaMapper knowledgeQaMapper;

    @Transactional
    public KnowledgeQa ask(AskQuestionRequest req, Long userId) {
        KnowledgeQa qa = new KnowledgeQa();
        qa.setUserId(userId);
        qa.setQuestion(req.getQuestion());
        qa.setAnswer(PLACEHOLDER_ANSWER);
        qa.setSources("[]");
        qa.setCategory("general");
        knowledgeQaMapper.insert(qa);
        return qa;
    }

    public PageResult<KnowledgeQa> history(Long userId, PageQuery query) {
        Page<KnowledgeQa> page = query.toPage();
        LambdaQueryWrapper<KnowledgeQa> wrapper = new LambdaQueryWrapper<KnowledgeQa>()
                .eq(KnowledgeQa::getUserId, userId)
                .orderByDesc(KnowledgeQa::getCreatedAt);
        return PageResult.of(knowledgeQaMapper.selectPage(page, wrapper));
    }

    @Transactional
    public void feedback(Long id, KnowledgeFeedbackRequest req, Long userId) {
        KnowledgeQa qa = knowledgeQaMapper.selectById(id);
        if (qa == null || !userId.equals(qa.getUserId())) {
            throw new BizException("KNOWLEDGE_QA_NOT_FOUND", "问答记录不存在");
        }
        qa.setHelpful(req.getHelpful());
        knowledgeQaMapper.updateById(qa);
    }
}
