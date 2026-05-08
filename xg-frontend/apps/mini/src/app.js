"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const AIChatDrawer_1 = __importDefault(require("./components/AIChatDrawer"));
require("./app.css");
/* AIChatDrawer 必须挂在 App 层（即每个 page 的根），不能挂在 custom-tab-bar 里。
 * 原因：mini-app 的 custom-tab-bar 在系统专属区域渲染，里面的 position:fixed
 * 会被限制在 tab bar 的可视区域，导致全屏 overlay 失效（看起来"透明"）。
 */
function App({ children }) {
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [children, (0, jsx_runtime_1.jsx)(AIChatDrawer_1.default, {})] }));
}
exports.default = App;
//# sourceMappingURL=app.js.map