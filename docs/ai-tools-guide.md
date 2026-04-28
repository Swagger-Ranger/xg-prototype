# AI 工具使用指南（勤工助学）

> 给运营 / 学工 / 资助中心 / 用工单位同学读。每个工具都标了**谁能用**和**怎么触发**。
> 调用机制有 3 条：
> 1. **自然语言**：直接在 AI 面板说话，LLM 会挑工具
> 2. **快捷 chip**：在 `/work-study` 页面右侧 AI 面板的快捷键
> 3. **直接调用**（开发/调试）：`POST /api/v1/tools/{tool_name}/execute`

7 个勤工助学专用工具一览：

| 工具 | 角色 | 一句话用途 |
|---|---|---|
| `find_workstudy_positions_by_preference` | 学生 | 按偏好筛岗位（自带资格预筛） |
| `match_workstudy_positions_to_schedule` | 学生 | 按空余时间匹配岗位（覆盖度排序） |
| `draft_workstudy_application_intro` | 学生 | 申请理由草稿生成 |
| `summarize_workstudy_applicants` | 用工/学工/管理员 | 候选人对比卡 |
| `detect_workstudy_salary_anomaly` | 资助中心/学工/管理员 | 月度薪资异常扫描 |
| `suggest_workstudy_position_template` | 用工/学工/管理员 | 历史岗位 → 新岗位模板建议 |
| `workstudy_dashboard_brief` | 全角色 | 按角色播报今日总览 |

文案集中在 `xg-ai/app/tool/workstudy_prompts.py`，管理员改语气**只需改这个文件**，不用动业务逻辑。

---

## 1. find_workstudy_positions_by_preference

**学生侧**·把"我想找周二下午图书馆类、不低于 15 元/时"这种自然语言变成结构化筛选。
后端在 SQL 阶段已自动叠加性别/年级/学院/困难等级/在岗上限——所以返回的都是**真能申请的岗位**。

### 自然语言示例（在 AI 面板）
> "帮我找几个周三下午能干、薪资不低于 15 的勤工助学岗位"
> "我想找在新校区、不限性别的临时岗"

### 直接调用
```bash
curl -X POST http://localhost:8001/api/v1/tools/find_workstudy_positions_by_preference/execute \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 100' -H 'X-Tenant-Id: default' -H 'X-User-Role: student' \
  -d '{"args":{"keyword":"图书馆","min_rate":15,"campus":"本部"}}'
```

参数：`keyword` / `position_type` (`fixed`/`temporary`) / `min_rate` / `campus`，**全部可选**。

### 典型输出
```
找到 3 个匹配岗位（最多展示 8 个）：
- #2046... 图书馆值班（图书馆，临时岗），¥18.00/时，已招 0/2，校区：本部
- ...
（如要进一步看时间是否冲突，调用 match_workstudy_positions_to_schedule。）
```

---

## 2. match_workstudy_positions_to_schedule

**学生侧**·按空余时间段匹配岗位，按"时间覆盖率"降序排。**无时间要求**的岗位排中间分。

### 自然语言示例
> "我周一下午 14-17、周三下午 14-17、周五全天有空，按时间帮我匹配岗位"

### 直接调用
```bash
curl -X POST http://localhost:8001/api/v1/tools/match_workstudy_positions_to_schedule/execute \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 100' -H 'X-Tenant-Id: default' -H 'X-User-Role: student' \
  -d '{"args":{"free_slots":[
    {"day":"mon","start":"14:00","end":"17:00"},
    {"day":"wed","start":"14:00","end":"17:00"}
  ]}}'
```

`free_slots` 必填；day 取 `mon`/`tue`/`wed`/`thu`/`fri`/`sat`/`sun`。

---

## 3. draft_workstudy_application_intro

**学生侧**·基于岗位详情拼一段 200-300 字的申请理由初稿。**确定性模板**，不调外部 LLM——
管理员改 prompt 就能换语气；学生收到后**方括号【】部分需要自己补**。

