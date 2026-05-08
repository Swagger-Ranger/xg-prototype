import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Tag } from 'antd';
import { message } from '@/utils/antdApp';
import { EditOutlined, KeyOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import {
  changeMyPassword,
  updateMyProfile,
  type UpdateMyProfilePayload,
} from '@/api/auth';
import { useAuthStore } from '@/stores/auth.store';
import { describeApiError } from '@/utils/api-error';
import UserAvatar from '@/components/avatar/UserAvatar';
import styles from './index.module.css';

const ROLE_LABELS: Record<string, string> = {
  student: '学生',
  counselor: '辅导员',
  college_admin: '学院管理员',
  dean: '院系领导',
  student_affairs_officer: '学工处',
  school_admin: '校级管理员',
  super_admin: '超级管理员',
  employer: '用人单位',
};

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  unknown: '未填写',
};

const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '未填写', value: 'unknown' },
];

interface ProfileEditValues {
  email: string;
  phone: string;
  gender: string;
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [editing, setEditing] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [profileForm] = Form.useForm<ProfileEditValues>();
  const [pwdForm] = Form.useForm<{ oldPassword: string; newPassword: string; confirm: string }>();

  // Refresh form whenever the cached user changes (e.g. someone returns to
  // the page after editing) so initialValues stay in sync.
  useEffect(() => {
    if (!editing && user) {
      profileForm.setFieldsValue({
        email: user.email ?? '',
        phone: user.phone ?? '',
        gender: user.gender ?? '',
      });
    }
  }, [user, editing, profileForm]);

  const profileMutation = useMutation({
    mutationFn: (payload: UpdateMyProfilePayload) => updateMyProfile(payload),
    onSuccess: (updated) => {
      setUser(updated);
      setEditing(false);
      message.success('资料已更新');
    },
    onError: (e: unknown) => message.error(describeApiError(e, '更新失败，请重试')),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      changeMyPassword(oldPassword, newPassword),
    onSuccess: () => {
      message.success('密码已修改，下次登录请使用新密码');
      setPwdOpen(false);
      pwdForm.resetFields();
    },
    onError: (e: unknown) => message.error(describeApiError(e, '修改密码失败')),
  });

  if (!user) return null;

  const genderLabel = user.gender ? GENDER_LABELS[user.gender] ?? user.gender : '未填写';
  const roleTags = (user.role_codes ?? []).map((c) => ROLE_LABELS[c] ?? c);

  const handleProfileSubmit = (values: ProfileEditValues) => {
    profileMutation.mutate({
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      gender: values.gender || null,
    });
  };

