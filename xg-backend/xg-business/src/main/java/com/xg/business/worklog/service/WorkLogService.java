package com.xg.business.worklog.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.worklog.dto.WorkLogCreateRequest;
import com.xg.business.worklog.dto.WorkLogQueryRequest;
import com.xg.business.worklog.mapper.WorkLogMapper;
import com.xg.business.worklog.model.WorkLog;
import com.xg.common.base.PageResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkLogService {

    private final WorkLogMapper workLogMapper;

    @Transactional
    public WorkLog create(WorkLogCreateRequest req, Long authorId, String authorName) {
        WorkLog log = new WorkLog();
        log.setCategory(req.getCategory());
        log.setTitle(req.getTitle());
        log.setContent(req.getContent());
        log.setData(req.getData());
        log.setAuthorId(authorId);
        log.setAuthorName(authorName);
        log.setLogDate(req.getLogDate());
        workLogMapper.insert(log);
        return log;
    }

    public PageResult<WorkLog> list(WorkLogQueryRequest query, Long authorId) {
        Page<WorkLog> page = query.toPage();
        LambdaQueryWrapper<WorkLog> wrapper = new LambdaQueryWrapper<WorkLog>()
                .eq(authorId != null, WorkLog::getAuthorId, authorId)
                .eq(query.getCategory() != null, WorkLog::getCategory, query.getCategory())
                .ge(query.getStartDate() != null, WorkLog::getLogDate, query.getStartDate())
                .le(query.getEndDate() != null, WorkLog::getLogDate, query.getEndDate())
                .orderByDesc(WorkLog::getLogDate)
                .orderByDesc(WorkLog::getCreatedAt);
        return PageResult.of(workLogMapper.selectPage(page, wrapper));
    }

    public WorkLog detail(Long id) {
        WorkLog log = workLogMapper.selectById(id);
        if (log == null) {
            throw WorkLogErrorCode.WORK_LOG_NOT_FOUND.exception();
        }
        return log;
    }

    @Transactional
    public void delete(Long id, Long userId) {
        WorkLog log = detail(id);
        if (!log.getAuthorId().equals(userId)) {
            throw WorkLogErrorCode.WORK_LOG_FORBIDDEN.exception();
        }
        workLogMapper.deleteById(id);
    }
}
