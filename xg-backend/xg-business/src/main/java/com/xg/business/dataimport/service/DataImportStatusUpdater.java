package com.xg.business.dataimport.service;

import com.xg.business.dataimport.mapper.DataImportSessionMapper;
import com.xg.business.dataimport.model.DataImportSession;
import com.xg.platform.notification.recipient.RecipientContext;
import com.xg.platform.notification.service.NotificationOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * 数据导入 session 状态 + 通知的"出事兜底"写入器。
 *
 * <p>为什么单独抽个 bean:{@link DataImportService#execute} 是 @Transactional,
 * 当 executor 抛 RuntimeException 时外层事务回滚 —— 如果在外层 try-catch 里写
 * "status=failed" + 发通知,这两个操作也会跟着回滚,导致用户既看不到"失败"状态
 * 也收不到通知。把它们挪进 REQUIRES_NEW 的独立事务,出错的现场状态才能真正落盘。
 *
 * <p>Spring AOP 限制:同一个 bean 内部方法互调不会触发事务代理,
 * 所以这里必须是独立 bean,由 {@link DataImportService} 注入后调用。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataImportStatusUpdater {

    private static final Map<String, String> SCENARIO_LABELS = Map.of(
            "student", "学生信息",
            "teacher", "教师基础信息",
            "counselor", "辅导员角色赋予");

    private final DataImportSessionMapper sessionMapper;
    private final NotificationOrchestrator notificationOrchestrator;

    /**
     * 执行前标记 status='executing'(独立事务,立即可见)。
     *
     * <p>原写法在 {@link DataImportService#execute} 的 @Transactional 内 setStatus 然后
     * updateById,但事务要等长跑的 executor 完成才 commit;前端轮询 session 永远看到
     * 旧状态,体验上像"卡死"。独立事务立即落盘,UI 能看到导入正在跑。
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markExecuting(Long sessionId, Map<String, Object> strategy) {
        DataImportSession session = sessionMapper.selectById(sessionId);
        if (session == null) return;
        session.setStatus("executing");
        if (strategy != null) session.setStrategy(strategy);
        sessionMapper.updateById(session);
    }

    /** 失败路径:独立事务写 session.status='failed' + 经 Orchestrator 发失败通知。 */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailedAndNotify(Long sessionId, Long operatorId, String errorMessage) {
        DataImportSession session = sessionMapper.selectById(sessionId);
        if (session == null) {
            log.warn("markFailedAndNotify: session {} not found, skip", sessionId);
            return;
        }
        session.setStatus("failed");
        session.setErrorMessage(errorMessage == null || errorMessage.isBlank() ? "执行失败" : errorMessage);
        sessionMapper.updateById(session);

        try {
            Map<String, Object> vars = new HashMap<>();
            vars.put("scenario_label", SCENARIO_LABELS.getOrDefault(session.getScenario(), session.getScenario()));
            vars.put("file_name", session.getFileName() == null ? "(未命名)" : session.getFileName());
            vars.put("error_message", session.getErrorMessage());
            notificationOrchestrator.send(
                    "DATA_IMPORT_FAILED",
                    "data_import_session",
                    session.getId(),
                    RecipientContext.applicant(operatorId),
                    vars);
        } catch (Exception ex) {
            log.warn("notify import failed event also failed sessionId={}: {}", sessionId, ex.getMessage());
        }
    }
}
