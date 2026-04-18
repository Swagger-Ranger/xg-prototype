package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.workstudy.dto.ApplicationCreateRequest;
import com.xg.business.workstudy.dto.ApplicationDecisionRequest;
import com.xg.business.workstudy.dto.ApplicationQueryRequest;
import com.xg.business.workstudy.dto.PositionCreateRequest;
import com.xg.business.workstudy.dto.PositionQueryRequest;
import com.xg.business.workstudy.mapper.WorkStudyApplicationMapper;
import com.xg.business.workstudy.mapper.WorkStudyPositionMapper;
import com.xg.business.workstudy.model.WorkStudyApplication;
import com.xg.business.workstudy.model.WorkStudyPosition;
import com.xg.common.base.PageResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkStudyService {

    private static final Set<String> DECISION_STATUSES = Set.of("recommended", "hired", "rejected");

    private final WorkStudyPositionMapper positionMapper;
    private final WorkStudyApplicationMapper applicationMapper;

    @Transactional
    public WorkStudyPosition createPosition(PositionCreateRequest req, Long creatorId) {
        WorkStudyPosition p = new WorkStudyPosition();
        p.setTitle(req.getTitle());
        p.setPositionType(req.getPositionType() == null ? "fixed" : req.getPositionType());
        p.setDepartmentName(req.getDepartmentName());
        p.setDescription(req.getDescription());
        p.setRequirements(req.getRequirements());
        p.setPreferFinancialAid(Boolean.TRUE.equals(req.getPreferFinancialAid()));
        p.setHourlyRate(req.getHourlyRate());
        p.setWeeklyHours(req.getWeeklyHours() == null ? 10 : req.getWeeklyHours());
        p.setHeadcount(req.getHeadcount() == null ? 1 : req.getHeadcount());
        p.setHiredCount(0);
        p.setStatus("open");
        p.setStartDate(req.getStartDate());
        p.setEndDate(req.getEndDate());
        p.setCreatorId(creatorId);
        positionMapper.insert(p);
        return p;
    }

    public PageResult<WorkStudyPosition> listPositions(PositionQueryRequest query) {
        Page<WorkStudyPosition> page = query.toPage();
        LambdaQueryWrapper<WorkStudyPosition> wrapper = new LambdaQueryWrapper<WorkStudyPosition>()
                .eq(query.getStatus() != null, WorkStudyPosition::getStatus, query.getStatus())
                .eq(query.getPositionType() != null, WorkStudyPosition::getPositionType, query.getPositionType())
                .eq(query.getPreferFinancialAid() != null, WorkStudyPosition::getPreferFinancialAid, query.getPreferFinancialAid())
                .orderByDesc(WorkStudyPosition::getCreatedAt);
        return PageResult.of(positionMapper.selectPage(page, wrapper));
    }

    public WorkStudyPosition positionDetail(Long id) {
        WorkStudyPosition p = positionMapper.selectById(id);
        if (p == null) {
            throw WorkStudyErrorCode.POSITION_NOT_FOUND.exception();
        }
        return p;
    }

    @Transactional
    public void closePosition(Long id) {
        WorkStudyPosition p = positionDetail(id);
        p.setStatus("closed");
        positionMapper.updateById(p);
    }

    @Transactional
    public WorkStudyApplication apply(ApplicationCreateRequest req, Long studentId, String studentName) {
        WorkStudyPosition pos = positionDetail(req.getPositionId());
        if (!"open".equals(pos.getStatus())) {
            throw WorkStudyErrorCode.POSITION_CLOSED.exception();
        }
        if (pos.getHiredCount() != null && pos.getHeadcount() != null
                && pos.getHiredCount() >= pos.getHeadcount()) {
            throw WorkStudyErrorCode.POSITION_FULL.exception();
        }
        Long existing = applicationMapper.selectCount(new LambdaQueryWrapper<WorkStudyApplication>()
                .eq(WorkStudyApplication::getPositionId, req.getPositionId())
                .eq(WorkStudyApplication::getStudentId, studentId));
        if (existing != null && existing > 0) {
            throw WorkStudyErrorCode.APPLICATION_ALREADY_EXISTS.exception();
        }
        WorkStudyApplication app = new WorkStudyApplication();
        app.setPositionId(req.getPositionId());
        app.setStudentId(studentId);
        app.setStudentName(studentName);
        app.setFinancialAidLevel(req.getFinancialAidLevel());
        app.setIntro(req.getIntro());
        app.setStatus("pending");
        applicationMapper.insert(app);
        return app;
    }

    public PageResult<WorkStudyApplication> listApplications(ApplicationQueryRequest query) {
        Page<WorkStudyApplication> page = query.toPage();
        LambdaQueryWrapper<WorkStudyApplication> wrapper = new LambdaQueryWrapper<WorkStudyApplication>()
                .eq(query.getPositionId() != null, WorkStudyApplication::getPositionId, query.getPositionId())
                .eq(query.getStudentId() != null, WorkStudyApplication::getStudentId, query.getStudentId())
                .eq(query.getStatus() != null, WorkStudyApplication::getStatus, query.getStatus())
                .orderByDesc(WorkStudyApplication::getCreatedAt);
        return PageResult.of(applicationMapper.selectPage(page, wrapper));
    }

    public WorkStudyApplication applicationDetail(Long id) {
        WorkStudyApplication app = applicationMapper.selectById(id);
        if (app == null) {
            throw WorkStudyErrorCode.APPLICATION_NOT_FOUND.exception();
        }
        return app;
    }

    @Transactional
    public void decideApplication(Long id, ApplicationDecisionRequest req, Long deciderId) {
        if (!DECISION_STATUSES.contains(req.getStatus())) {
            throw WorkStudyErrorCode.INVALID_DECISION_STATUS.exception();
        }
        WorkStudyApplication app = applicationDetail(id);
        if (!"pending".equals(app.getStatus()) && !"recommended".equals(app.getStatus())) {
            throw WorkStudyErrorCode.APPLICATION_ALREADY_DECIDED.exception();
        }
        String previous = app.getStatus();
        app.setStatus(req.getStatus());
        app.setDecisionNote(req.getDecisionNote());
        app.setDecidedBy(deciderId);
        app.setDecidedAt(OffsetDateTime.now());
        applicationMapper.updateById(app);

        if ("hired".equals(req.getStatus()) && !"hired".equals(previous)) {
            WorkStudyPosition pos = positionMapper.selectById(app.getPositionId());
            if (pos != null) {
                int hired = (pos.getHiredCount() == null ? 0 : pos.getHiredCount()) + 1;
                pos.setHiredCount(hired);
                if (pos.getHeadcount() != null && hired >= pos.getHeadcount()) {
                    pos.setStatus("closed");
                }
                positionMapper.updateById(pos);
            }
        }
    }
}
