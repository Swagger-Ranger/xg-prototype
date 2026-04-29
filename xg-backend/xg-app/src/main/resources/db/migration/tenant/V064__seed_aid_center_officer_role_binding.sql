-- V055 (now seeding aid_center_officer at sys_role.id=9 per Q3 fix) introduces
-- the role but no migration ever bound it to a user. The 1007 salary workflow
-- assigns approval tasks to "global aid_center_officer" — with zero users in
-- that role, those tasks have no recipient.
--
-- Bind the aid_center_officer role to the existing student_affairs_officer
-- (officer1, role binding seeded by V022). In a real deployment ops can
-- create a dedicated 资助中心 user later via the admin UI; this binding just
-- ensures the salary path has *some* approver out of the box.

INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id
  FROM sys_user u
  JOIN sys_role r ON r.code = 'aid_center_officer'
 WHERE u.username = 'officer1'
ON CONFLICT (user_id, role_id) DO NOTHING;
