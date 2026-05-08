"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOpenPositions = listOpenPositions;
exports.getPosition = getPosition;
exports.applyToPosition = applyToPosition;
exports.listMyApplications = listMyApplications;
exports.listMySalaries = listMySalaries;
exports.draftApplicationIntro = draftApplicationIntro;
exports.findByPreference = findByPreference;
exports.matchToSchedule = matchToSchedule;
const request_1 = require("../utils/request");
function listOpenPositions(page = 1, size = 20) {
    return (0, request_1.get)('/work-study/positions', {
        page,
        size,
        status: 'open',
        studentScope: true,
    });
}
function getPosition(id) {
    return (0, request_1.get)(`/work-study/positions/${id}`);
}
function applyToPosition(positionId, intro, financialAidLevel) {
    return (0, request_1.post)('/work-study/applications', {
        position_id: positionId,
        intro,
        financial_aid_level: financialAidLevel,
    });
}
function listMyApplications(studentId, page = 1, size = 20) {
    return (0, request_1.get)('/work-study/applications', {
        page,
        size,
        student_id: studentId,
        include: 'position',
    });
}
function listMySalaries(studentId, page = 1, size = 50) {
    return (0, request_1.get)('/work-study/salaries', {
        page,
        size,
        studentId,
        include: 'position',
    });
}
/** Direct call into AI sidecar (no LLM router) — returns the formatted draft. */
function draftApplicationIntro(positionId, studentBrief) {
    return (0, request_1.postAi)('/tools/draft_workstudy_application_intro/execute', { args: { position_id: Number(positionId), student_brief: studentBrief } }).then((res) => res.output);
}
function findByPreference(pref) {
    return (0, request_1.postAi)('/tools/find_workstudy_positions_by_preference/execute', { args: pref }).then((res) => res.output);
}
function matchToSchedule(slots) {
    return (0, request_1.postAi)('/tools/match_workstudy_positions_to_schedule/execute', { args: { free_slots: slots } }).then((res) => res.output);
}
//# sourceMappingURL=workStudy.js.map