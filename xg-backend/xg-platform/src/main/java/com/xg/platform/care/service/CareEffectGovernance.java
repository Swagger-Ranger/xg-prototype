package com.xg.platform.care.service;

import java.util.ArrayList;
import java.util.List;

/**
 * 规则效果报表的治理提示阈值（PRD §14.1）。纯函数，单测覆盖。
 *
 * <p>PRD §14.1 第 4 条"同一学生 7 天内新增 ≥3 个任务 → 合并展示为复合关怀"
 * 是<b>跨规则、按学生</b>的展示合并诉求，不属于"按规则"的效果报表口径，
 * 本类不处理（留给工作台展示层）。
 */
public final class CareEffectGovernance {

    private CareEffectGovernance() {}

    /**
     * 给单条规则算治理提示。triggered30=0 时除率无意义，跳过比率类提示。
     *
     * @param triggered30      近 30 天触发(建任务)数
     * @param falsePositive30  近 30 天误报反馈数
     * @param handledOffline30 近 30 天以 "已私下处理" 拒绝数
     * @param triggered60      近 60 天触发数
     * @param accepted60       近 60 天已接单数
     */
    public static List<String> hints(int triggered30, int falsePositive30,
                                     int handledOffline30, int triggered60,
                                     int accepted60) {
        List<String> hints = new ArrayList<>();
        if (triggered30 > 0 && (double) falsePositive30 / triggered30 > 0.20) {
            hints.add("近 30 天误报反馈率超过 20%，建议产品方规则维护小组复核");
        }
        if (triggered30 > 0 && (double) handledOffline30 / triggered30 > 0.30) {
            hints.add("近 30 天“已私下处理”超过 30%，阈值可能偏紧");
        }
        if (triggered60 > 0 && accepted60 == 0) {
            hints.add("近 60 天无人接单，建议标记为待审视");
        }
        return hints;
    }
}