### Web/Mini 触发
- Mini app 详情页底部"🤖 让 AI 帮我写"按钮直调
- Web AI 面板说"帮我给岗位 #X 写一段申请理由"

### 直接调用
```bash
curl -X POST http://localhost:8001/api/v1/tools/draft_workstudy_application_intro/execute \
  -H 'Content-Type: application/json' -H 'X-User-Id: 100' -H 'X-Tenant-Id: default' -H 'X-User-Role: student' \
  -d '{"args":{"position_id":42,"student_brief":"软件工程 2023 级，有图书馆志愿者经验"}}'
```

`student_brief` 选填——传了会用来生成更个性化的开头段；不传就模板化。

### 典型输出
```
📝 申请理由草稿（请按需修改后提交）：

尊敬的图书馆负责老师：
您好，我希望申请《图书馆值班》（临时岗）。

软件工程 2023 级，有图书馆志愿者经验。

我注意到岗位要求：细心、有责任心、能熟练使用借阅系统 我相信我可以胜任，原因是【请在此补充 1-2 句你的相关经验或兴趣】。
...

—— 草稿结束。注意：方括号【】中的部分需要你自己补充；如需更口语化或更书面化，告诉我"用更口语/书面的语气重写"。
```

---

## 4. summarize_workstudy_applicants

**用工 / 学工 / 辅导员**·把岗位的所有申请压成对比卡：审批中/已录用/已拒绝计数 + 审批中候选人的姓名/困难等级/申请理由摘要。

### Web 快捷触发（推荐）
1. `/work-study` → 岗位 tab → 任意行的"对比卡"按钮（实际是 AskAIChip，已 autoSend）
2. 或：先 Pin 岗位（详情 Drawer 顶部"📌 Pin 到 AI 面板"），再点 chip "🤖 候选对比卡"

### 自然语言
> "把岗位 #2046 的所有申请做个候选人对比"

### 典型输出
```
岗位 #2046 申请总览：共 5 份（审批中 3 / 已录用 1 / 已拒绝 1）。
审批中候选对比卡：
- 申请 #11 王小明，困难等级：困难，提交于 2026-04-20
  申请理由：有图书馆志愿者经验，时间充裕…
- ...
```

---

## 5. detect_workstudy_salary_anomaly

**资助中心 / 学工 / 管理员**·扫描某月薪资申报，按 `position_id` 历史均值×阈值标异常。
**历史样本 < 2 条的岗位会跳过**（无法判断基线），避免误报新岗位。

### 自然语言
> "扫一下这个月薪资有没有异常的"
> "用 1.5 倍阈值扫 2026 年 4 月的薪资异常"

### 直接调用
```bash
curl -X POST http://localhost:8001/api/v1/tools/detect_workstudy_salary_anomaly/execute \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 1' -H 'X-Tenant-Id: default' -H 'X-User-Role: aid_center_officer' \
  -d '{"args":{"month":"2026-04","threshold_factor":1.5}}'
```

`month` 不传 = 全部月份；`threshold_factor` 默认 1.5。

### 工作流位置
**审批前用**——先扫描 → 异常的人工复核 → 没问题的批量审批通过。

---

## 6. suggest_workstudy_position_template

**用工 / 学工 / 管理员**·基于历史岗位（可按 employer 过滤）汇总主流类型/单位/均薪/工时/校区，
给出新岗位发布的模板建议。最适合**同步上一学年**和**新单位首次发布**两个场景。

### 直接调用
```bash
curl -X POST http://localhost:8001/api/v1/tools/suggest_workstudy_position_template/execute \
  -H 'Content-Type: application/json' \
  -H 'X-User-Id: 1' -H 'X-Tenant-Id: default' -H 'X-User-Role: student_affairs_officer' \
  -d '{"args":{"employer_id":7}}'
```

### 典型输出
```
基于 12 个历史岗位（employer #7），建议新岗位模板：
- 类型：固定岗（历史占比最高）
- 薪资：¥18.50 / 时（10 条样本均值）
- 周工时：10 小时（中位数）
- 招聘人数：2 人（中位数）
- 主校区：本部
（具体描述/任职要求/设岗理由仍需用工单位补充。）
```

