package com.xg.business.leave.service;

import com.xg.business.leave.mapper.LeaveTypeConfigMapper;
import com.xg.business.leave.model.LeaveTypeConfig;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/**
 * 假别元信息 service。Phase D 后直接读 {@code leave_type_config} 表,不再
 * 经 {@code leave_config_base} JSONB 中转。原名 LeaveConfigBaseService 沿
 * 用,避免大量调用方改 import;语义上现在专做"列假别 / 找单个假别 / 改
 * extraFields"三件事。
 *
 * <p>请假规则的发布/版本/审批链相关读写已**全部**迁到 workflow_definition,
 * 由 WorkflowConfigController + AI 助手 wizard tool 维护。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaveConfigBaseService {

    private final LeaveTypeConfigMapper leaveTypeMapper;

    /** 列出所有 enabled 的假别,按 sortOrder 升序。 */
    public List<LeaveTypeConfig> listEnabledLeaveTypes() {
        return leaveTypeMapper.listAll().stream()
                .filter(t -> Boolean.TRUE.equals(t.getEnabled()))
                .sorted(Comparator.comparing(t -> t.getSortOrder() == null ? Integer.MAX_VALUE : t.getSortOrder()))
                .toList();
    }

    /** 列出所有假别(含已停用),按 sortOrder 升序。仅管理端用,学生端始终走 listEnabled。 */
    public List<LeaveTypeConfig> listAllLeaveTypes() {
        return leaveTypeMapper.listAll().stream()
                .sorted(Comparator.comparing(t -> t.getSortOrder() == null ? Integer.MAX_VALUE : t.getSortOrder()))
                .toList();
    }

    /** 按 code 找假别(不管 enabled),不存在抛 NOT_FOUND。 */
    public LeaveTypeConfig findLeaveType(String code) {
        LeaveTypeConfig t = leaveTypeMapper.findByCode(code);
        if (t == null) {
            throw new BizException("NOT_FOUND", "假别不存在: " + code);
        }
        return t;
    }

    /** 按 code 找 enabled 的假别,disabled 抛错。 */
    public LeaveTypeConfig findEnabledLeaveType(String code) {
        LeaveTypeConfig t = findLeaveType(code);
        if (!Boolean.TRUE.equals(t.getEnabled())) {
            throw new BizException("LEAVE_TYPE_DISABLED", "假别已停用: " + code);
        }
        return t;
    }

    /**
     * 改某假别的 extraFields(动态表单字段定义,legacy array JSON 形态供
     * LeaveTypeFieldTranslator 使用)。
     */
    @Transactional
    public LeaveTypeConfig updateLeaveTypeExtraFields(String code, String extraFieldsArrayJson, Long operatorId) {
        // 触发存在性校验
        findLeaveType(code);
        int affected = leaveTypeMapper.updateExtraFields(code, extraFieldsArrayJson, operatorId);
        if (affected == 0) {
            throw new BizException("NOT_FOUND", "假别不存在或已删除: " + code);
        }
        return findLeaveType(code);
    }

    /**
     * 改某假别的「本学期累计上限」(天数)。null = 不限。
     * AI 助手 set_term_cap op 和 Web 配置页都走这个入口。
     */
    @Transactional
    public LeaveTypeConfig updateTermMaxDays(String code, java.math.BigDecimal termMaxDays, Long operatorId) {
        findLeaveType(code);
        if (termMaxDays != null) {
            if (termMaxDays.signum() <= 0) {
                throw new BizException("INVALID_TERM_MAX", "学期累计上限必须为正数");
            }
            if (termMaxDays.compareTo(java.math.BigDecimal.valueOf(365)) > 0) {
                throw new BizException("INVALID_TERM_MAX", "学期累计上限不应超过 365 天");
            }
        }
        int affected = leaveTypeMapper.updateTermMaxDays(code, termMaxDays, operatorId);
        if (affected == 0) {
            throw new BizException("NOT_FOUND", "假别不存在或已删除: " + code);
        }
        return findLeaveType(code);
    }

    /**
     * 翻 enabled 开关。停用 → 学生端 listEnabled 拿不到,提交时找不到对应假别;
     * YAML 工作流不动,管理端 summary 卡仍渲染(用 enabled=false 加灰显/已停用 tag)。
     */
    @Transactional
    public LeaveTypeConfig setEnabled(String code, boolean enabled, Long operatorId) {
        findLeaveType(code);
        int affected = leaveTypeMapper.updateEnabled(code, enabled, operatorId);
        if (affected == 0) {
            throw new BizException("NOT_FOUND", "假别不存在或已删除: " + code);
        }
        return findLeaveType(code);
    }
}
