package com.xg.platform.system.service;

import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.auth.RolePermissionDefaults;
import com.xg.platform.system.dto.CreateRoleRequest;
import com.xg.platform.system.dto.GrantRolePermsRequest;
import com.xg.platform.system.dto.PermissionItem;
import com.xg.platform.system.dto.RoleDetailView;
import com.xg.platform.system.dto.RoleSummary;
import com.xg.platform.system.dto.UpdateRoleRequest;
import com.xg.platform.system.mapper.RolePermissionAdminMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 「角色权限」/「团队管理」管理 service。
 *
 * <h3>权限模型</h3>
 * <pre>
 *   effective(role) = DEFAULTS[role.code] ∪ sys_role_permission rows
 *   ↑ 代码硬编码     ↑ DB 里"加项 override"，本 service 维护
 *
 *   不支持"减默认"。要从某角色拿掉默认权限只能去改 RolePermissionDefaults.java。
 *   理由:UI 误操作让全平台学生都失去 leave:submit,比"加错权限"危险大得多。
 * </pre>
 *
 * <h3>kind 边界</h3>
 * <ul>
 *   <li>kind='role':传统角色,关注权限码,有 DEFAULTS 概念</li>
 *   <li>kind='team':业务编组,通常不挂 DEFAULTS(从空集起算),关注 teamType/dates/archived</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RolePermissionAdminService {

    private final RolePermissionAdminMapper mapper;

    /** kind 入参白名单 — 防止外部传任意字符串落到 SQL（虽 #{} 安全但语义脏）。 */
    private static final Set<String> VALID_KINDS = Set.of("role", "team");

    /** team_type 白名单 — 跟 DB CHECK 约束（sys_role_team_type_check）保持一致，避免裸 PG 异常。 */
    private static final Set<String> VALID_TEAM_TYPES =
            Set.of("review", "temporary", "cross_dept", "student_org", "other");

    /**
     * 列角色 / 团队列表 + effective 权限数 + memberCount。
     *
     * @param kind     'role' / 'team' / null(全部)
     * @param archived 仅 kind='team' 用:true 只看已归档,false 只看未归档,null 全部
     * @param keyword  name 模糊匹配
     */
    public List<RoleSummary> listRoles(String kind, Boolean archived, String keyword) {
        if (kind != null && !VALID_KINDS.contains(kind)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "kind 只能是 'role' 或 'team'");
        }
        List<Map<String, Object>> rows = mapper.listRoles(kind, archived, keyword);
        int totalPermCount = mapper.listAllPermissions().size();

        List<RoleSummary> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            String code = asString(r.get("code"));
            Set<String> defaults = RolePermissionDefaults.defaultsOf(code);

            RoleSummary s = mapRowToSummary(r);
            s.setOverridePermCount(asInt(r.get("db_perm_count")));
            s.setMemberCount(asInt(r.get("member_count")));

            if (defaults.contains(RolePermissionDefaults.WILDCARD)) {
                // super_admin:DEFAULTS = {"*"},effective = 全部
                s.setEffectivePermCount(totalPermCount);
            } else {
                // DEFAULTS ∪ DB 去重后取大小
                Set<String> effective = new HashSet<>(defaults);
                List<String> dbCodes = mapper.findOverridePermCodes(s.getId());
                effective.addAll(dbCodes);
                s.setEffectivePermCount(effective.size());
            }
            out.add(s);
        }
        return out;
    }

    /** 兼容旧调用:不带过滤,列全部 role+team(给老的 listRoles 端点用)。 */
    public List<RoleSummary> listRoles() {
        return listRoles(null, null, null);
    }

    /** 单角色详情:每个权限码标 source(default/override/null) + granted。 */
    public RoleDetailView getRoleDetail(String roleCode) {
        Map<String, Object> roleRow = findRoleOrThrow(roleCode);
        Long roleId = asLong(roleRow.get("id"));

        Set<String> defaults = RolePermissionDefaults.defaultsOf(roleCode);
        boolean isWildcard = defaults.contains(RolePermissionDefaults.WILDCARD);
        Set<String> overrideCodes = new HashSet<>(mapper.findOverridePermCodes(roleId));

        List<Map<String, Object>> allPerms = mapper.listAllPermissions();
        List<PermissionItem> items = new ArrayList<>(allPerms.size());
        Set<String> effective = new HashSet<>();

        for (Map<String, Object> p : allPerms) {
            String code = asString(p.get("code"));
            PermissionItem item = new PermissionItem();
            item.setCode(code);
            item.setName(asString(p.get("name")));
            item.setModule(asString(p.get("module")));

            if (isWildcard) {
                item.setSource("default");
                item.setGranted(true);
            } else if (defaults.contains(code)) {
                item.setSource("default");
                item.setGranted(true);
            } else if (overrideCodes.contains(code)) {
                item.setSource("override");
                item.setGranted(true);
            } else {
                item.setSource(null);
                item.setGranted(false);
            }
            if (Boolean.TRUE.equals(item.getGranted())) effective.add(code);
            items.add(item);
        }

        RoleSummary summary = mapRowToSummary(roleRow);
        summary.setEffectivePermCount(effective.size());
        summary.setOverridePermCount(overrideCodes.size());

        RoleDetailView view = new RoleDetailView();
        view.setRole(summary);
        view.setPermissions(items);
        return view;
    }

    /** 列所有权限码（管理 UI 渲染权限矩阵的字典源）。 */
    public List<Map<String, Object>> listAllPermissions() {
        return mapper.listAllPermissions();
    }

    /**
     * 给角色批量加权限。规则:
     * <ul>
     *   <li>DEFAULTS 已经覆盖的,跳过(不报错)</li>
     *   <li>找不到的 perm code,整体抛 BAD_REQUEST 不写半</li>
     *   <li>super_admin 不允许调(wildcard 已涵盖一切,加了徒增噪音)</li>
     * </ul>
     */
    @Transactional
    public int grantPerms(String roleCode, GrantRolePermsRequest req) {
        if (req == null || req.getPermCodes() == null || req.getPermCodes().isEmpty()) {
            return 0;
        }
        Map<String, Object> roleRow = findRoleOrThrow(roleCode);
        Long roleId = asLong(roleRow.get("id"));
        Set<String> defaults = RolePermissionDefaults.defaultsOf(roleCode);

        if (defaults.contains(RolePermissionDefaults.WILDCARD)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "super_admin 已包含所有权限,不需要也不允许追加 override");
        }

        List<String> notFound = new ArrayList<>();
        List<long[]> toInsert = new ArrayList<>();
        for (String code : req.getPermCodes()) {
            if (defaults.contains(code)) {
                continue;
            }
            Long permId = mapper.findPermissionIdByCode(code);
            if (permId == null) {
                notFound.add(code);
                continue;
            }
            toInsert.add(new long[]{roleId, permId});
        }
        if (!notFound.isEmpty()) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "权限码不存在:" + String.join(", ", notFound));
        }

        int affected = 0;
        for (long[] pair : toInsert) {
            affected += mapper.insertRolePermission(pair[0], pair[1]);
        }
        log.info("Granted {} perm(s) to role {}", affected, roleCode);
        return affected;
    }

    /** 撤销一条 override。DEFAULTS 里的权限码不允许撤销(抛 BAD_REQUEST)。 */
    @Transactional
    public void revokePerm(String roleCode, String permCode) {
        Map<String, Object> roleRow = findRoleOrThrow(roleCode);
        Long roleId = asLong(roleRow.get("id"));
        Set<String> defaults = RolePermissionDefaults.defaultsOf(roleCode);

        if (defaults.contains(permCode)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "「" + permCode + "」是该角色的默认权限,不能在 UI 撤销。" +
                    "如果确认要拿掉,需要修改 RolePermissionDefaults.java 后重新发版。");
        }

        Long permId = mapper.findPermissionIdByCode(permCode);
        if (permId == null) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(),
                    "权限码不存在:" + permCode);
        }
        int affected = mapper.deleteRolePermission(roleId, permId);
        log.info("Revoked perm {} from role {} (affected={})", permCode, roleCode, affected);
    }

    // ===== 自定义角色 / 团队 CRUD =====

    /**
     * 新建自定义角色 或 团队(is_builtin=false)。
     *
     * <p>kind='role':code 必填。<br>
     * kind='team':code 可省,服务端自动生成 team_<rand>。team 行不复制 DEFAULTS(从空集起算)。
     */
    @Transactional
    public RoleSummary createRole(CreateRoleRequest req) {
        String kind = (req.getKind() == null || req.getKind().isBlank()) ? "role" : req.getKind();
        if (!"role".equals(kind) && !"team".equals(kind)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "kind 只能是 'role' 或 'team',收到:" + kind);
        }
        if (req.getName() == null || req.getName().isBlank()) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(), "name 必填");
        }

        // 处理 code:role 必传;team 可缺省,自动 team_<rand>
        String code;
        if ("team".equals(kind)) {
            if (req.getCode() == null || req.getCode().isBlank()) {
                code = "team_" + Long.toString(System.currentTimeMillis(), 36);
            } else {
                code = req.getCode().trim().toLowerCase();
            }
        } else {
            if (req.getCode() == null || req.getCode().isBlank()) {
                throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(), "kind=role 时 code 必填");
            }
            code = req.getCode().trim().toLowerCase();
        }

        // 唯一性 + 与内置 code 不冲突
        if (RolePermissionDefaults.DEFAULTS.containsKey(code)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "code「" + code + "」与内置角色重名,请换一个");
        }
        if (!mapper.findRoleByCode(code).isEmpty()) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "code「" + code + "」已存在");
        }

        // team 字段校验
        String teamType = "team".equals(kind) ? req.getTeamType() : null;
        LocalDate startDate = "team".equals(kind) ? req.getStartDate() : null;
        LocalDate endDate = "team".equals(kind) ? req.getEndDate() : null;
        if (teamType != null && !teamType.isBlank() && !VALID_TEAM_TYPES.contains(teamType)) {
            // 先在 service 抛 400,避免落到 DB 触发 CHECK 后变 500 stack trace
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "无效的团队类型:" + teamType);
        }
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "结束日期不能早于开始日期");
        }

        long id = IdWorker.getId();
        String tenantId = TenantContext.getRequiredTenantId();
        mapper.insertCustomRole(id, tenantId, code, req.getName().trim(),
                req.getDescription() == null ? null : req.getDescription().trim(),
                kind, teamType, startDate, endDate);

        // 计算初始权限集合(team 默认空,role 走原逻辑)
        Set<String> initialPerms = new HashSet<>();
        if ("role".equals(kind)) {
            if (req.getInitialPermissionCodes() != null && !req.getInitialPermissionCodes().isEmpty()) {
                initialPerms.addAll(req.getInitialPermissionCodes());
            } else if (req.getCopyFromRoleCode() != null && !req.getCopyFromRoleCode().isBlank()) {
                String fromCode = req.getCopyFromRoleCode().trim();
                Set<String> defaults = RolePermissionDefaults.defaultsOf(fromCode);
                if (defaults.contains(RolePermissionDefaults.WILDCARD)) {
                    throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                            "不能从 super_admin 复制权限(它是 wildcard)");
                }
                initialPerms.addAll(defaults);
                if (!mapper.findRoleByCode(fromCode).isEmpty()) {
                    Long fromRoleId = asLong(mapper.findRoleByCode(fromCode).get(0).get("id"));
                    initialPerms.addAll(mapper.findOverridePermCodes(fromRoleId));
                }
            }
        }

        int permAdded = 0;
        for (String permCode : initialPerms) {
            Long permId = mapper.findPermissionIdByCode(permCode);
            if (permId == null) continue;
            permAdded += mapper.insertRolePermission(id, permId);
        }
        log.info("Created {} {} (id={}) with {} initial perm(s)", kind, code, id, permAdded);

        RoleSummary s = new RoleSummary();
        s.setId(id);
        s.setCode(code);
        s.setName(req.getName());
        s.setDescription(req.getDescription());
        s.setIsBuiltin(false);
        s.setSortOrder(999);
        s.setKind(kind);
        s.setTeamType(teamType);
        s.setStartDate(startDate);
        s.setEndDate(endDate);
        s.setEffectivePermCount(permAdded);
        s.setOverridePermCount(permAdded);
        s.setMemberCount(0);
        return s;
    }

    /** 改自定义角色 / 团队的 name / description + team 字段。 */
    @Transactional
    public void updateRole(String code, UpdateRoleRequest req) {
        Map<String, Object> row = findRoleOrThrow(code);
        if (Boolean.TRUE.equals(asBoolean(row.get("is_builtin")))) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "内置角色不允许改 name / description(要改请修改 RolePermissionDefaults.java 后重新发版)");
        }
        int affected = mapper.updateCustomRole(code, req.getName().trim(),
                req.getDescription() == null ? null : req.getDescription().trim());
        if (affected == 0) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(), "角色已删除或不存在:" + code);
        }

        // 仅 team 行同步 team 字段
        if ("team".equals(asString(row.get("kind")))) {
            LocalDate startDate = req.getStartDate();
            LocalDate endDate = req.getEndDate();
            String teamType = req.getTeamType();
            if (teamType != null && !teamType.isBlank() && !VALID_TEAM_TYPES.contains(teamType)) {
                throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                        "无效的团队类型:" + teamType);
            }
            if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
                throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                        "结束日期不能早于开始日期");
            }
            mapper.updateTeamFields(code, teamType, startDate, endDate);
        }
    }

    /** 归档团队 — 仅 kind='team' 行有效。 */
    @Transactional
    public void archiveTeam(String code) {
        Map<String, Object> row = findRoleOrThrow(code);
        if (!"team".equals(asString(row.get("kind")))) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "只能归档团队(kind='team'),不能归档角色");
        }
        int affected = mapper.archiveTeam(code);
        if (affected == 0) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "团队已经处于归档状态或不存在");
        }
        log.info("Archived team {}", code);
    }

    /** 撤销归档。 */
    @Transactional
    public void unarchiveTeam(String code) {
        Map<String, Object> row = findRoleOrThrow(code);
        if (!"team".equals(asString(row.get("kind")))) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "只能撤归档团队(kind='team')");
        }
        int affected = mapper.unarchiveTeam(code);
        if (affected == 0) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "团队未处于归档状态或不存在");
        }
        log.info("Unarchived team {}", code);
    }

    /** 软删除自定义角色 / 团队。有用户绑定时拒绝。 */
    @Transactional
    public void deleteRole(String code) {
        Map<String, Object> row = findRoleOrThrow(code);
        if (Boolean.TRUE.equals(asBoolean(row.get("is_builtin")))) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "内置角色不可删除");
        }
        Long roleId = asLong(row.get("id"));
        int bound = mapper.countUsersBoundToRole(roleId, TenantContext.getRequiredTenantId());
        if (bound > 0) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "「" + code + "」还有 " + bound + " 名用户绑定,请先在「用户管理」里解绑后再删除");
        }
        int affected = mapper.softDeleteCustomRole(code);
        if (affected == 0) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(), "已删除或不存在:" + code);
        }
        log.info("Soft-deleted {}", code);
    }

    private Map<String, Object> findRoleOrThrow(String code) {
        List<Map<String, Object>> rows = mapper.findRoleByCode(code);
        if (rows.isEmpty()) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(), "角色不存在:" + code);
        }
        return rows.get(0);
    }

    /** 把 DB row 转成 RoleSummary,包含所有 team 字段。 */
    private RoleSummary mapRowToSummary(Map<String, Object> r) {
        RoleSummary s = new RoleSummary();
        s.setId(asLong(r.get("id")));
        s.setCode(asString(r.get("code")));
        s.setName(asString(r.get("name")));
        s.setDescription(asString(r.get("description")));
        s.setIsBuiltin(asBoolean(r.get("is_builtin")));
        s.setSortOrder(asInt(r.get("sort_order")));
        s.setKind(asString(r.get("kind")));
        s.setTeamType(asString(r.get("team_type")));
        s.setStartDate(asLocalDate(r.get("start_date")));
        s.setEndDate(asLocalDate(r.get("end_date")));
        s.setArchivedAt(asOffsetDateTime(r.get("archived_at")));
        return s;
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

    private static Boolean asBoolean(Object o) {
        if (o == null) return null;
        if (o instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(o));
    }

    private static LocalDate asLocalDate(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDate ld) return ld;
        if (o instanceof Date d) return d.toLocalDate();
        if (o instanceof java.util.Date d) return d.toInstant().atZone(ZoneOffset.UTC).toLocalDate();
        return LocalDate.parse(o.toString());
    }

    private static OffsetDateTime asOffsetDateTime(Object o) {
        if (o == null) return null;
        if (o instanceof OffsetDateTime odt) return odt;
        if (o instanceof java.sql.Timestamp ts) {
            return ts.toInstant().atOffset(ZoneOffset.UTC);
        }
        if (o instanceof java.util.Date d) return d.toInstant().atOffset(ZoneOffset.UTC);
        return OffsetDateTime.parse(o.toString());
    }
}
