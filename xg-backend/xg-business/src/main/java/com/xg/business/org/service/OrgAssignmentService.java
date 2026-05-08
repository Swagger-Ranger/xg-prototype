package com.xg.business.org.service;

import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.xg.business.org.dto.AssignableUser;
import com.xg.business.org.dto.CounselorMappingRequest;
import com.xg.business.org.dto.CounselorMappingView;
import com.xg.business.org.dto.OrgTreeNode;
import com.xg.business.org.mapper.OrgAssignmentMapper;
import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;
import com.xg.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 组织派班 service：班主任（org_unit.leader_id）+ 辅导员（counselor_org_mapping）。
 *
 * <p>每次写操作都做角色校验：
 * <ul>
 *   <li>设班主任前确认目标用户拥有 {@code class_master} 角色</li>
 *   <li>加辅导员映射前确认目标用户拥有 {@code counselor} 角色</li>
 * </ul>
 * 否则前端就能给任何用户挂任意角色，绕过用户管理的角色控制。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrgAssignmentService {

    private static final String ROLE_CLASS_MASTER = "class_master";
    private static final String ROLE_COUNSELOR = "counselor";

    private final OrgAssignmentMapper mapper;

    /** 获取整棵组织树，含 leader 和辅导员映射。 */
    public List<OrgTreeNode> getTree() {
        List<Map<String, Object>> rows = mapper.listOrgUnits();
        List<Map<String, Object>> mappingRows = mapper.listAllMappings();

        // 按 org_id 分组辅导员映射，组装到树节点上。
        Map<Long, List<CounselorMappingView>> byOrg = new HashMap<>();
        for (Map<String, Object> m : mappingRows) {
            CounselorMappingView v = toMappingView(m);
            byOrg.computeIfAbsent(v.getOrgId(), k -> new ArrayList<>()).add(v);
        }

        List<OrgTreeNode> nodes = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            OrgTreeNode n = new OrgTreeNode();
            n.setId(asLong(row.get("id")));
            n.setParentId(asLong(row.get("parent_id")));
            n.setName(asString(row.get("name")));
            n.setType(asString(row.get("type")));
            n.setSortOrder(asInt(row.get("sort_order")));
            n.setLeaderId(asLong(row.get("leader_id")));
            n.setLeaderName(asString(row.get("leader_name")));
            n.setCounselors(byOrg.getOrDefault(n.getId(), new ArrayList<>()));
            nodes.add(n);
        }
        return nodes;
    }

    public List<AssignableUser> listClassMasters() {
        return listUsers(ROLE_CLASS_MASTER);
    }

    public List<AssignableUser> listCounselors() {
        return listUsers(ROLE_COUNSELOR);
    }

    private List<AssignableUser> listUsers(String roleCode) {
        List<Map<String, Object>> rows = mapper.listUsersByRoleCode(roleCode);
        List<AssignableUser> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            AssignableUser u = new AssignableUser();
            u.setId(asLong(r.get("id")));
            u.setRealName(asString(r.get("real_name")));
            u.setUsername(asString(r.get("username")));
            out.add(u);
        }
        return out;
    }

    /** 设/清班主任。leaderId=null 即清空。 */
    @Transactional
    public void updateLeader(Long classId, Long leaderId) {
        if (leaderId != null && mapper.countUserWithRole(leaderId, ROLE_CLASS_MASTER) == 0) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "目标用户没有「班主任」角色，请先到用户管理给该用户挂上角色");
        }
        int affected = mapper.updateLeader(classId, leaderId);
        if (affected == 0) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(), "未找到该班级（可能已被删除或非 class 类型）");
        }
    }

    @Transactional
    public CounselorMappingView createMapping(CounselorMappingRequest req, Long createdBy) {
        if (mapper.countUserWithRole(req.getCounselorId(), ROLE_COUNSELOR) == 0) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "目标用户没有「辅导员」角色，请先到用户管理给该用户挂上角色");
        }
        if (mapper.countByCounselorAndOrg(req.getCounselorId(), req.getOrgId()) > 0) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "该辅导员已经挂在此组织上，不要重复添加");
        }
        Boolean isPrimary = Boolean.TRUE.equals(req.getIsPrimary());
        long id = IdWorker.getId();
        try {
            mapper.insertMapping(
                    id,
                    TenantContext.getRequiredTenantId(),
                    req.getCounselorId(),
                    req.getOrgId(),
                    isPrimary,
                    createdBy);
        } catch (DuplicateKeyException dup) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(), "该辅导员已经挂在此组织上");
        }
        // 重读单条映射以拿到 counselor_name / org_name 等 JOIN 字段。
        List<Map<String, Object>> rows = mapper.listMappingsByOrg(req.getOrgId());
        for (Map<String, Object> r : rows) {
            if (asLong(r.get("counselor_id")).equals(req.getCounselorId())) {
                return toMappingView(r);
            }
        }
        // 兜底（理论不会触发）
        CounselorMappingView v = new CounselorMappingView();
        v.setCounselorId(req.getCounselorId());
        v.setOrgId(req.getOrgId());
        v.setIsPrimary(isPrimary);
        return v;
    }

    public void updateMappingPrimary(Long id, Boolean isPrimary) {
        int affected = mapper.updateMappingPrimary(id, Boolean.TRUE.equals(isPrimary));
        if (affected == 0) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(), "未找到该辅导员映射");
        }
    }

    public void deleteMapping(Long id) {
        int affected = mapper.deleteMapping(id);
        if (affected == 0) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(), "未找到该辅导员映射");
        }
    }

    // ---------- helpers ----------

    private static CounselorMappingView toMappingView(Map<String, Object> m) {
        CounselorMappingView v = new CounselorMappingView();
        v.setId(asLong(m.get("id")));
        v.setCounselorId(asLong(m.get("counselor_id")));
        v.setCounselorName(asString(m.get("counselor_name")));
        v.setOrgId(asLong(m.get("org_id")));
        v.setOrgName(asString(m.get("org_name")));
        v.setOrgType(asString(m.get("org_type")));
        Object p = m.get("is_primary");
        v.setIsPrimary(p instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(p)));
        return v;
    }

    private static Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Long l) return l;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString());
    }

    private static Integer asInt(Object o) {
        if (o == null) return null;
        if (o instanceof Integer i) return i;
        if (o instanceof Number n) return n.intValue();
        return Integer.parseInt(o.toString());
    }

    private static String asString(Object o) {
        return o == null ? null : o.toString();
    }
}
