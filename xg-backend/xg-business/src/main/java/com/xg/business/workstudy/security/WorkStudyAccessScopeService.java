package com.xg.business.workstudy.security;

import cn.dev33.satoken.stp.StpUtil;
import com.xg.business.workstudy.service.EmployerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 勤工助学「能看谁、能管谁」的归属判定收口点(RBAC 落地方案 §7)。
 *
 * <p>勤工助学的可见范围分两类:学工处 / 校管理员跨单位看全部;用人单位 leader/operator
 * 只看本单位。原先这套判断散在各 controller 分支里,新增 endpoint 容易漏。本 service
 * 把判定集中,谁要做单位级 scope 判断都从这里走。
 *
 * <p>当前只承载关闭 {@code listStaff} 越权所需的两个方法。listApplications /
 * offboard 已各自有安全的 scope 实现(listApplicationsScopedToEmployers /
 * assertCanOperatePosition),不在本次重构搬动 —— 这些是 PII 敏感且无集成测试基建的
 * 路径,贸然搬迁是回归风险(项目约定:不重构没坏的东西)。后续 endpoint 迁移时再把
 * 对应判定逐个收进来。
 */
@Service
@RequiredArgsConstructor
public class WorkStudyAccessScopeService {

    private final EmployerService employerService;

    /**
     * 是否学工处 / 校管理员(可跨单位)。判定基准是功能权限码
     * {@code workstudy:employer:manage}(仅 school_admin 系默认含),与 WorkStudyController
     * 既有的 {@code bypassOwnership} 口径一致,不另起一套角色名单。
     *
     * <p><b>必须在 Web 请求线程内调用</b>:依赖 Sa-Token ThreadLocal,不能从
     * 定时任务 / 异步线程调(那里 {@code StpUtil.hasPermission} 会抛异常而非返回 false)。
     */
    public boolean isSchoolWorkStudyAdmin() {
        return StpUtil.hasPermission("workstudy:employer:manage");
    }

    /**
     * 能否查看某用人单位的成员名单:管理员看全部;否则必须是该单位的 leader/operator。
     * 其余(含学生、外单位 employer)一律 false,由 controller 转 403。
     */
    public boolean canViewEmployerStaff(Long userId, Long employerId) {
        if (isSchoolWorkStudyAdmin()) {
            return true;
        }
        return employerService.isUserOperatorOrLeader(employerId, userId);
    }
}
