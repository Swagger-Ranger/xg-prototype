import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import LeaveManagement from './index';
import { LeaveRulesPanel } from '@/pages/leaveConfig';
import LeaveReturnSettings from '@/pages/leaveConfig/LeaveReturnSettings';
import LeaveNoticeSettings from '@/pages/leaveConfig/LeaveNoticeSettings';

/**
 * 「请销假」应用容器。学生 / 辅导员只看到「请假列表」(原页面无 Tab bar);
 * 校管理员多出 3 个配置 tab,把原 /leave-config 里的子页全部并到这里。
 *
 * URL: /leave              → 列表
 *      /leave?tab=rule     → 请假规则
 *      /leave?tab=return   → 销假规则
 *      /leave?tab=notice   → 请假须知
 */
export default function LeaveAppPage() {
  const { hasPermission } = useAuth();
  const canConfig = hasPermission('leave:config');

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'list';

  if (!canConfig) {
    return <LeaveManagement />;
  }

  const listPanel = <LeaveManagement embedded />;

  const setTab = (k: string) => {
    const next = new URLSearchParams(searchParams);
    if (k === 'list') next.delete('tab');
    else next.set('tab', k);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      destroyInactiveTabPane
      items={[
        { key: 'list', label: '请假列表', children: listPanel },
        { key: 'rule', label: '请假规则', children: <LeaveRulesPanel /> },
        { key: 'return', label: '销假规则', children: <LeaveReturnSettings /> },
        { key: 'notice', label: '请假须知', children: <LeaveNoticeSettings /> },
      ]}
    />
  );
}
