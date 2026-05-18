package com.xg.business.counselortalk.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.counselortalk.dto.CounselorTalkCreateRequest;
import com.xg.business.counselortalk.dto.CounselorTalkQueryRequest;
import com.xg.business.counselortalk.mapper.CounselorTalkMapper;
import com.xg.business.counselortalk.model.CounselorTalk;
import com.xg.common.base.PageResult;
import com.xg.platform.alert.service.StudentAlertService;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CounselorTalkService {

    private final CounselorTalkMapper counselorTalkMapper;
    private final StudentEventPublisher eventPublisher;
    private final StudentAlertService studentAlertService;

    @Transactional
    public CounselorTalk create(CounselorTalkCreateRequest req, Long counselorId, String counselorName) {
        CounselorTalk talk = new CounselorTalk();
        talk.setStudentId(req.getStudentId());
        talk.setStudentName(req.getStudentName());
        talk.setCounselorId(counselorId);
        talk.setCounselorName(counselorName);
        talk.setTopic(req.getTopic());
        talk.setContent(req.getContent());
        talk.setFollowUp(req.getFollowUp());
        talk.setTalkAt(req.getTalkAt());
        talk.setSourceAlertId(req.getSourceAlertId());
        talk.setSourceCareTaskId(req.getSourceCareTaskId());
        counselorTalkMapper.insert(talk);

        Map<String, Object> eventData = new LinkedHashMap<>();
        eventData.put("talk_id", talk.getId());
        eventData.put("topic", talk.getTopic());
        eventData.put("counselor_id", counselorId);
        eventData.put("counselor_name", counselorName);
        if (talk.getSourceAlertId() != null) {
            eventData.put("source_alert_id", talk.getSourceAlertId());
        }
        if (talk.getSourceCareTaskId() != null) {
            eventData.put("source_care_task_id", talk.getSourceCareTaskId());
        }
        eventPublisher.publish(talk.getStudentId(), StudentEventType.COUNSELOR_TALK_RECORDED,
                "counselor_talk", eventData, talk.getTalkAt());

        if (talk.getSourceAlertId() != null) {
            try {
                studentAlertService.linkCounselorTalk(talk.getSourceAlertId(), talk.getId(), counselorId);
            } catch (Exception e) {
                log.warn("failed to link alert {} to talk {}", talk.getSourceAlertId(), talk.getId(), e);
            }
        }
        return talk;
    }

    public PageResult<CounselorTalk> list(CounselorTalkQueryRequest query) {
        Page<CounselorTalk> page = query.toPage();
        LambdaQueryWrapper<CounselorTalk> wrapper = new LambdaQueryWrapper<CounselorTalk>()
                .eq(query.getStudentId() != null, CounselorTalk::getStudentId, query.getStudentId())
                .eq(query.getCounselorId() != null, CounselorTalk::getCounselorId, query.getCounselorId())
                .eq(query.getTopic() != null, CounselorTalk::getTopic, query.getTopic())
                .orderByDesc(CounselorTalk::getTalkAt)
                .orderByDesc(CounselorTalk::getCreatedAt);
        return PageResult.of(counselorTalkMapper.selectPage(page, wrapper));
    }

    public CounselorTalk detail(Long id) {
        CounselorTalk talk = counselorTalkMapper.selectById(id);
        if (talk == null) {
            throw CounselorTalkErrorCode.COUNSELOR_TALK_NOT_FOUND.exception();
        }
        return talk;
    }
}
