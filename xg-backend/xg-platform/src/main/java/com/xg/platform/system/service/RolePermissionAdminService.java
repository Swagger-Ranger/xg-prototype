package com.xg.platform.system.service;

import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;
import com.xg.platform.auth.RolePermissionDefaults;
import com.xg.platform.system.dto.GrantRolePermsRequest;
import com.xg.platform.system.dto.PermissionItem;
import com.xg.platform.system.dto.RoleDetailView;
import com.xg.platform.system.dto.RoleSummary;
import com.xg.platform.system.mapper.RolePermissionAdminMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 「角色权限」管理 service。
 *
 * <h3>权限模型</h3>
 * <pre>
 *   effective(role) = DEFAULTS[role.code] ∪ sys_role_permission rows
 *   ↑ 代码硬编码     ↑ DB 里"加项 override"，本 service 维护
 *
 *   不支持"减默认"。要从某角色拿掉默认权限只能去改 RolePermissionDefaults.java。
 *   理由：UI 误操作让全平台学生都失去 leave:submit，比"加错权限"危险大得多。
 * </pre>
 *
 * <h3>边界保护</h3>
 * <ul>
 *   <li>授权：跳过"DEFAULTS 已经有"的权限码（无效操作，不报错，return 0 affected）</li>
 *   <li>撤销：DEFAULTS 里的权限码不允许撤（抛 BAD_REQUEST，提示用户改 DEFAULTS 代码）</li>
 *   <li>super_admin 角色的 DEFAULTS 是 wildcard "*"，UI 不渲染矩阵 / 不允许修改</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RolePermissionAdminService {

    private final RolePermissionAdminMapper mapper;

    /** 列所有角色 + effective 权限数。super_admin wildcard 走 sys_permission 全表 size。 */
    public List<RoleSummary> listRoles() {
        List<Map<String, Object>> rows = mapper.listRolesWithDbPermCount();
        int totalPermCount = mapper.listAllPermissions().size();

        List<RoleSummary> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            String code = asString(r.get("code"));
            Set<String> defaults = RolePermissionDefaults.defaultsOf(code);

            RoleSummary s = new RoleSummary();
            s.setId(asLong(r.get("id")));
            s.setCode(code);
            s.setName(asString(r.get("name")));
            s.setDescription(asString(r.get("description")));
            s.setIsBuiltin(asBoolean(r.get("is_builtin")));
            s.setSortOrder(asInt(r.get("sort_order")));
            s.setOverridePermCount(asInt(r.get("db_perm_count")));

            if (defaults.contains(RolePermissionDefaults.WILDCARD)) {
                // super_admin：DEFAULTS = {"*"}，effective = 全部
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

    /** 单角色详情：每个权限码标 source(default/override/null) + granted。 */
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
                // super_admin：所有权限都标 default + granted
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

        RoleSummary summary = toSummary(roleRow);
        summary.setEffectivePermCount(effective.size());
        summary.setOverridePermCount(overrideCodes.size());

        RoleDetailView view = new RoleDetailView();
        view.setRole(summary);
        view.setPermissions(items);
        return view;
    }

    /** 列所有权限码（按 module 分组渲染时复用）。 */
    public List<Map<String, Object>> listAllPermissions() {
        return mapper.listAllPermissions();
    }

    /**
     * 给角色批量加权限。规则：
     * <ul>
     *   <li>DEFAULTS 已经覆盖的，跳过（不报错）</li>
     *   <li>找不到的 perm code，整体抛 BAD_REQUEST 不写半</li>
     *   <li>super_admin 不允许调（wildcard 已涵盖一切，加了徒增噪音）</li>
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
                    "super_admin 已包含所有权限，不需要也不允许追加 override");
        }

        // 先查所有 perm code → id 映射，找不到的整体报错（避免半成功）
        List<String> notFound = new ArrayList<>();
        List<long[]> toInsert = new ArrayList<>();
        for (String code : req.getPermCodes()) {
            if (defaults.contains(code)) {
                continue; // 已经有了，跳过
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
                    "权限码不存在：" + String.join(", ", notFound));
        }

        int affected = 0;
        for (long[] pair : toInsert) {
            affected += mapper.insertRolePermission(pair[0], pair[1]);
        }
        log.info("Granted {} perm(s) to role {}", affected, roleCode);
        return affected;
    }

    /** 撤销一条 override。DEFAULTS 里的权限码不允许撤销（抛 BAD_REQUEST）。 */
    @Transactional
    public void revokePerm(String roleCode, String permCode) {
        Map<String, Object> roleRow = findRoleOrThrow(roleCode);
        Long roleId = asLong(roleRow.get("id"));
        Set<String> defaults = RolePermissionDefaults.defaultsOf(roleCode);

        if (defaults.contains(permCode)) {
            throw new BizException(GlobalErrorCode.BAD_REQUEST.getCode(),
                    "「" + permCode + "」是该角色的默认权限，不能在 UI 撤销。" +
                    "如果确认要拿掉，需要修改 RolePermissionDefaults.java 后重新发版。");
        }

        Long permId = mapper.findPermissionIdByCode(permCode);
        if (permId == null) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(),
                    "权限码不存在：" + permCode);
        }
        int affected = mapper.deleteRolePermission(roleId, permId);
        log.info("Revoked perm {} from role {} (affected={})", permCode, roleCode, affected);
    }

    private Map<String, Object> findRoleOrThrow(String code) {
        List<Map<String, Object>> rows = mapper.findRoleByCode(code);
        if (rows.isEmpty()) {
            throw new BizException(GlobalErrorCode.NOT_FOUND.getCode(), "角色不存在：" + code);
        }
        return rows.get(0);
    }

    private RoleSummary toSummary(Map<String, Object> r) {
        RoleSummary s = new RoleSummary();
        s.setId(asLong(r.get("id")));
        s.setCode(asString(r.get("code")));
        s.setName(asString(r.get("name")));
        s.setDescription(asString(r.get("description")));
        s.setIsBuiltin(asBoolean(r.get("is_builtin")));
        s.setSortOrder(asInt(r.get("sort_order")));
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
}
