-- A.1 Phase B：新 leave_v3 v9 — 6 假别 × 各假别独立审批分档。
--
-- 当前 v8 published 是简化的 "duration_check → counselor / dean /
-- student_affairs"，跟 leave_config_base.config v8 里的 6 假别 + 各自审批
-- 链不一致。LeaveService 现走 snapshotOverride 路径，YAML 只是 fallback。
--
-- 本次替换 YAML 让其成为真相：按 leave_type_code 分流到 6 条链，每条链
-- 按 duration_days 分档触发不同审批人。映射跟 leave_config_base v8 完全
-- 等价：
--
--   事假  0-2 班主任 / 2-4 +辅导员 / 4-7 +院系书记 / 7-28 +学校管理员
--   病假  0-3 辅导员 / 4-7 +院系书记 / 8+ +学校管理员
--   婚假  辅导员 → 院系书记（顺序，无分档）
--   因公  班主任 → 辅导员 → 院系书记（顺序）
--   实习  0-2 辅导员 / 2+ +院系书记
--   晚归  班主任（单档）
--
-- 老 v8 设 disabled，新 v9 published。partial unique index 同 (biz_type,
-- college_id) 仅一条 published —— Flyway 单事务内完成切换，不冲突。
--
-- 此时 LeaveService 还在走 snapshotOverride 路径（compiledChain 来自
-- leave_config_base），新 YAML 仍为 fallback。Phase C 才正式切。

UPDATE workflow_definition
   SET status = 'disabled', updated_at = NOW()
 WHERE biz_type = 'leave'
   AND status = 'published'
   AND COALESCE(college_id, -1) = -1;