  const startEdit = () => {
    profileForm.setFieldsValue({
      email: user.email ?? '',
      phone: user.phone ?? '',
      gender: user.gender ?? '',
    });
    setEditing(true);
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>个人中心</h1>

      <div className={styles.hero}>
        <UserAvatar
          avatarUrl={user.avatar_url}
          seed={user.id}
          name={user.real_name ?? user.username}
          size={72}
          className={styles.avatar}
        />
        <div className={styles.heroBody}>
          <div className={styles.heroName}>{user.real_name || user.username}</div>
          <div className={styles.heroMeta}>
            <span>@{user.username}</span>
            {roleTags.length > 0 && (
              <>
                <span className={styles.heroMetaSep}>·</span>
                <span className={styles.tagList}>
                  {roleTags.map((label) => (
                    <Tag key={label} color="processing" style={{ margin: 0 }}>
                      {label}
                    </Tag>
                  ))}
                </span>
              </>
            )}
            <span className={styles.heroMetaSep}>·</span>
            <span>{user.tenant_name || user.tenant_id}</span>
          </div>
        </div>
      </div>

      {/* 基本资料 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>基本资料</span>
          {!editing && (
            <Button size="small" icon={<EditOutlined />} onClick={startEdit}>
              编辑
            </Button>
          )}
        </div>
        <div className={styles.cardBody}>
          {/* Read-only fields stay in display mode in both branches — they're
              never editable. The editable trio (email/phone/gender) flips to
              inputs when 编辑 is clicked. */}
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>用户名</span>
            <span className={`${styles.fieldValue} ${styles.code}`}>{user.username}</span>
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>姓名</span>
            <span className={styles.fieldValue}>{user.real_name || '-'}</span>
          </div>

          {!editing ? (
            <>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>邮箱</span>
                <span className={`${styles.fieldValue} ${user.email ? '' : styles.muted}`}>
                  {user.email || '未填写'}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>手机号</span>
                <span className={`${styles.fieldValue} ${user.phone ? '' : styles.muted}`}>
                  {user.phone || '未填写'}
                </span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>性别</span>
                <span className={`${styles.fieldValue} ${user.gender ? '' : styles.muted}`}>
                  {genderLabel}
                </span>
              </div>
            </>
          ) : (
            <Form form={profileForm} onFinish={handleProfileSubmit} layout="horizontal" className={styles.editGrid}>
              <Form.Item
                name="email"
                label={<span className={styles.editLabel}>邮箱</span>}
                colon={false}
                rules={[{ type: 'email', message: '邮箱格式不正确' }]}
                style={{ display: 'contents' }}
              >
                <Input placeholder="example@school.edu" allowClear />
              </Form.Item>
              <Form.Item
                name="phone"
                label={<span className={styles.editLabel}>手机号</span>}
                colon={false}
                rules={[
                  {
                    pattern: /^[+\d\-\s]{6,32}$/,
                    message: '手机号格式不正确',
                  },
                ]}
                style={{ display: 'contents' }}
              >
                <Input placeholder="13800138000" allowClear />
              </Form.Item>
              <Form.Item
                name="gender"
                label={<span className={styles.editLabel}>性别</span>}
                colon={false}
                style={{ display: 'contents' }}
              >
                <Select placeholder="选择性别" options={GENDER_OPTIONS} allowClear />
              </Form.Item>
            </Form>
          )}

          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>角色</span>
            <span className={styles.fieldValue}>
              {roleTags.length > 0 ? (
                <span className={styles.tagList}>
                  {roleTags.map((l) => (
                    <Tag key={l} style={{ margin: 0 }}>{l}</Tag>
                  ))}
                </span>
              ) : (
                <span className={styles.muted}>未分配</span>
              )}
            </span>
          </div>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>租户</span>
            <span className={styles.fieldValue}>{user.tenant_name || user.tenant_id}</span>
          </div>

          {editing && (
            <div className={styles.editActions}>
              <Button onClick={() => setEditing(false)}>取消</Button>
              <Button
                type="primary"
                loading={profileMutation.isPending}
                onClick={() => profileForm.submit()}
              >
                保存
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 安全 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>安全</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.securityRow}>
            <div>
              <div className={styles.securityLabel}>登录密码</div>
              <div className={styles.securityHint}>建议每 90 天更换一次，长度 8-64 位</div>
            </div>
            <Button icon={<KeyOutlined />} onClick={() => setPwdOpen(true)}>
              修改密码
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={pwdOpen}
        title="修改密码"
        onCancel={() => { setPwdOpen(false); pwdForm.resetFields(); }}
        onOk={() => pwdForm.submit()}
        okText="确认修改"
        cancelText="取消"
        okButtonProps={{ loading: passwordMutation.isPending }}
        destroyOnHidden
      >
        <Form
          form={pwdForm}
          layout="vertical"
          onFinish={(v) => passwordMutation.mutate({ oldPassword: v.oldPassword, newPassword: v.newPassword })}
          autoComplete="off"
        >
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: '请输入原密码' }]}
          >
            <Input.Password placeholder="请输入当前登录密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, max: 64, message: '长度需在 8-64 位之间' },
            ]}
          >
            <Input.Password placeholder="8-64 位，建议混合字母 / 数字 / 符号" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
