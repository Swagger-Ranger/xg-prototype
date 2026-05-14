import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs } from 'antd';
import SchoolInfoSection from './SchoolInfoSection';
import TermsSection from './TermsSection';
import EventsSection from './EventsSection';
import SchedulesSection from './SchedulesSection';
import OrgAssignmentPanel from '../OrgAssignmentPanel';

/**
 * "基础设置" inside the system management page. Houses tenant-level config
 * an admin needs to maintain: 学校所在地, 学期, 考试 / 假期, 班级课表.
 * Sub-tabs keep each section focused — each section owns its own queries
 * + mutations.
 */
export default function SettingsPanel() {
  const [activeKey, setActiveKey] = useState('school');
  const navigate = useNavigate();
  return (
    <Tabs
      activeKey={activeKey}
      onChange={(k) => {
        // 「数据初始化」是整页向导，不内嵌 — 直接跳独立路由
        if (k === 'import') {
          navigate('/data-import');
          return;
        }
        setActiveKey(k);
      }}
      size="small"
      tabPosition="left"
      style={{ minHeight: 400 }}
      items={[
        { key: 'school', label: '学校信息', children: <SchoolInfoSection /> },
        { key: 'terms', label: '学期', children: <TermsSection /> },
        { key: 'events', label: '考试 / 假期', children: <EventsSection /> },
        { key: 'schedules', label: '班级课表', children: <SchedulesSection /> },
        { key: 'import', label: '数据初始化', children: null },
        { key: 'org', label: '组织派班', children: <OrgAssignmentPanel /> },
      ]}
    />
  );
}
