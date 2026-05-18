package com.xg.platform.crisis.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.xg.common.base.R;
import com.xg.common.exception.BizException;
import com.xg.common.exception.GlobalErrorCode;
import com.xg.platform.crisis.dto.CrisisReportRequest;
import com.xg.platform.crisis.service.CrisisSignalService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * xg-ai → Java 危机回调内部端点（设计 §4.1）。
 *
 * <p>路径在 {@code /internal/**} 下——{@link com.xg.platform.auth.SaTokenConfig}
 * 白名单内（内网调用，假定网络隔离），故不走 Sa-Token 登录拦截，鉴权由本类手动做：
 *
 * <ol>
 *   <li><b>服务间鉴权</b>：{@code X-Internal-Token} 必须匹配（复用 sidecar 共享密钥）。</li>
 *   <li><b>身份重校验</b>：受害学生 id <b>不信 xg-ai 自报</b>，从转发的已认证学生
 *       {@code Authorization: Bearer} token 用 Sa-Token 重新解析（设计 §4.1）。</li>
 * </ol>
 *
 * <p>租户：由 {@link com.xg.common.tenant.TenantFilter}（对 /internal 仍生效）从
 * {@code X-Tenant-Id} 建立 schema。P0 单租户即 {@code default}；更强的"租户从已
 * 认证 session 派生"绑定属设计 §4.1 后续硬化（本通道默认关闭、未过 D1/D3，留 TODO）。
 *
 * <p>开关 {@code xg.crisis.enabled} 默认 false：{@link CrisisSignalService#report}
 * 内部 no-op，本端点对系统零副作用。
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class CrisisInternalController {

    private final CrisisSignalService crisisSignalService;

    @Value("${ai.sidecar.internal-token:dev-internal-token}")
    private String internalToken;

    @PostMapping("/internal/crisis/signal")
    public R<Void> report(@RequestBody CrisisReportRequest body, HttpServletRequest request) {
        // 1. 服务间鉴权
        String token = request.getHeader("X-Internal-Token");
        if (token == null || !token.equals(internalToken)) {
            log.warn("crisis internal endpoint: bad/missing X-Internal-Token");
            throw new BizException(GlobalErrorCode.FORBIDDEN);
        }

        // 2. 身份重校验：从转发的已认证学生 token 解析 student_id，不信 xg-ai 自报
        Long studentId = resolveStudentFromForwardedToken(request.getHeader("Authorization"));
        if (studentId == null) {
            log.warn("crisis internal endpoint: forwarded student token invalid/expired");
            throw new BizException(GlobalErrorCode.UNAUTHORIZED);
        }

        crisisSignalService.report(studentId, body.messageId(), body.ruleVersion(),
                body.category());
        return R.ok();
    }

    /** 用 Sa-Token 重新校验转发的学生 bearer token，解析出登录 id。无效返回 null。 */
    private Long resolveStudentFromForwardedToken(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            return null;
        }
        String raw = authorization.startsWith("Bearer ")
                ? authorization.substring(7).trim()
                : authorization.trim();
        if (raw.isEmpty()) {
            return null;
        }
        try {
            Object loginId = StpUtil.getLoginIdByToken(raw);
            if (loginId == null) {
                return null;
            }
            if (loginId instanceof Long l) {
                return l;
            }
            if (loginId instanceof Number n) {
                return n.longValue();
            }
            return Long.parseLong(loginId.toString());
        } catch (NumberFormatException e) {
            return null;
        } catch (Exception e) {
            log.debug("getLoginIdByToken failed: {}", e.getMessage());
            return null;
        }
    }
}
