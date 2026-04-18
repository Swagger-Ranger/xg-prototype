package com.xg.business.complaint.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.business.complaint.dto.ComplaintFeedbackRequest;
import com.xg.business.complaint.dto.ComplaintQueryRequest;
import com.xg.business.complaint.dto.ReplyComplaintRequest;
import com.xg.business.complaint.dto.SubmitComplaintRequest;
import com.xg.business.complaint.mapper.ComplaintMapper;
import com.xg.business.complaint.model.Complaint;
import com.xg.common.base.PageResult;
import com.xg.platform.event.StudentEventPublisher;
import com.xg.platform.event.StudentEventType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ComplaintService {

    private final ComplaintMapper complaintMapper;
    private final StudentEventPublisher studentEventPublisher;

    @Transactional
    public Complaint submit(SubmitComplaintRequest req, Long studentId, String studentName) {
        Complaint complaint = new Complaint();
        complaint.setTitle(req.getTitle());
        complaint.setCategory(req.getCategory());
        complaint.setContent(req.getContent());
        boolean anonymous = Boolean.TRUE.equals(req.getAnonymous());
        complaint.setAnonymous(anonymous);
        complaint.setStatus("pending");
        complaint.setStudentId(studentId);
        complaint.setStudentName(studentName);
        complaintMapper.insert(complaint);
        studentEventPublisher.publish(studentId, StudentEventType.COMPLAINT_SUBMITTED, "complaint",
                Map.of(
                        "complaint_category", req.getCategory() == null ? "" : req.getCategory(),
                        "is_anonymous", anonymous,
                        "complaint_id", complaint.getId()
                ));
        return complaint;
    }

    public PageResult<Complaint> myComplaints(Long studentId, ComplaintQueryRequest query) {
        Page<Complaint> page = query.toPage();
        LambdaQueryWrapper<Complaint> wrapper = new LambdaQueryWrapper<Complaint>()
                .eq(Complaint::getStudentId, studentId)
                .eq(query.getStatus() != null, Complaint::getStatus, query.getStatus())
                .eq(query.getCategory() != null, Complaint::getCategory, query.getCategory())
                .orderByDesc(Complaint::getCreatedAt);
        return PageResult.of(complaintMapper.selectPage(page, wrapper));
    }

    public PageResult<Complaint> listAll(ComplaintQueryRequest query) {
        Page<Complaint> page = query.toPage();
        LambdaQueryWrapper<Complaint> wrapper = new LambdaQueryWrapper<Complaint>()
                .eq(query.getStatus() != null, Complaint::getStatus, query.getStatus())
                .eq(query.getCategory() != null, Complaint::getCategory, query.getCategory())
                .orderByDesc(Complaint::getCreatedAt);
        return PageResult.of(complaintMapper.selectPage(page, wrapper));
    }

    @Transactional
    public void reply(Long id, ReplyComplaintRequest req, Long handlerId, String handlerName) {
        Complaint complaint = requireExisting(id);
        if ("replied".equals(complaint.getStatus()) || "closed".equals(complaint.getStatus())) {
            throw ComplaintErrorCode.COMPLAINT_ALREADY_REPLIED.exception();
        }
        complaint.setReplyContent(req.getReplyContent());
        complaint.setReplyAt(OffsetDateTime.now());
        complaint.setHandlerId(handlerId);
        complaint.setHandlerName(handlerName);
        complaint.setStatus("replied");
        complaintMapper.updateById(complaint);
    }

    @Transactional
    public void feedback(Long id, ComplaintFeedbackRequest req, Long studentId) {
        Complaint complaint = requireExisting(id);
        if (!studentId.equals(complaint.getStudentId())) {
            throw ComplaintErrorCode.COMPLAINT_NOT_FOUND.exception();
        }
        if (!"replied".equals(complaint.getStatus())) {
            throw ComplaintErrorCode.COMPLAINT_NOT_REPLIED.exception();
        }
        if (complaint.getSatisfaction() != null) {
            throw ComplaintErrorCode.COMPLAINT_ALREADY_RATED.exception();
        }
        complaint.setSatisfaction(req.getSatisfaction());
        complaint.setStatus("closed");
        complaintMapper.updateById(complaint);
    }

    private Complaint requireExisting(Long id) {
        Complaint complaint = complaintMapper.selectById(id);
        if (complaint == null) {
            throw ComplaintErrorCode.COMPLAINT_NOT_FOUND.exception();
        }
        return complaint;
    }
}
