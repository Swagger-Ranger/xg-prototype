package com.xg.business.observer.dto;

import com.xg.business.observer.model.AiObserverCard;

import java.time.OffsetDateTime;
import java.util.Map;

/**
 * 卡片 list / single API 的返回结构。比 model 简,前端只关心这几个字段。
 */
public record ObserverCardDto(
        String id,                  // Long 雪花 → string 防 JS 精度丢失
        String title,
        String nlQuery,
        String chartType,
        Map<String, Object> chartOpts,
        Integer refreshSec,
        Long costEstimate,
        Long rowsEstimate,
        Integer sortOrder,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
    public static ObserverCardDto from(AiObserverCard c) {
        return new ObserverCardDto(
                String.valueOf(c.getId()),
                c.getTitle(),
                c.getNlQuery(),
                c.getChartType(),
                c.getChartOpts(),
                c.getRefreshSec(),
                c.getCostEstimate(),
                c.getRowsEstimate(),
                c.getSortOrder(),
                c.getCreatedAt(),
                c.getUpdatedAt()
        );
    }
}
