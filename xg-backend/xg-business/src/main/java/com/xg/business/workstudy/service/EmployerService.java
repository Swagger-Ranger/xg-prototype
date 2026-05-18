package com.xg.business.workstudy.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.workstudy.dto.EmployerCreateRequest;
import com.xg.business.workstudy.dto.EmployerQueryRequest;
import com.xg.business.workstudy.dto.EmployerSelfUpdateRequest;
import com.xg.business.workstudy.dto.EmployerStaffItem;
import com.xg.business.workstudy.dto.EmployerUpdateRequest;
import com.xg.business.workstudy.mapper.EmployerMapper;
import com.xg.business.workstudy.model.Employer;
import com.xg.common.base.PageResult;
import com.xg.common.exception.BizException;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.model.SysUser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmployerService {

    private final EmployerMapper employerMapper;
    private final ObjectMapper objectMapper;
    private final SysUserMapper sysUserMapper;

    @Transactional
    public Employer create(EmployerCreateRequest req) {
        Employer e = new Employer();
        e.setName(req.getName());
        e.setLeaderUserId(req.getLeaderUserId());
        e.setOperatorUserIds(toJson(req.getOperatorUserIds()));
        e.setContactName(req.getContactName());
        e.setContactPhone(req.getContactPhone());
        e.setEmail(req.getEmail());
        e.setStatus("active");
        e.setAllowSelfArrange(Boolean.TRUE.equals(req.getAllowSelfArrange()));
        e.setMonthlySalaryCap(req.getMonthlySalaryCap());
        e.setRemark(req.getRemark());
        employerMapper.insert(e);
        return e;
    }

    @Transactional
    public Employer update(Long id, EmployerUpdateRequest req) {
        Employer e = detail(id);
        if (req.getName() != null) e.setName(req.getName());
        if (req.getLeaderUserId() != null) e.setLeaderUserId(req.getLeaderUserId());
        if (req.getOperatorUserIds() != null) e.setOperatorUserIds(toJson(req.getOperatorUserIds()));
        if (req.getContactName() != null) e.setContactName(req.getContactName());
        if (req.getContactPhone() != null) e.setContactPhone(req.getContactPhone());
        if (req.getEmail() != null) e.setEmail(req.getEmail());
        if (req.getAllowSelfArrange() != null) e.setAllowSelfArrange(req.getAllowSelfArrange());
        if (req.getMonthlySalaryCap() != null) e.setMonthlySalaryCap(req.getMonthlySalaryCap());
        if (req.getRemark() != null) e.setRemark(req.getRemark());
        employerMapper.updateById(e);
        return e;
    }

    @Transactional
    public void setStatus(Long id, String status) {
        if (!"active".equals(status) && !"disabled".equals(status)) {
            throw new BizException("INVALID_STATUS", "状态只能是 active / disabled");
        }
        Employer e = detail(id);
        e.setStatus(status);
        employerMapper.updateById(e);
    }

    public Employer detail(Long id) {
        Employer e = employerMapper.selectById(id);
        if (e == null) throw new BizException("EMPLOYER_NOT_FOUND", "用人单位不存在");
        return e;
    }

    public PageResult<Employer> list(EmployerQueryRequest q) {
        Page<Employer> page = q.toPage();
        LambdaQueryWrapper<Employer> wrapper = new LambdaQueryWrapper<Employer>()
                .like(q.getKeyword() != null && !q.getKeyword().isBlank(), Employer::getName, q.getKeyword())
                .eq(q.getStatus() != null, Employer::getStatus, q.getStatus())
                .eq(q.getLeaderUserId() != null, Employer::getLeaderUserId, q.getLeaderUserId())
                .orderByDesc(Employer::getCreatedAt);
        return PageResult.of(employerMapper.selectPage(page, wrapper));
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize employer field: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 列出当前 user 作为 leader 或 operator 的 active 用人单位。常见是 1 家，理论上可多家。
     *
     * <p>过滤下推到 PG:
     * <ul>
     *   <li>leader_user_id = userId — 直接命中</li>
     *   <li>operator_user_ids JSONB 历史上既有 number 数组也有 string 数组,两种都用 @> 容纳</li>
     * </ul>
     * 早期实现是全表 SELECT * 再 Java 内存 filter,租户单位数上百时每次 listSalaries /
     * listApplications 都全表扫,改 SQL 下推后是普通索引 / GIN 命中,无 N 行 jsonb 反序列化。
     */
    public List<Employer> listMine(Long userId) {
        if (userId == null) return List.of();
        LambdaQueryWrapper<Employer> wrapper = new LambdaQueryWrapper<Employer>()
                .eq(Employer::getStatus, "active")
                .and(w -> w
                        .eq(Employer::getLeaderUserId, userId)
                        .or().apply("operator_user_ids::jsonb @> to_jsonb({0}::bigint)", userId)
                        .or().apply("operator_user_ids::jsonb @> to_jsonb({0}::text)", userId.toString()));
        return employerMapper.selectList(wrapper);
    }

    /**
     * Employer 自服务修改：仅 contactName / contactPhone / email / remark；其余字段须走 admin 接口。
     * 校验 userId 必须是该单位的 leader 或 operator，且单位 status='active'。
     */
    @Transactional
    public Employer selfUpdate(Long id, Long userId, EmployerSelfUpdateRequest req) {
        Employer e = detail(id);
        if (!"active".equals(e.getStatus())) {
            throw new BizException("EMPLOYER_DISABLED", "用人单位已被禁用，无法修改");
        }
        if (!isUserOperatorOrLeader(id, userId)) {
            throw new BizException("FORBIDDEN", "你不是该用人单位的负责人或操作员");
        }
        if (req.getContactName() != null) e.setContactName(req.getContactName());
        if (req.getContactPhone() != null) e.setContactPhone(req.getContactPhone());
        if (req.getEmail() != null) e.setEmail(req.getEmail());
        if (req.getRemark() != null) e.setRemark(req.getRemark());
        employerMapper.updateById(e);
        return e;
    }

    /**
     * userId 是否是该用人单位的负责人或操作员。归属判断的核心 helper —
     * Position 创建 / owner 指定 / 单位自服务等场景调用。
     * operator_user_ids JSONB 可能存 number 数组也可能存 string 数组（前端历史），都兼容。
     */
    public boolean isUserOperatorOrLeader(Long employerId, Long userId) {
        if (employerId == null || userId == null) return false;
        Employer e = employerMapper.selectById(employerId);
        if (e == null) return false;
        if (userId.equals(e.getLeaderUserId())) return true;
        return parseOperatorIds(e.getOperatorUserIds()).contains(userId);
    }

    /**
     * 列出该用人单位「可被指定为岗位负责人」的人：leader + 全部 operators。
     * 用于发布岗位时的「岗位负责人」下拉，避免用户手填 user_id。
     * 顺序：leader 在前，operators 按 operator_user_ids 配置时的数组顺序。已被禁用 / 已删除的 sys_user 自动过滤。
     */
    public List<EmployerStaffItem> listStaff(Long employerId) {
        Employer e = detail(employerId);
        LinkedHashSet<Long> orderedIds = new LinkedHashSet<>();
        if (e.getLeaderUserId() != null) orderedIds.add(e.getLeaderUserId());
        orderedIds.addAll(parseOperatorIds(e.getOperatorUserIds()));
        if (orderedIds.isEmpty()) return List.of();

        List<SysUser> users = sysUserMapper.selectBatchIds(orderedIds);
        Map<Long, SysUser> byId = users.stream().collect(Collectors.toMap(SysUser::getId, Function.identity()));

        List<EmployerStaffItem> out = new ArrayList<>(orderedIds.size());
        for (Long uid : orderedIds) {
            SysUser u = byId.get(uid);
            if (u == null || !"active".equals(u.getStatus())) continue;
            String name = (u.getRealName() != null && !u.getRealName().isBlank()) ? u.getRealName() : u.getUsername();
            String role = uid.equals(e.getLeaderUserId()) ? "leader" : "operator";
            out.add(new EmployerStaffItem(uid, name, role));
        }
        return out;
    }

    /**
     * 解析 operator_user_ids JSONB 列（支持 number 数组 / string 数组，前端历史两种都有）。
     * <p><b>顺序契约：必须返回保序集合（LinkedHashSet），{@link #listStaff} 的下拉渲染
     * 依赖原始 JSON 数组顺序。</b>如果改回 HashSet，EmployerServiceTest 在小 Long ID 下
     * 可能因桶顺序刚好正确而 silent pass，但生产环境的 operator 顺序会乱。改前先看测试。
     */
    private Set<Long> parseOperatorIds(String json) {
        if (json == null || json.isBlank()) return Set.of();
        try {
            List<Object> raw = objectMapper.readValue(json, new TypeReference<List<Object>>() {});
            return raw.stream().map(EmployerService::toLong).filter(java.util.Objects::nonNull)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
        } catch (Exception ex) {
            log.warn("Failed to parse employer.operator_user_ids: {}", ex.getMessage());
            return Set.of();
        }
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        if (v instanceof String s) {
            try { return Long.valueOf(s.trim()); } catch (NumberFormatException ex) { return null; }
        }
        return null;
    }
}
