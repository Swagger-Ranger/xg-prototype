"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.polishRejection = polishRejection;
/**
 * AI 辅助端点（走 Java 后端，由后端再转发到 sidecar）。
 * Sidecar 不可用时后端会回退，error_message 非空即提示用户保留原稿。
 */
const request_1 = require("../utils/request");
function polishRejection(draft, context) {
    return (0, request_1.post)('/ai/polish-rejection', { draft, context });
}
//# sourceMappingURL=ai.js.map