package com.xg.platform.crisis.dto;

/**
 * xg-ai → Java 危机回调入参（设计 §4.1）。
 *
 * <p>注意：<b>不含 student_id / tenant_id</b>——身份由 Java 重校验转发的已认证
 * token 解析，绝不信 xg-ai 自报（设计 §4.1 身份铁律）。也不含原话（隐私 §5），
 * 只带稳定 messageId + 命中词表版本。
 */
public record CrisisReportRequest(String messageId, String ruleVersion) {
}
