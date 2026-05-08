-- 在 学生信息库 → 扩展信息 增加「紧急联系人」（姓名）字段。与已存在的
-- 「紧急联系人电话」(V065) 配套。sort_order=4 让姓名排在电话(5)之前。
INSERT INTO field_definition (
    tenant_id, code, label, field_type, options, placeholder,
    required, sort_order, enabled
) VALUES (
    '${tenant_id}', 'emergency_contact_name', '紧急联系人', 'text', NULL,
    '联系人姓名，例如 张爸爸',
    false, 4, true
)
ON CONFLICT (code) DO NOTHING;

-- 给已有学生预填一个可读的占位值：取 sys_user.real_name 的姓 + '家长'，
-- 例如 real_name='张三' → '张家长'。仅在该字段尚未设置时写入，幂等。
UPDATE student_profile sp
SET extended_info = COALESCE(sp.extended_info, '{}'::jsonb)
                    || jsonb_build_object(
                           'emergency_contact_name',
                           SUBSTR(u.real_name, 1, 1) || '家长'
                       )
FROM sys_user u
WHERE u.id = sp.user_id
  AND u.real_name IS NOT NULL
  AND length(u.real_name) >= 1
  AND NOT (COALESCE(sp.extended_info, '{}'::jsonb) ? 'emergency_contact_name')
  AND sp.deleted_at IS NULL;
