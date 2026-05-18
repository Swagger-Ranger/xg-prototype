package com.xg.platform.crisis.dto;

/**
 * xg-ai → Java 危机回调入参（设计 §4.1）。
 *
 * <p>注意：<b>不含 student_id / tenant_id</b>——身份由 Java 重校验转发的已认证
 * token 解析，绝不信 xg-ai 自报（设计 §4.1 身份铁律）。<b>也不含原话</b>（隐私 §5）：
 * {@code category} 是命中类别（safety/basic_needs）这一<b>临床分类桶</b>，给辅导员
 * 电话前分诊用，不是学生说了什么。
 */
public record CrisisReportRequest(String messageId, String ruleVersion, String category) {
}
