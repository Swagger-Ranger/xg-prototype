"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_LABELS = void 0;
exports.getMyStudent = getMyStudent;
exports.getMyExtendedInfo = getMyExtendedInfo;
/**
 * Student profile API（学生自查 + extended_info）。
 *
 * Mini 只暴露"我自己"的 2 条端点：
 *   · GET /students-me — 当前学生 student_profile（学院/专业/班级/学籍状态）
 *   · GET /students-me/extended-info — 自助 extended_info（紧急联系人 等）
 *
 * 学生信息库 / 别人的档案页是 staff 专属，mini 不暴露。
 */
const request_1 = require("../utils/request");
exports.STATUS_LABELS = {
    active: '在读',
    suspended: '休学',
    graduated: '毕业',
    withdrawn: '退学',
};
function getMyStudent() {
    return (0, request_1.get)('/students-me');
}
function getMyExtendedInfo() {
    return (0, request_1.get)('/students-me/extended-info');
}
//# sourceMappingURL=student.js.map