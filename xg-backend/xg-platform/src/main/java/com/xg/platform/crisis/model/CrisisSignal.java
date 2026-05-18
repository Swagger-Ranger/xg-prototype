package com.xg.platform.crisis.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/**
 * 危机求助快速通道线索（P1 例外，并行通道，<b>不进 care 规则引擎</b>）。
 *
 * <p>设计见 {@code 危机求助快速通道-设计方案.md} §4.2 / PRD §9.5。脚手架阶段
 * <b>默认关闭</b>（{@code xg.crisis.enabled=false}），D1/D2/D3 未拍板前不激活。
 *
 * <p>隐私铁律（设计 §5）：本表<b>不存学生原话</b>，只存稳定 {@code messageId} +
 * 命中词表版本。状态仅 {@code pending}/{@code closed} 两态（ack 多态属 backlog）。
 */
@Getter
@Setter
@TableName(value = "crisis_signal", autoResultMap = true)
public class CrisisSignal {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    @TableField("tenant_id")
    private String tenantId;

    /** 受害学生；由 Java 重校验已认证 token 解析，不信 xg-ai 自报（设计 §4.1）。 */
    @TableField("student_id")
    private Long studentId;

    /** xg-ai 每条入站消息生成的稳定 id；幂等键之一；不要求该消息被持久化。 */
    @TableField("message_id")
    private String messageId;

    /** 命中时词表版本，复核/回溯用；不存原文。 */
    @TableField("rule_version")
    private String ruleVersion;

    /** 命中类别：safety / basic_needs。临床分类桶，给辅导员电话前分诊；非学生原话（设计 §5）。 */
    @TableField("category")
    private String category;

    /** pending / closed（v1 只这两态）。 */
    private String status;

    @TableField("created_at")
    private OffsetDateTime createdAt;

    /** 首次通知成功时间；null=尚未成功通知（用于 send 返回 null 的歧义消解，设计 §4.3）。 */
    @TableField("first_notified_at")
    private OffsetDateTime firstNotifiedAt;

    /** sent / failed；null=未发。 */
    @TableField("notify_status")
    private String notifyStatus;

    @TableField("handled_at")
    private OffsetDateTime handledAt;

    /** 关闭人（已认证身份，非传参）。 */
    @TableField("handled_by")
    private Long handledBy;
}
