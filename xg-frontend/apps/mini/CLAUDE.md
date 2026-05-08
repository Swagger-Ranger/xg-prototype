# 小程序端设计纪律（CLAUDE.md）

> 本文件给 Claude Code（以及任何后续 AI 改动者）作为**硬约束**——动 mini app 任何页面 / 组件 / 样式前先过这份清单，落地前再过一遍。  
> 灵感借自 [`nexu-io/open-design` mobile-app skill](https://github.com/nexu-io/open-design/blob/main/skills/mobile-app/references/checklist.md)，针对 xg1 微信小程序 Taro 3 + React 重写。

## 技术栈速查

- **框架**：Taro 3 + React 18，写 `.tsx`
- **样式**：`.module.css`（CSS modules，避免全局污染）+ `var()` token（在 `app.css`）
- **单位**：rpx（750 设计稿，2× px → rpx；如 web 16px == mini 32rpx）
- **组件**：用 `View / Text / Image / ScrollView / Button` 等 Taro 组件，**禁止** `<div>` `<span>`
- **字体 token**（已经在 `app.css` 定义好）：
  - `var(--font-body)` —— 默认正文，sans
  - `var(--font-display)` —— **同族 sans + 负字距 + 600 字重**（不再用 serif，避免安卓微信回退糊掉）。用 `.display` 工具类，会自动加 `letter-spacing: -0.025em`
  - `var(--font-mono)` —— **数字等宽**，用 `.num` 工具类
- **tap-target token**：`var(--tap-min) = 88rpx`，工具类 `.tap-min`
- **设计语言基底**：Notion 风（暖中性灰 + 单 Notion 蓝 accent + whisper 1rpx 描边 + 多层弱阴影）。详见 `app.css` 顶部注释。

---

## P0 —— 必须通过（动了不过的话回退）

### 字体分层
- [ ] **页面主标题用 `.display`**（自动负字距 + 600 字重）。正文继续用 sans。  
      反例：`<View className={styles.pageTitle}>勤工助学</View>`（普通 sans，没层次）  
      正例：`<View className={`${styles.pageTitle} display`}>勤工助学</View>`
- [ ] **数字用 `--font-mono`**（通过 `.num`）—— 金额、计数、ID、日期都算。  
      反例：`¥1,234.00`（混在正文字体里）  
      正例：`<Text className="num">¥1,234.00</Text>`

### Accent 预算
- [ ] **整屏 accent 色（`--ac` 系列）≤ 2 处。** 通常：1 个 primary CTA + 1 个 active tab。其它一律降到灰阶。  
      反例：列表里每个状态 tag 都是蓝、AI 入口蓝、申请按钮蓝、tab 蓝 —— 没重点  
      正例：只有"申请"按钮强调蓝，其它状态用灰/绿/橙等中性表达
- [ ] **同一屏不允许出现 2 个不同色的"primary"按钮。** 想突出"次操作"用 ghost（透明 + 描边）。

### Tap target
- [ ] **任何可点元素最小尺寸 ≥ 88rpx（44px）。** 包括 icon-only 按钮、列表行触发区。  
      工具：套 `className="tap-min"` 或 css 直接 `min-height: var(--tap-min); min-width: var(--tap-min);`

### 文案规范
- [ ] **正文 ≥ 28rpx（14px）**；副文案最低 24rpx（12px）。再小拇指看不清。
- [ ] **不要 emoji 当 UI 元素**（"😀 申请成功"）。emoji 出现在用户输入的内容里 OK。

### 信息密度
- [ ] **一屏一职责**（"single screen single job"）。  
      表现：`workStudy 列表` 只列岗位 + 1 个搜索；不要又列岗位又塞表单  
      反面案例：`workStudyMatch` 同屏塞 7×3 时间格 + 类型 + 校区 + 时薪 + 关键词 → 该拆步骤
- [ ] **不放假数据/占位文案**。"标题 1 / 标题 2"、"$X,XXX"、"用户名" 这类必须替换成真实数据或语义占位（如"暂无数据"）。

---

## P1 —— 应该通过（值得回头改）

### 视觉层级
- [ ] **强对比留给正文，弱对比留给副信息。** 正文 `var(--fg)`，副 `var(--fg-3)`，禁止用过于浅的 `--fg-4/5` 当正文。
- [ ] **页面首屏的主操作必须可见**（不靠下滑）。把 CTA 推到屏幕外是错。

### 一致性
- [ ] **同类元素同一外观。** 所有列表行高一致；所有"申请"按钮风格一致。
- [ ] **状态用色对齐 token**：成功 `--ok`、警告 `--warn`、危险 `--danger`、accent 强调 `--ac`。不要新发明颜色。
- [ ] **圆角对齐 token**：`--r-xs` / `--r-sm` / `--r` / `--r-lg` / `--r-xl`，不要硬编码 `border-radius: 13rpx`。

### 真实内容
- [ ] **真名真事**："吴主管 · 信息中心"  比 "User Name" 强；"¥18.50/小时" 比 "¥X.XX/h" 强。

---

## P2 —— 能锦上添花

- [ ] 列表行点击有反馈动画（轻 scale 或浅色高亮）
- [ ] 长列表用 `ScrollView` 而非 `View` + 滚动（性能 + 下拉刷新）
- [ ] 网络空态、加载态、错误态三个都画了

---

## Archetype 速查（页面定位）

每个 mini 页**先认领一个 archetype**，再按对应模式做：

| Archetype | 用途 | xg1 mini 哪些页 |
|---|---|---|
| **Feed** | 列表 / inbox | `workStudy`（岗位列表）、`myApplications` |
| **Detail** | 单条详情 | `workStudyDetail` |
| **Onboarding** | 注册 / 引导 | `login` |
| **Profile** | 个人中心 | （待加） |
| **Checkout** | 多步表单 | `workStudyMatch` 拆步骤后 |
| **Focus** | 单一大数字 | `mySalaries` |

不同 archetype 有自己的布局规则——Feed 重信息密度，Detail 重内容呼吸，Checkout 重单步聚焦。**不要混搭**。

---

## 改动后自检（落地前再读一遍）

1. P0 全部 ✓ 了吗？
2. 这一屏的"主操作"是哪个？accent 给它了吗？其它降级了吗？
3. 数字都套 `.num` 了吗？标题都套 `.display` 了吗？
4. 用 `<View>` 不是 `<div>`？rpx 不是 px？
5. 真机预览一遍：拇指能点中所有按钮吗？文字看得清吗？

通过 → 提交。不通过 → 改完再来一次。
