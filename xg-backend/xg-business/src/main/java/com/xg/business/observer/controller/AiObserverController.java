package com.xg.business.observer.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.xg.business.observer.dto.ObserverCardDto;
import com.xg.business.observer.dto.PreviewRequest;
import com.xg.business.observer.dto.SaveObserverCardRequest;
import com.xg.business.observer.service.AiObserverCardService;
import com.xg.common.base.R;
import com.xg.platform.queryguard.QueryGuardResult;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI 观察员卡 REST 端点。
 *
 * <p>权限:Phase 1 只看 @SaCheckLogin,角色级在 ObserverContextResolver / QueryGuard
 * scope 注入里强制(dean 看到的 SQL 已被加过 college filter)。前端按 hasPermission
 * 决定是否暴露入口,后端不再做角色 gate。
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai-observer")
@SaCheckLogin
public class AiObserverController {

    private final AiObserverCardService service;

    @GetMapping("/cards")
    public R<List<ObserverCardDto>> listMine() {
        return R.ok(service.listMine());
    }

    @PostMapping("/cards")
    public R<ObserverCardDto> save(@RequestBody @Valid SaveObserverCardRequest req) {
        return R.ok(service.save(req));
    }

    @PutMapping("/cards/{id}")
    public R<ObserverCardDto> update(@PathVariable Long id,
                                      @RequestBody @Valid SaveObserverCardRequest req) {
        return R.ok(service.update(id, req));
    }

    @DeleteMapping("/cards/{id}")
    public R<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return R.ok();
    }

    /** Workspace 渲染时调:跑一次拿数据。带 cache:5 分钟内同 owner+sql 复用结果。 */
    @PostMapping("/cards/{id}/run")
    public R<QueryGuardResult> run(@PathVariable Long id,
                                    @RequestParam(value = "bypass_cache", defaultValue = "false") boolean bypassCache) {
        return R.ok(service.run(id, bypassCache));
    }

    /** 配卡时调:试跑 LLM 出的 SQL 一段(LIMIT 20),给老师看 sample 数据 + cost。 */
    @PostMapping("/preview")
    public R<QueryGuardResult> preview(@RequestBody @Valid PreviewRequest req) {
        return R.ok(service.preview(req.getSqlText()));
    }
}
