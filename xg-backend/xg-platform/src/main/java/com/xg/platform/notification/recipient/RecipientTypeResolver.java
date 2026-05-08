package com.xg.platform.notification.recipient;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * 收件人类型解析器策略接口 — 每个 RecipientType 一个 @Component。
 * Spring 自动 inject 全部 bean,RecipientResolver 按 type() 索引派发。
 *
 * <p>spec 是模板里那一项的完整 JSON object(含 cc 标记 + type 特定参数,如
 * static_user 的 user_id)。type() 必须等于 spec.get("type").asText(),否则
 * 不会被派发到。
 */
public interface RecipientTypeResolver {

    /** 跟 RecipientType.code() 一致 */
    String type();

    /**
     * 解析成实际收件人。失败应返回空列表 + log.warn,不抛异常 — 通知是辅助,
     * 不能让 resolve 失败拖业务事务。
     *
     * @param ctx 业务调用方传入的上下文(applicantId 等)
     * @param spec 模板里这一项的完整 JSON,含 cc 等可选字段
     */
    List<ResolvedRecipient> resolve(RecipientContext ctx, JsonNode spec);
}
