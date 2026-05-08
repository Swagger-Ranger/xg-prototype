package com.xg.platform.notification.recipient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把模板的 recipients JSONB(一个对象数组)解析成 ResolvedRecipient 列表 —
 * Orchestrator 用它替代旧的 List&lt;Recipient&gt; 入参。
 *
 * <p>多个 type 解析出同一个 user_id 时,**只保留首次出现的 cc 标记**(主送优先,
 * 即 cc=false 覆盖 cc=true)。这样模板配 [applicant, applicant_counselor]
 * 而碰巧申请人就是辅导员时,不会被打成抄送。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RecipientResolver {

    private final List<RecipientTypeResolver> resolvers;
    private final ObjectMapper objectMapper;

    private volatile Map<String, RecipientTypeResolver> indexCache;

    private Map<String, RecipientTypeResolver> index() {
        if (indexCache == null) {
            Map<String, RecipientTypeResolver> m = new HashMap<>();
            for (RecipientTypeResolver r : resolvers) m.put(r.type(), r);
            indexCache = Map.copyOf(m);
        }
        return indexCache;
    }

    /**
     * @param recipientsJson 模板的 recipients 字段(JSON 数组)。空 / null 返回空列表。
     */
    public List<ResolvedRecipient> resolve(String recipientsJson, RecipientContext ctx) {
        if (recipientsJson == null || recipientsJson.isBlank()) return List.of();
        JsonNode arr;
        try {
            arr = objectMapper.readTree(recipientsJson);
        } catch (Exception e) {
            log.warn("recipients JSON parse failed: {}", e.getMessage());
            return List.of();
        }
        if (!arr.isArray() || arr.isEmpty()) return List.of();

        // user_id → ResolvedRecipient,去重 + 主送优先
        Map<Long, ResolvedRecipient> byUser = new LinkedHashMap<>();
        for (JsonNode spec : arr) {
            JsonNode typeNode = spec.get("type");
            if (typeNode == null || typeNode.isNull()) continue;
            String type = typeNode.asText();
            RecipientTypeResolver resolver = index().get(type);
            if (resolver == null) {
                log.warn("unknown RecipientType '{}' in template recipients, skip", type);
                continue;
            }
            try {
                List<ResolvedRecipient> got = resolver.resolve(ctx, spec);
                if (got == null) continue;
                for (ResolvedRecipient r : got) {
                    if (r.userId() == null) continue;
                    ResolvedRecipient existing = byUser.get(r.userId());
                    if (existing == null) {
                        byUser.put(r.userId(), r);
                    } else if (existing.cc() && !r.cc()) {
                        // 主送覆盖抄送
                        byUser.put(r.userId(), r);
                    }
                    // 其他情况(已存在主送 / 同类)保留原有
                }
            } catch (Exception e) {
                log.warn("resolver {} failed: {}", type, e.getMessage());
            }
        }
        return new ArrayList<>(byUser.values());
    }
}
