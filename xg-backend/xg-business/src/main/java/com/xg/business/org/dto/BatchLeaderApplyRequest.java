package com.xg.business.org.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * 批量设置班主任。整批跑在同一个事务里，任一失败全部回滚。
 *
 * <p>每条 item 的 leaderId 必须非 null（"清空"用单条 PUT 走，批量场景不允许）。
 */
@Getter
@Setter
public class BatchLeaderApplyRequest {
    private List<Item> items;

    @Getter
    @Setter
    public static class Item {
        private Long classId;
        private Long leaderId;
    }
}
