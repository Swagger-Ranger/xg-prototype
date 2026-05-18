package com.xg.platform.crisis.controller;

import com.xg.common.base.R;
import com.xg.platform.crisis.dto.CrisisSignalDetail;
import com.xg.platform.crisis.dto.CrisisSignalListItem;
import com.xg.platform.crisis.service.CrisisSignalService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 危机线索工作台端点（设计 §4/§5，PRD §9.5）。
 *
 * <p>路径 {@code /api/v1/**} 不在 Sa-Token 白名单 → 必须登录态。越权过滤在 service：
 * 普通辅导员只看「自己负责的学生」（双轨语义同危机通知收件人解析），管理角色看本校
 * 全部；详情/关闭都先鉴权再动作，详情额外写 view 审计（设计 §5，比普通关怀更严）。
 *
 * <p>v1 只「列表 / 详情 / 关闭」三个动作 —— 转介/升级、ack 多态、运营队列在 backlog，
 * 不在本期（设计 §4.4「就这一个关闭端点」的延伸：读视图为可演示而加，动作仍只 close）。
 */
@RestController
@RequiredArgsConstructor
public class CrisisSignalController {

    private final CrisisSignalService crisisSignalService;

    /** 「危机·需立即人工核实」泳道：当前辅导员名下学生的 pending 线索。 */
    @GetMapping("/api/v1/crisis-signal")
    public R<List<CrisisSignalListItem>> list() {
        return R.ok(crisisSignalService.listForCurrentCounselor());
    }

    /** 危机详情（区一处理必须 + 区二辅助判断）；打开即写 view 审计。 */
    @GetMapping("/api/v1/crisis-signal/{id}")
    public R<CrisisSignalDetail> detail(@PathVariable Long id) {
        return R.ok(crisisSignalService.detail(id));
    }

    @PostMapping("/api/v1/crisis-signal/{id}/close")
    public R<Void> close(@PathVariable Long id) {
        crisisSignalService.close(id);
        return R.ok();
    }
}
