package com.xg.business.workstudy.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * 面试通知发起 payload。
 *
 * <p>{@code body} 是即将发给学生的通知正文（可能由 AI 起草、用户编辑后提交），透传给
 * Orchestrator 的 {@code {{body}}} 占位符。{@code interview_notes} 是 employer 端
 * 内部备注，仅写入 application 表，不发送给学生。
 */
@Getter
@Setter
public class ScheduleInterviewRequest {

    @NotNull
    private OffsetDateTime interviewAt;

    @NotBlank
    @Size(max = 200)
    private String interviewLocation;

    @Size(max = 2000)
    private String interviewNotes;

    /** 发给学生的通知正文（AI 起草后可编辑）。 */
    @NotBlank
    @Size(max = 4000)
    private String body;
}
