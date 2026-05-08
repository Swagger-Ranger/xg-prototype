"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
const request_1 = require("../utils/request");
async function login(payload) {
    var _a, _b, _c, _d;
    const wire = await (0, request_1.post)('/auth/login', payload, { skipAuth: true });
    return {
        token: wire.token,
        refreshToken: (_a = wire.refresh_token) !== null && _a !== void 0 ? _a : null,
        user: {
            id: wire.user.id,
            username: wire.user.username,
            realName: (_b = wire.user.real_name) !== null && _b !== void 0 ? _b : null,
            tenantId: (_c = wire.user.tenant_id) !== null && _c !== void 0 ? _c : null,
            roleCodes: (_d = wire.user.role_codes) !== null && _d !== void 0 ? _d : [],
        },
    };
}
//# sourceMappingURL=auth.js.map