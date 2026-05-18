package com.xg.platform.crisis.controller;

import com.xg.common.base.R;
import com.xg.platform.crisis.service.CrisisSignalService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 危机线索最小关闭入口（设计 §4.4）。
 *
 * <p>路径 {@code /api/v1/**} 不在 Sa-Token 白名单 → 必须登录态（{@code handledBy}
 * 由 {@link com.xg.platform.crisis.service.CrisisSignalService#close} 取已认证身份，
 * 非传参）。**就这一个端点**——不做 ack 多态、不做运营队列（那在 backlog）。
 *
 * <p>「仅危机收件人角色可关」的细粒度授权属设计 §4.4 后续硬化（与 D3 收件人模型
 * 绑定）；本通道默认关闭、未过 D1/D3，scaffolding 阶段先要求登录态，TODO 角色收口。
 */
@RestController
@RequiredArgsConstructor
public class CrisisSignalController {

    private final CrisisSignalService crisisSignalService;

    @PostMapping("/api/v1/crisis-signal/{id}/close")
    public R<Void> close(@PathVariable Long id) {
        crisisSignalService.close(id);
        return R.ok();
    }
}
