package com.xg.platform.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.xg.common.base.PageResult;
import com.xg.platform.system.dto.CreateUserRequest;
import com.xg.platform.system.dto.SystemUserQueryRequest;
import com.xg.platform.system.dto.SystemUserView;
import com.xg.platform.system.dto.UpdateUserRequest;
import com.xg.platform.system.mapper.SysRoleMapper;
import com.xg.platform.system.mapper.SysUserMapper;
import com.xg.platform.system.mapper.SysUserRoleMapper;
import com.xg.platform.system.model.SysRole;
import com.xg.platform.system.model.SysUser;
import com.xg.platform.system.model.SysUserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import cn.hutool.crypto.digest.BCrypt;

@Slf4j
@Service
@RequiredArgsConstructor
public class SystemUserService {

    /** Default password used when a user is created without one, or when an admin resets. */
    public static final String DEFAULT_PASSWORD = "xg@123456";

    private final SysUserMapper sysUserMapper;
    private final SysRoleMapper sysRoleMapper;
    private final SysUserRoleMapper sysUserRoleMapper;

    /** 列表默认隐藏的"非教职工"角色码：学生 + 班长身份。 */
    private static final List<String> STUDENT_ROLE_CODES = List.of("student", "class_monitor");

    public PageResult<SystemUserView> list(SystemUserQueryRequest query) {
        Page<SysUser> page = query.toPage();

        // Pre-compute allowed user ids when filtering by role code (optional narrowing).
        Set<Long> userIdFilter = null;
        if (query.getRoleCode() != null && !query.getRoleCode().isBlank()) {
            List<Long> ids = sysUserRoleMapper.findUserIdsByRoleCode(query.getRoleCode());
            userIdFilter = new HashSet<>(ids);
            if (userIdFilter.isEmpty()) {
                Page<SystemUserView> empty = new Page<>(query.getPage(), query.getSize(), 0);
                empty.setRecords(Collections.emptyList());
                return PageResult.of(empty);
            }
        }

        // includeStudents=false（缺省）→ 算出学生身份的 user_id 全 NOT IN 掉，避免几万行学生
        // 把教职工列表淹没。前端"按学号查学生账号"兜底入口才传 includeStudents=true。
        Set<Long> excludeUserIds = query.isIncludeStudents()
                ? Collections.emptySet()
                : new HashSet<>(sysUserRoleMapper.findUserIdsByRoleCodes(STUDENT_ROLE_CODES));

        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(query.getStatus() != null, SysUser::getStatus, query.getStatus())
                .in(userIdFilter != null, SysUser::getId, userIdFilter == null ? Collections.emptySet() : userIdFilter)
                .notIn(!excludeUserIds.isEmpty(), SysUser::getId, excludeUserIds)
                .and(query.getKeyword() != null && !query.getKeyword().isBlank(), w -> w
                        .like(SysUser::getUsername, query.getKeyword())
                        .or().like(SysUser::getRealName, query.getKeyword())
                        .or().like(SysUser::getPhone, query.getKeyword()))
                .orderByDesc(SysUser::getCreatedAt);

        Page<SysUser> pageResult = sysUserMapper.selectPage(page, wrapper);

        List<Long> userIds = pageResult.getRecords().stream().map(SysUser::getId).toList();
        Map<Long, List<String>> roleCodesByUser = batchLoadRoleCodes(userIds);

        List<SystemUserView> views = pageResult.getRecords().stream()
                .map(u -> toView(u, roleCodesByUser.getOrDefault(u.getId(), Collections.emptyList())))
                .toList();

        Page<SystemUserView> viewPage = new Page<>(pageResult.getCurrent(), pageResult.getSize(), pageResult.getTotal());
        viewPage.setRecords(views);
        return PageResult.of(viewPage);
    }

    @Transactional
    public SystemUserView create(CreateUserRequest req) {
        long existing = sysUserMapper.selectCount(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, req.getUsername()));
        if (existing > 0) {
            throw SystemUserErrorCode.USERNAME_EXISTS.exception();
        }

        List<SysRole> roles = loadRoles(req.getRoleCodes());

        SysUser user = new SysUser();
        user.setUsername(req.getUsername());
        user.setRealName(req.getRealName());
        user.setPhone(req.getPhone());
        user.setEmail(req.getEmail());
        user.setStatus("active");
        user.setPasswordHash(BCrypt.hashpw(req.getPassword()));
        sysUserMapper.insert(user);

        bindRoles(user.getId(), roles);

        return toView(user, req.getRoleCodes());
    }

    @Transactional
    public void update(Long id, UpdateUserRequest req) {
        SysUser user = requireExisting(id);

        if (req.getRealName() != null) user.setRealName(req.getRealName());
        if (req.getPhone() != null) user.setPhone(req.getPhone());
        if (req.getEmail() != null) user.setEmail(req.getEmail());
        if (req.getStatus() != null) user.setStatus(req.getStatus());
        sysUserMapper.updateById(user);

        if (req.getRoleCodes() != null) {
            List<SysRole> roles = loadRoles(req.getRoleCodes());
            sysUserRoleMapper.delete(new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getUserId, id));
            bindRoles(id, roles);
        }
    }

    @Transactional
    public void resetPassword(Long id) {
        SysUser user = requireExisting(id);
        user.setPasswordHash(BCrypt.hashpw(DEFAULT_PASSWORD));
        sysUserMapper.updateById(user);
    }

    // --- helpers ---

    private SysUser requireExisting(Long id) {
        SysUser user = sysUserMapper.selectById(id);
        if (user == null) {
            throw SystemUserErrorCode.USER_NOT_FOUND.exception();
        }
        return user;
    }

    private List<SysRole> loadRoles(List<String> codes) {
        if (codes == null || codes.isEmpty()) return List.of();
        List<SysRole> roles = sysRoleMapper.selectList(
                new LambdaQueryWrapper<SysRole>().in(SysRole::getCode, codes));
        if (roles.size() != codes.size()) {
            throw SystemUserErrorCode.ROLE_NOT_FOUND.exception();
        }
        return roles;
    }

    private void bindRoles(Long userId, List<SysRole> roles) {
        for (SysRole role : roles) {
            SysUserRole ur = new SysUserRole();
            ur.setUserId(userId);
            ur.setRoleId(role.getId());
            sysUserRoleMapper.insert(ur);
        }
    }

    private Map<Long, List<String>> batchLoadRoleCodes(Collection<Long> userIds) {
        Map<Long, List<String>> result = new HashMap<>();
        if (userIds.isEmpty()) return result;
        for (Long uid : userIds) {
            result.put(uid, sysUserRoleMapper.findRoleCodesByUserId(uid));
        }
        return result;
    }

    private SystemUserView toView(SysUser user, List<String> roleCodes) {
        SystemUserView v = new SystemUserView();
        v.setId(user.getId());
        v.setUsername(user.getUsername());
        v.setRealName(user.getRealName());
        v.setPhone(user.getPhone());
        v.setEmail(user.getEmail());
        v.setStatus(user.getStatus());
        v.setRoleCodes(new ArrayList<>(roleCodes));
        v.setLastLoginAt(user.getLastLoginAt());
        v.setCreatedAt(user.getCreatedAt());
        return v;
    }
}
