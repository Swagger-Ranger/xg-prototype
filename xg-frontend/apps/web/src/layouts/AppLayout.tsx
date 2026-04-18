import { Outlet } from 'react-router-dom';
import NavRail from './NavRail';
import TopBar from './TopBar';
import AIPanel from '../components/ai/AIPanel';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  return (
    <div className={styles.layout}>
      {/* AI Side Panel — 常驻 */}
      <div className={styles.aiPanel}>
        <AIPanel />
      </div>

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
