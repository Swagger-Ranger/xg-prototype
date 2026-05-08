import { Outlet } from 'react-router-dom';
import NavRail from './NavRail';
import TopBar from './TopBar';
import AIPanel from '../components/ai/AIPanel';
import { useAuth } from '@/hooks/useAuth';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  // employer 角色不开放 AI 模块。直接不渲染 AIPanel，让 NavRail 占满左侧。
  const { hasPermission } = useAuth();
  const showAIPanel = hasPermission('ai:assistant:use');

  return (
    <div className={styles.layout}>
      {showAIPanel && (
        <div className={styles.aiPanel}>
          <AIPanel />
        </div>
      )}

      {/* Nav Rail */}
      <NavRail />

      {/* Main Content */}
      <div className={styles.main}>
        <TopBar />
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