---

## 7. workstudy_dashboard_brief

**全角色**·总览播报。**自动按角色切换口径**——同一个工具，学生看到的是"我能申请几个 / 我交了几份"，
资助中心看到的是"待审批薪资几条 / 异常提示"，用工/学工看到的是"在招/已闭/待审/待结算"。

### Web 快捷触发
- `/work-study` → 总览 tab 的"一键 AI 播报"按钮（已配 autoSend）
- 学生侧 dashboard 也有"让 AI 总结"按钮

### 自然语言
> "今天勤工助学这边怎么样？"
> "用 workstudy_dashboard_brief 给我看下"

### 角色样例
**学生**：
```
当前学校共 12 个你能申请的在招岗位。你已提交申请 3 份，其中审批中 1、已录用 1。
```
**资助中心**：
```
待审批薪资 5 条，已确认 100 条。
建议：先调用 detect_workstudy_salary_anomaly 扫一遍异常，再批量审批。
```
**学工/用工/管理员**（默认）：
```
在招岗位 12 个，已关闭 5 个。
待审批申请 3 条，待审批薪资 7 条。
建议：申请超过 5 条时先用 summarize_workstudy_applicants(position_id) 看候选对比卡再批。
```

---

## 配置 / 调语气

文案在 `xg-ai/app/tool/workstudy_prompts.py`，**不需要改业务逻辑**：

```python
# 比如把草稿开头改得更亲切：
DRAFT_OPENING = "嗨{dept}的老师：\n我想申请《{title}》{ptype_suffix}哦～"
```

修改后**重启 sidecar**（`python -m app`）即生效，不需要重新部署。

模板字符串里的 `{xxx}` 是占位符，**不能改**——改了对应工具会 KeyError。

## 多语言（i18n）

`workstudy_prompts.py` 同时维护 zh（顶部 module 级常量）+ EN（底部 `EN` 字典）两套。

通过 HTTP 头 **`X-User-Lang: en`** 即可切到英文：
```bash
curl -X POST http://localhost:8001/api/v1/tools/workstudy_dashboard_brief/execute \
  -H 'X-User-Id: 100' -H 'X-Tenant-Id: default' -H 'X-User-Role: student' \
  -H 'X-User-Lang: en' \
  -H 'Content-Type: application/json' -d '{"args":{}}'
# → "There are 12 positions you can apply to right now. ..."
```

**当前接通状态**：

| 层 | i18n | 入口 |
|---|---|---|
| 全 7 个勤工助学工具 | ✅ | 直执行 (`/tools/.../execute`) + chat 流 (`/chat`) |
| chat.py SYSTEM_PROMPT | ✅ | `/chat`：`user_lang=en` 时 LLM 看到的系统指令、角色/页面标签、refs 提示、动作回复都切英文 |

调用方式：
- **直执行**：HTTP 头 `X-User-Lang: en`
- **chat 流**：`X-User-Lang: en` 头 **或** ChatRequest 里 `user_lang: "en"` 字段（字段优先）

EN 缺译时自动 fallback 到 zh，不会 raise。未识别的 lang（如 `"fr"`）也按 zh 处理。

要新增第 8 个支持 i18n 的工具：
```python
# 在工具函数顶部
lang = ctx.get("user_lang", "zh")
# 所有面向用户的字符串改成
ws_p.t("KEY_NAME", lang).format(...)
```

## 工具触发不到？

1. **role 不对** → AI 拒绝调用
   - 学生只能看到 student-only 工具（find / match / draft）
   - 用工/学工才看得到 staff-only（summarize / anomaly / suggest）
2. **chat.py 让 LLM 自己挑工具，模型挑错时**：在 prompt 里**点名工具名**，比如 "用 detect_workstudy_salary_anomaly 扫一下"
3. **测试是否真在调用**：看 `xg-ai` stderr 日志，每次 tool 调用会留 INFO 行

更全面的服务/数据库/Flyway 排错见 `docs/runbook.md`。
