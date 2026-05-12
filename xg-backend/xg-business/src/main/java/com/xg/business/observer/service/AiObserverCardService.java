package com.xg.business.observer.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.business.observer.dto.ObserverCardDto;
import com.xg.business.observer.dto.SaveObserverCardRequest;
import com.xg.business.observer.mapper.AiObserverCardMapper;
import com.xg.business.observer.model.AiObserverCard;
import com.xg.common.exception.BizException;
import com.xg.platform.auth.CurrentUser;
import com.xg.platform.queryguard.ExecContext;
import com.xg.platform.queryguard.QueryGuardResult;
import com.xg.platform.queryguard.QueryGuardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * AI 观察员卡 CRUD + 执行。所有 SQL 出口都过 {@link QueryGuardService}。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiObserverCardService {

    /** 单用户卡片上限,防意外炸表(性能/UI 兼顾)。 */
    private static final int MAX_CARDS_PER_USER = 12;

    private final AiObserverCardMapper mapper;
    private final QueryGuardService queryGuard;
    private final ObserverContextResolver contextResolver;

    /* ============== CRUD ============== */

    public List<ObserverCardDto> listMine() {
        Long userId = CurrentUser.id();
        List<AiObserverCard> rows = mapper.selectList(
                new LambdaQueryWrapper<AiObserverCard>()
                        .eq(AiObserverCard::getOwnerId, userId)
                        .orderByAsc(AiObserverCard::getSortOrder)
                        .orderByDesc(AiObserverCard::getCreatedAt));
        return rows.stream().map(ObserverCardDto::from).toList();
    }

    @Transactional
    public ObserverCardDto save(SaveObserverCardRequest req) {
        Long userId = CurrentUser.id();
        int existing = Math.toIntExact(mapper.selectCount(
                new LambdaQueryWrapper<AiObserverCard>()
                        .eq(AiObserverCard::getOwnerId, userId)));
        if (existing >= MAX_CARDS_PER_USER) {
            throw new BizException("OBSERVER_CARD_LIMIT",
                    "每人最多 " + MAX_CARDS_PER_USER + " 张观察员卡,请先删除一些再加");
        }

        ExecContext ctx = contextResolver.resolve();

        // 保存前过一次 QueryGuard preview 拿 cost(同时校验 SQL 合法 + role_scope 注入能解析)
        QueryGuardResult preview = queryGuard.explainOnly(req.getSqlText(), Map.of(), ctx);

        AiObserverCard card = new AiObserverCard();
        card.setOwnerId(userId);
        card.setOwnerRole(ctx.ownerRole());
        card.setTitle(req.getTitle());
        card.setNlQuery(req.getNlQuery());
        card.setSqlText(req.getSqlText());
        card.setChartType(req.getChartType());
        card.setChartOpts(req.getChartOpts());
        card.setRefreshSec(req.getRefreshSec() == null ? 300 : req.getRefreshSec());
        card.setCostEstimate(preview.planCost());
        card.setRowsEstimate(preview.planRows());
        card.setSortOrder(existing);
        mapper.insert(card);
        return ObserverCardDto.from(card);
    }

    @Transactional
    public ObserverCardDto update(Long cardId, SaveObserverCardRequest req) {
        AiObserverCard card = ownedOrThrow(cardId);
        ExecContext ctx = contextResolver.resolve();
        // SQL 改了就重新 EXPLAIN
        if (!req.getSqlText().equals(card.getSqlText())) {
            QueryGuardResult preview = queryGuard.explainOnly(req.getSqlText(), Map.of(), ctx);
            card.setCostEstimate(preview.planCost());
            card.setRowsEstimate(preview.planRows());
        }
        card.setTitle(req.getTitle());
        card.setNlQuery(req.getNlQuery());
        card.setSqlText(req.getSqlText());
        card.setChartType(req.getChartType());
        card.setChartOpts(req.getChartOpts());
        if (req.getRefreshSec() != null) card.setRefreshSec(req.getRefreshSec());
        mapper.updateById(card);
        return ObserverCardDto.from(card);
    }

    @Transactional
    public void delete(Long cardId) {
        AiObserverCard card = ownedOrThrow(cardId);
        mapper.deleteById(card.getId());
    }

    /* ============== Execute ============== */

    /**
     * 真跑卡片(workspace 渲染时调)。bypassCache=true 时不走 QueryGuard 5min cache。
     */
    public QueryGuardResult run(Long cardId, boolean bypassCache) {
        AiObserverCard card = ownedOrThrow(cardId);
        ExecContext ctx = contextResolver.resolve(bypassCache);
        return queryGuard.safeExecute(card.getSqlText(), Map.of(), ctx);
    }

    /**
     * Preview:LLM 出 SQL 后保存前先试跑一段(LIMIT 20),走 QueryGuard 真执行路径。
     * QueryGuard 内部已经做 EXPLAIN 闸门 + 注入 + 执行,返回 rows + warnings 给前端展示。
     */
    public QueryGuardResult preview(String sql) {
        ExecContext ctx = contextResolver.resolve(true);
        String limited = ensureLimit(sql, 20);
        return queryGuard.safeExecute(limited, Map.of(), ctx);
    }

    /* ============== util ============== */

    private AiObserverCard ownedOrThrow(Long cardId) {
        AiObserverCard card = mapper.selectById(cardId);
        if (card == null || card.getDeletedAt() != null) {
            throw new BizException("OBSERVER_CARD_NOT_FOUND", "观察员卡不存在");
        }
        Long userId = CurrentUser.id();
        if (!card.getOwnerId().equals(userId)) {
            throw new BizException("OBSERVER_CARD_NOT_FOUND", "观察员卡不存在");
        }
        return card;
    }

    /** 给 preview SQL 强加 LIMIT N(末尾追加,如果已有 LIMIT 则跳过)。 */
    private static String ensureLimit(String sql, int n) {
        String trimmed = sql.trim().replaceAll(";\\s*$", "");
        if (trimmed.toUpperCase().matches(".*\\bLIMIT\\s+\\d+\\s*$")) return trimmed;
        return trimmed + " LIMIT " + n;
    }
}
