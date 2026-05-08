-- 把「紧急联系人电话」纳入学生扩展信息字段，并给现有 demo 学生预填值。
-- 目的：请假等表单里再次出现该字段时，前端可以从 student_profile.extended_info
-- 自动回填，学生不用每次手填。
--
-- 1) field_definition 新增 emergency_contact，让 学生信息库 → 扩展信息 区块
--    自动渲染入口；admin 也能在「字段管理」页查看/编辑该元数据。
INSERT INTO field_definition (
    tenant_id, code, label, field_type, options, placeholder,
    required, sort_order, enabled
) VALUES (
    '${tenant_id}', 'emergency_contact', '紧急联系人电话', 'text', NULL,
    '11 位手机号，例如 13812345678',
    false, 5, true
)
ON CONFLICT (code) DO NOTHING;

-- 2) 给现有学生预填一个看起来像真实手机号的占位值：'138' + 学号末 8 位。
--    例如 student_no = '2023001001' → '13823001001'。仅在没有该字段时写入，
--    避免反复迁移覆盖人工修改过的值。模式仍满足 leave_v3 的 ^1[3-9]\d{9}$。
UPDATE student_profile
SET extended_info = COALESCE(extended_info, '{}'::jsonb)
                    || jsonb_build_object(
                           'emergency_contact',
                           '138' || RIGHT(student_no, 8)
                       )
WHERE NOT (COALESCE(extended_info, '{}'::jsonb) ? 'emergency_contact')
  AND student_no IS NOT NULL
  AND length(student_no) >= 8
  AND deleted_at IS NULL;
