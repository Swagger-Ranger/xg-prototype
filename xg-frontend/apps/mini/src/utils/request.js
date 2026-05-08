"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = get;
exports.postAi = postAi;
exports.post = post;
exports.put = put;
const taro_1 = __importDefault(require("@tarojs/taro"));
// Build-time injection via Taro defineConstants is unreliable in this setup
// (mini-app runtime has no `process` object). Use typeof guard so the access
// itself doesn't throw, and fall back to localhost.
const _proc = typeof process !== 'undefined' ? process : undefined;
const BASE_URL = ((_a = _proc === null || _proc === void 0 ? void 0 : _proc.env) === null || _a === void 0 ? void 0 : _a.XG_API_BASE_URL) || 'http://localhost:8080/api/v1';
const AI_BASE_URL = ((_b = _proc === null || _proc === void 0 ? void 0 : _proc.env) === null || _b === void 0 ? void 0 : _b.XG_AI_BASE_URL) || 'http://localhost:8001/api/v1';
function authHeaders() {
    const token = taro_1.default.getStorageSync('token') || '';
    const userId = taro_1.default.getStorageSync('userId') || '';
    const tenantId = taro_1.default.getStorageSync('tenantId') || 'default';
    const headers = {
        'X-User-Id': String(userId),
        'X-Tenant-Id': String(tenantId),
    };
    if (token)
        headers.Authorization = `Bearer ${token}`;
    return headers;
}
/** 兜门处理 401。多个并发请求同时拿 401 时只触发一次 reLaunch——
 *  否则 WeChat 在 page mount 期间被多次重新启动会触发 onLoad 超时。 */
let _redirecting = false;
function handleUnauthorized() {
    if (_redirecting)
        return;
    _redirecting = true;
    taro_1.default.removeStorageSync('token');
    taro_1.default.removeStorageSync('userId');
    taro_1.default.reLaunch({ url: '/pages/login/index' }).finally(() => {
        // 给下次会话恢复机会
        setTimeout(() => { _redirecting = false; }, 1000);
    });
}
/** 默认请求超时 8s——避免一根挂死的请求导致 page onLoad 5s 看门狗超时。 */
const DEFAULT_TIMEOUT_MS = 8000;
async function get(path, params) {
    var _a, _b, _c;
    const res = await taro_1.default.request({
        url: `${BASE_URL}${path}`,
        method: 'GET',
        data: params,
        header: authHeaders(),
        timeout: DEFAULT_TIMEOUT_MS,
    });
    if (res.statusCode === 401) {
        handleUnauthorized();
        throw new Error('未登录');
    }
    if (res.statusCode >= 400) {
        throw new Error(((_a = res.data) === null || _a === void 0 ? void 0 : _a.message) || `HTTP ${res.statusCode}`);
    }
    return ((_c = (_b = res.data) === null || _b === void 0 ? void 0 : _b.data) !== null && _c !== void 0 ? _c : res.data);
}
async function postAi(path, body) {
    var _a;
    const userId = taro_1.default.getStorageSync('userId') || '';
    const tenantId = taro_1.default.getStorageSync('tenantId') || 'default';
    const user = taro_1.default.getStorageSync('user');
    const role = ((_a = user === null || user === void 0 ? void 0 : user.roleCodes) === null || _a === void 0 ? void 0 : _a[0]) || 'student';
    const res = await taro_1.default.request({
        url: `${AI_BASE_URL}${path}`,
        method: 'POST',
        data: body,
        header: {
            'Content-Type': 'application/json',
            'X-User-Id': String(userId),
            'X-Tenant-Id': String(tenantId),
            'X-User-Role': role,
        },
        // AI 调用一般慢，给更长超时（DeepSeek 7-30s）
        timeout: 45000,
    });
    if (res.statusCode >= 400) {
        throw new Error(`AI HTTP ${res.statusCode}`);
    }
    return res.data;
}
async function post(path, body, opts) {
    var _a, _b, _c;
    const baseHeaders = { 'Content-Type': 'application/json' };
    const header = (opts === null || opts === void 0 ? void 0 : opts.skipAuth) ? baseHeaders : Object.assign(Object.assign({}, baseHeaders), authHeaders());
    const res = await taro_1.default.request({
        url: `${BASE_URL}${path}`,
        method: 'POST',
        data: body,
        header,
        timeout: DEFAULT_TIMEOUT_MS,
    });
    if (res.statusCode === 401) {
        handleUnauthorized();
        throw new Error('未登录');
    }
    if (res.statusCode >= 400) {
        throw new Error(((_a = res.data) === null || _a === void 0 ? void 0 : _a.message) || `HTTP ${res.statusCode}`);
    }
    return ((_c = (_b = res.data) === null || _b === void 0 ? void 0 : _b.data) !== null && _c !== void 0 ? _c : res.data);
}
async function put(path, body) {
    var _a, _b, _c;
    const res = await taro_1.default.request({
        url: `${BASE_URL}${path}`,
        method: 'PUT',
        data: body,
        header: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        timeout: DEFAULT_TIMEOUT_MS,
    });
    if (res.statusCode === 401) {
        handleUnauthorized();
        throw new Error('未登录');
    }
    if (res.statusCode >= 400) {
        throw new Error(((_a = res.data) === null || _a === void 0 ? void 0 : _a.message) || `HTTP ${res.statusCode}`);
    }
    return ((_c = (_b = res.data) === null || _b === void 0 ? void 0 : _b.data) !== null && _c !== void 0 ? _c : res.data);
}
//# sourceMappingURL=request.js.map