package com.xg.business.observer.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.xg.common.base.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.util.Map;

/**
 * AI 观察员卡(院长 / 学工部部长用 NL 配置出来的可视化卡片)。
 *
 * <p>workspace 渲染:owner 维度查自己的所有卡,按 sortOrder 排序;每张卡渲染时
 * 跑一次 {@code QueryGuardService.safeExecute(sqlText, params={}, ctx={ownerRole,...})},
 * 拿到 rows + 走 chartType 派发到 Statistic / Bar / Line / Table。
 */
@Getter
@Setter
@TableName(value = "ai_observer_card", autoResultMap = true)
public class AiObserverCard extends BaseEntity {

    @TableField("owner_id")
    private Long ownerId;

    @TableField("owner_role")
    private String ownerRole;

    private String title;

    /** 最近一次自然语言描述,「编辑」时塞回输入框。 */
    @TableField("nl_query")
    private String nlQuery;

    /** LLM 出的 SQL 模板(未注入 role_scope),每次执行前都过 QueryGuard。 */
    @TableField("sql_text")
    private String sqlText;

    /** statistic | bar | line | pie | table | trend */
    @TableField("chart_type")
    private String chartType;

    /** echarts 选项(x/y 列、堆叠、配色等)。 */
    @TableField(value = "chart_opts", typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> chartOpts;

    @TableField("refresh_sec")
    private Integer refreshSec;

    /** 保存时 EXPLAIN 出来的 cost,workspace 显示「查询较重」warning 用。 */
    @TableField("cost_estimate")
    private Long costEstimate;

    @TableField("rows_estimate")
    private Long rowsEstimate;

    @TableField("sort_order")
    private Integer sortOrder;
}