INSERT INTO workflow_definition (id, tenant_id, code, name, version, biz_type, college_id, config_yaml, config_json, status, module)
VALUES (1010, '${tenant_id}', 'leave_v3', '请假审批', 9, 'leave', NULL,
$YAML$
code: leave_v3
name: 请假审批
module: leave
start: start
form:
  fields:
    - name: destination
      label: 目的地
      type: string
      widget: cascader
      required: true
      placeholder: 请选择省/市
    - name: emergency_contact_name
      label: 紧急联系人
      type: string
      required: false
      placeholder: 联系人姓名
    - name: emergency_contact
      label: 紧急联系人电话
      type: string
      required: true
      pattern: ^1[3-9]\d{9}$
nodes:
  - id: start
    type: form_submit
    name: 学生提交
    next: type_router

  - id: type_router
    type: condition
    name: 假别分流
    branches:
      - when: "leave_type_code == 'personal'"
        next: personal_class_master
      - when: "leave_type_code == 'sick'"
        next: sick_counselor
      - when: "leave_type_code == 'marriage'"
        next: marriage_counselor
      - when: "leave_type_code == 'official'"
        next: official_class_master
      - when: "leave_type_code == 'internship'"
        next: internship_counselor
      - when: "leave_type_code == 'late_return'"
        next: late_return_class_master
      - when: default
        next: rejected

  - id: personal_class_master
    type: approval
    name: 班主任审批
    assignee:
      role: class_master
      scope: same_class
    timeout:
      duration: 48h
    next: personal_check_2
    rejected_next: rejected

  - id: personal_check_2
    type: condition
    name: 事假≤2 天?
    branches:
      - when: "duration_days <= 2"
        next: approved
      - when: default
        next: personal_counselor

  - id: personal_counselor
    type: approval
    name: 辅导员审批
    assignee:
      role: counselor
      scope: same_class
    timeout:
      duration: 48h
    next: personal_check_4
    rejected_next: rejected

  - id: personal_check_4
    type: condition
    name: 事假≤4 天?
    branches:
      - when: "duration_days <= 4"
        next: approved
      - when: default
        next: personal_secretary

  - id: personal_secretary
    type: approval
    name: 院系书记审批
    assignee:
      role: college_secretary
      scope: same_college
    timeout:
      duration: 72h
    next: personal_check_7
    rejected_next: rejected

  - id: personal_check_7
    type: condition
    name: 事假≤7 天?
    branches:
      - when: "duration_days <= 7"
        next: approved
      - when: default
        next: personal_school

  - id: personal_school
    type: approval
    name: 学校管理员审批
    assignee:
      role: school_admin
      scope: global
    timeout:
      duration: 72h
    next: approved
    rejected_next: rejected

  - id: sick_counselor
    type: approval
    name: 辅导员审批
    assignee:
      role: counselor
      scope: same_class
    timeout:
      duration: 48h
    next: sick_check_3
    rejected_next: rejected

  - id: sick_check_3
    type: condition
    name: 病假≤3 天?
    branches:
      - when: "duration_days <= 3"
        next: approved
      - when: default
        next: sick_secretary

  - id: sick_secretary
    type: approval
    name: 院系书记审批
    assignee:
      role: college_secretary
      scope: same_college
    timeout:
      duration: 72h
    next: sick_check_7
    rejected_next: rejected

  - id: sick_check_7
    type: condition
    name: 病假≤7 天?
    branches:
      - when: "duration_days <= 7"
        next: approved
      - when: default
        next: sick_school

  - id: sick_school
    type: approval
    name: 学校管理员审批
    assignee:
      role: school_admin
      scope: global
    timeout:
      duration: 72h
    next: approved
    rejected_next: rejected

  - id: marriage_counselor
    type: approval
    name: 辅导员审批
    assignee:
      role: counselor
      scope: same_class
    timeout:
      duration: 48h
    next: marriage_secretary
    rejected_next: rejected

  - id: marriage_secretary
    type: approval
    name: 院系书记审批
    assignee:
      role: college_secretary
      scope: same_college
    timeout:
      duration: 72h
    next: approved
    rejected_next: rejected

  - id: official_class_master
    type: approval
    name: 班主任审批
    assignee:
      role: class_master
      scope: same_class
    timeout:
      duration: 48h
    next: official_counselor
    rejected_next: rejected

  - id: official_counselor
    type: approval
    name: 辅导员审批
    assignee:
      role: counselor
      scope: same_class
    timeout:
      duration: 48h
    next: official_secretary
    rejected_next: rejected

  - id: official_secretary
    type: approval
    name: 院系书记审批
    assignee:
      role: college_secretary
      scope: same_college
    timeout:
      duration: 72h
    next: approved
    rejected_next: rejected

  - id: internship_counselor
    type: approval
    name: 辅导员审批
    assignee:
      role: counselor
      scope: same_class
    timeout:
      duration: 48h
    next: internship_check
    rejected_next: rejected

  - id: internship_check
    type: condition
    name: 实习≤2 天?
    branches:
      - when: "duration_days <= 2"
        next: approved
      - when: default
        next: internship_secretary

  - id: internship_secretary
    type: approval
    name: 院系书记审批
    assignee:
      role: college_secretary
      scope: same_college
    timeout:
      duration: 72h
    next: approved
    rejected_next: rejected

  - id: late_return_class_master
    type: approval
    name: 班主任审批
    assignee:
      role: class_master
      scope: same_class
    timeout:
      duration: 24h
    next: approved
    rejected_next: rejected

  - id: approved
    type: end
    name: 通过
    status: completed

  - id: rejected
    type: end
    name: 驳回
    status: rejected
$YAML$,
$JSON$
{"code":"leave_v3","name":"请假审批","module":"leave","start":"start","form":{"fields":[{"name":"destination","label":"目的地","type":"string","widget":"cascader","required":true,"placeholder":"请选择省/市"},{"name":"emergency_contact_name","label":"紧急联系人","type":"string","required":false,"placeholder":"联系人姓名"},{"name":"emergency_contact","label":"紧急联系人电话","type":"string","required":true,"pattern":"^1[3-9]\\d{9}$"}]},"nodes":[{"id":"start","type":"form_submit","name":"学生提交","next":"type_router"},{"id":"type_router","type":"condition","name":"假别分流","branches":[{"when":"leave_type_code == 'personal'","next":"personal_class_master"},{"when":"leave_type_code == 'sick'","next":"sick_counselor"},{"when":"leave_type_code == 'marriage'","next":"marriage_counselor"},{"when":"leave_type_code == 'official'","next":"official_class_master"},{"when":"leave_type_code == 'internship'","next":"internship_counselor"},{"when":"leave_type_code == 'late_return'","next":"late_return_class_master"},{"when":"default","next":"rejected"}]},{"id":"personal_class_master","type":"approval","name":"班主任审批","assignee":{"role":"class_master","scope":"same_class"},"timeout":{"duration":"48h"},"next":"personal_check_2","rejected_next":"rejected"},{"id":"personal_check_2","type":"condition","name":"事假≤2 天?","branches":[{"when":"duration_days <= 2","next":"approved"},{"when":"default","next":"personal_counselor"}]},{"id":"personal_counselor","type":"approval","name":"辅导员审批","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"personal_check_4","rejected_next":"rejected"},{"id":"personal_check_4","type":"condition","name":"事假≤4 天?","branches":[{"when":"duration_days <= 4","next":"approved"},{"when":"default","next":"personal_secretary"}]},{"id":"personal_secretary","type":"approval","name":"院系书记审批","assignee":{"role":"college_secretary","scope":"same_college"},"timeout":{"duration":"72h"},"next":"personal_check_7","rejected_next":"rejected"},{"id":"personal_check_7","type":"condition","name":"事假≤7 天?","branches":[{"when":"duration_days <= 7","next":"approved"},{"when":"default","next":"personal_school"}]},{"id":"personal_school","type":"approval","name":"学校管理员审批","assignee":{"role":"school_admin","scope":"global"},"timeout":{"duration":"72h"},"next":"approved","rejected_next":"rejected"},{"id":"sick_counselor","type":"approval","name":"辅导员审批","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"sick_check_3","rejected_next":"rejected"},{"id":"sick_check_3","type":"condition","name":"病假≤3 天?","branches":[{"when":"duration_days <= 3","next":"approved"},{"when":"default","next":"sick_secretary"}]},{"id":"sick_secretary","type":"approval","name":"院系书记审批","assignee":{"role":"college_secretary","scope":"same_college"},"timeout":{"duration":"72h"},"next":"sick_check_7","rejected_next":"rejected"},{"id":"sick_check_7","type":"condition","name":"病假≤7 天?","branches":[{"when":"duration_days <= 7","next":"approved"},{"when":"default","next":"sick_school"}]},{"id":"sick_school","type":"approval","name":"学校管理员审批","assignee":{"role":"school_admin","scope":"global"},"timeout":{"duration":"72h"},"next":"approved","rejected_next":"rejected"},{"id":"marriage_counselor","type":"approval","name":"辅导员审批","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"marriage_secretary","rejected_next":"rejected"},{"id":"marriage_secretary","type":"approval","name":"院系书记审批","assignee":{"role":"college_secretary","scope":"same_college"},"timeout":{"duration":"72h"},"next":"approved","rejected_next":"rejected"},{"id":"official_class_master","type":"approval","name":"班主任审批","assignee":{"role":"class_master","scope":"same_class"},"timeout":{"duration":"48h"},"next":"official_counselor","rejected_next":"rejected"},{"id":"official_counselor","type":"approval","name":"辅导员审批","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"official_secretary","rejected_next":"rejected"},{"id":"official_secretary","type":"approval","name":"院系书记审批","assignee":{"role":"college_secretary","scope":"same_college"},"timeout":{"duration":"72h"},"next":"approved","rejected_next":"rejected"},{"id":"internship_counselor","type":"approval","name":"辅导员审批","assignee":{"role":"counselor","scope":"same_class"},"timeout":{"duration":"48h"},"next":"internship_check","rejected_next":"rejected"},{"id":"internship_check","type":"condition","name":"实习≤2 天?","branches":[{"when":"duration_days <= 2","next":"approved"},{"when":"default","next":"internship_secretary"}]},{"id":"internship_secretary","type":"approval","name":"院系书记审批","assignee":{"role":"college_secretary","scope":"same_college"},"timeout":{"duration":"72h"},"next":"approved","rejected_next":"rejected"},{"id":"late_return_class_master","type":"approval","name":"班主任审批","assignee":{"role":"class_master","scope":"same_class"},"timeout":{"duration":"24h"},"next":"approved","rejected_next":"rejected"},{"id":"approved","type":"end","name":"通过","status":"completed"},{"id":"rejected","type":"end","name":"驳回","status":"rejected"}]}

$JSON$::jsonb,
'published', 'leave')
ON CONFLICT (id) DO NOTHING;
