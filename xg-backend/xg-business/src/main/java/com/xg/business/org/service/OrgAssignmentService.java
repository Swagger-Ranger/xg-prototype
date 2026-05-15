package com.xg.business.org.service;

import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.xg.business.org.dto.AiLeaderSuggestRequest;
import com.xg.business.org.dto.AiLeaderSuggestion;
import com.xg.business.org.dto.AssignableUser;
import com.xg.business.org.dto.BatchLeaderApplyRequest;
import com.xg.business.org.dto.CounselorMappingRequest;
import com.xg.business.org.dto.CounselorMappingView;
import com.xg.business.org.dto.CreateOrgRequest;
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

    /**
     * 新建组织节点(P0 UI 只用 college 顶层;支持 class / admin_dept 是给后续扩展留口子)。
     *
     * <p>校验:
     * <ul>
     *   <li>name 不能跟同 parent 下现有节点重名</li>
     *   <li>parentId 非空时必须存在</li>
     *   <li>class 必须有 parentId 且 parent 必须是 college</li>
     *   <li>college / admin_dept 通常顶层(parentId=null),但允许嵌套</li>
     * </ul>
     */
    @Transactional
    public Long createOrg(CreateOrgRequest req) {
        String name = req.getName().trim();
        String type = req.getType();
        Long parentId = req.getParentId();
        String tenantId = TenantContext.getRequiredTenantId();

        // parent 校验
        if (parentId != null) {
            String parentType = mapper.findOrgType(parentId, tenantId);
            if (parentType == null) {
                throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                        "上级节点不存在:" + parentId);
            }
            if ("class".equals(type) && !"college".equals(parentType)) {
                throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                        "class 节点的上级必须是 college");
            }
        } else if ("class".equals(type)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "class 节点必须挂在某个 college 下");
        }

        // 同 parent 下重名拒绝
        if (mapper.countByNameAndParent(name, parentId, tenantId) > 0) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "同级下已存在名为「" + name + "」的节点");
        }

        long id = IdWorker.getId();
        String code = (req.getCode() == null || req.getCode().isBlank()) ? null : req.getCode().trim();

        mapper.insertOrgUnit(id, tenantId, parentId, name, code, type, 0);
        if (parentId != null) {
            mapper.insertOrgClosure(id, parentId);
        } else {
            mapper.insertOrgClosureSelf(id);
        }
        log.info("Created org_unit id={} type={} parent={} name={}", id, type, parentId, name);
        return id;
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

    // ---------- AI 派班（班主任补缺） ----------

    private static final String SCOPE_MISSING_GLOBAL = "missing_leader_global";
    private static final String SCOPE_MISSING_COLLEGE = "missing_leader_college";

    /**
     * 给 scope 内每个缺班主任的班级推荐一名候选 class_master。
     *
     * <p>算法：贪心负载均衡。候选池 = 全部 class_master 角色用户，初始 load = 该用户当前
     * 已是几个班的 leader_id。按 (load asc, id asc) 选最低者，选完把 load+1 再迭代下一班。
     * 这样推荐的方案天然均衡：3 个候选 vs 6 个班 → 每人各分 2 个，而不是某个人吃 6 个。
     */
    public List<AiLeaderSuggestion> aiSuggestLeaders(AiLeaderSuggestRequest req) {
        Long collegeId = resolveCollegeScope(req);

        List<Map<String, Object>> classes = mapper.listClassesMissingLeader(collegeId);
        if (classes.isEmpty()) {
            return new ArrayList<>();
        }

        List<Map<String, Object>> candidatesRaw = mapper.listCandidatesWithLeaderLoad(ROLE_CLASS_MASTER);

        List<AiLeaderSuggestion> out = new ArrayList<>(classes.size());
        if (candidatesRaw.isEmpty()) {
            // 没人有 class_master 角色，照样把缺人班级返回，让前端能看到全貌。
            for (Map<String, Object> c : classes) {
                AiLeaderSuggestion s = new AiLeaderSuggestion();
                s.setClassId(asLong(c.get("id")));
                s.setClassName(asString(c.get("name")));
                s.setReason("无可派人选：当前没有任何用户拥有「班主任」角色，请先到用户管理给老师挂上角色");
                out.add(s);
            }
            return out;
        }

        // 候选池转成可变结构，模拟"分配后 load+1"的状态。Mapper 已按 (load asc, id asc) 排过。
        List<long[]> candidatePool = new ArrayList<>(candidatesRaw.size());
        Map<Long, String> nameById = new HashMap<>();
        for (Map<String, Object> r : candidatesRaw) {
            long id = asLong(r.get("id"));
            long load = asLong(r.get("load"));
            candidatePool.add(new long[]{id, load});
            nameById.put(id, asString(r.get("real_name")));
        }

        for (Map<String, Object> c : classes) {
            // 在剩余候选里挑 load 最低的（id 升序 tiebreak）。
            int pickIdx = 0;
            long[] pick = candidatePool.get(0);
            for (int i = 1; i < candidatePool.size(); i++) {
                long[] cand = candidatePool.get(i);
                if (cand[1] < pick[1] || (cand[1] == pick[1] && cand[0] < pick[0])) {
                    pick = cand;
                    pickIdx = i;
                }
            }

            AiLeaderSuggestion s = new AiLeaderSuggestion();
            s.setClassId(asLong(c.get("id")));
            s.setClassName(asString(c.get("name")));
            s.setRecommendedLeaderId(pick[0]);
            s.setRecommendedLeaderName(nameById.get(pick[0]));
            s.setReason(buildReason(pick[1]));
            out.add(s);

            // 模拟分配：让该候选 load+1，下一班就轮其他人。
            candidatePool.set(pickIdx, new long[]{pick[0], pick[1] + 1});
        }

        return out;
    }

    /**
     * 批量设置班主任。整批一个事务，任一条失败整体回滚（前端拿到错误后整张推荐表
     * 状态都不变，避免"半成功"留烂账）。
     */
    @Transactional
    public void batchApplyLeaders(BatchLeaderApplyRequest req) {
        if (req == null || req.getItems() == null || req.getItems().isEmpty()) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(), "未选择任何要应用的班级");
        }
        for (BatchLeaderApplyRequest.Item item : req.getItems()) {
            if (item.getClassId() == null || item.getLeaderId() == null) {
                throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(), "批量派班不允许 classId / leaderId 为空");
            }
            // 复用单条 updateLeader 的角色校验 + not-found 检查；任一抛出会触发事务回滚。
            updateLeader(item.getClassId(), item.getLeaderId());
        }
    }

    private Long resolveCollegeScope(AiLeaderSuggestRequest req) {
        String scope = req == null ? null : req.getScope();
        if (SCOPE_MISSING_GLOBAL.equals(scope)) {
            return null;
        }
        if (SCOPE_MISSING_COLLEGE.equals(scope)) {
            if (req.getCollegeId() == null) {
                throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                        "选定学院范围时必须提供 collegeId");
            }
            return req.getCollegeId();
        }
        throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                "未知的派班范围：" + scope);
    }

    private static String buildReason(long currentLoad) {
        if (currentLoad == 0) {
            return "尚未带班，负载最低";
        }
        return "当前带 " + currentLoad + " 个班，候选中负载最低";
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
