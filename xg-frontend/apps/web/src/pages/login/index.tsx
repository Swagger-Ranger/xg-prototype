import { Card, Spin } from 'antd';
import { message } from '@/utils/antdApp';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RoleCode } from '@xg1/shared';
import { login as loginApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth.store';
import ZhaoxiLogo from '@/components/brand/ZhaoxiLogo';
import SkyScene from './SkyScene';
import FloatingSymbols from './FloatingSymbols';
import { currentPhase, phaseLabel } from './scene-time';
import styles from './index.module.css';

interface QuickAccount {
  username: string;
  display: string;
  roleLabel: string;
  role: RoleCode;
  color: string;
}

// Passwords are seeded in V022; every demo account shares the default.
const DEFAULT_PASSWORD = 'xg@123456';

// 演示用快速登录账号。前两个是核心请假流程主角（学生提交 → 班主任审批），
// 其余覆盖审批链上游 + 系统管理 + 用工单位等场景。
const QUICK_ACCOUNTS: QuickAccount[] = [
  { username: 'stu_zhang',      display: '张晓明', roleLabel: '学生',     role: 'student',                 color: '#1677ff' },
  { username: 'monitor1',       display: '陈班长', roleLabel: '班长',     role: 'class_monitor',           color: '#2f9e44' },
  { username: 'master1',        display: '孙班主任', roleLabel: '班主任', role: 'class_master',            color: '#fa8c16' },
  { username: 'counselor_li',   display: '李老师', roleLabel: '辅导员',   role: 'counselor',               color: '#52c41a' },
  { username: 'college_admin1', display: '钱院管', roleLabel: '院系管理', role: 'college_admin',           color: '#13c2c2' },
  { username: 'dean1',          display: '赵院长', roleLabel: '院系领导', role: 'dean',                    color: '#fa541c' },
  { username: 'officer1',       display: '周学工', roleLabel: '学工处',   role: 'student_affairs_officer', color: '#eb2f96' },
  { username: 'employer1',      display: '吴主管', roleLabel: '用工单位', role: 'employer',                color: '#a0522d' },
  { username: 'admin1',         display: '王管理', roleLabel: '校管理员', role: 'school_admin',            color: '#722ed1' },
];

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [phase, setPhase] = useState<number>(() => currentPhase());

  const loginAs = async (acc: QuickAccount) => {
    if (pendingUser) return;
    setPendingUser(acc.username);
    try {
      const { token, user } = await loginApi({
        username: acc.username,
        password: DEFAULT_PASSWORD,
        tenant_id: 'default',
      });
      setAuth(token, user);
      message.success(t('login.successAs', { name: acc.display, role: acc.roleLabel }));
      // employer 没有工作台权限，登陆后直接跳到唯一开放的勤工助学。
      navigate(acc.role === 'employer' ? '/work-study' : '/workspace');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.failureFallback');
      message.error(msg);
    } finally {
      setPendingUser(null);
    }
  };

  // 用 ref 持有最新 loginAs，避免 keydown 闭包过期
  const loginAsRef = useRef(loginAs);
  loginAsRef.current = loginAs;

  // 1-9 键盘直登
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 焦点在输入框时不抢
      const ae = document.activeElement;
      if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = parseInt(e.key, 10);
      if (Number.isInteger(k) && k >= 1 && k <= QUICK_ACCOUNTS.length) {
        const acc = QUICK_ACCOUNTS[k - 1];
        if (acc) loginAsRef.current(acc);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 时刻指示：每秒采样一次相位
  useEffect(() => {
    const id = setInterval(() => setPhase(currentPhase()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.container}>
      <SkyScene />
      <FloatingSymbols />
      <div className={styles.timeIndicator}>{phaseLabel(phase)}</div>
      <Card className={styles.card}>
        <div className={styles.logo}>
          <ZhaoxiLogo size={56} />
          <h1>{t('app.name')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
        <div className={styles.roleHint}>{t('login.quickLoginHint', { password: DEFAULT_PASSWORD })}</div>
        <div className={styles.roleGrid}>
          {QUICK_ACCOUNTS.map((acc, idx) => (
            <button
              key={acc.username}
              className={styles.roleBtn}
              style={{ '--role-color': acc.color } as React.CSSProperties}
              onClick={() => loginAs(acc)}
              disabled={pendingUser !== null}
            >
              <span className={styles.kbdBadge} aria-hidden="true">{idx + 1}</span>
              <span className={styles.roleAvatar}>
                {pendingUser === acc.username ? <Spin size="small" /> : acc.display[0]}
              </span>
              <span className={styles.roleName}>{acc.display}</span>
              <span className={styles.roleLabel}>{acc.roleLabel}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
