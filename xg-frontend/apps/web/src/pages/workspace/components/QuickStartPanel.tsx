import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import {
  RocketOutlined,
  CloseOutlined,
  DownOutlined,
  FileTextOutlined,
  TeamOutlined,
  ArrowRightOutlined,
  CloudUploadOutlined,
  SettingOutlined,
  BellOutlined,
  BookOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { FIRST_SETUP_SCENARIOS, type SetupAction, type SetupIconName } from './quickStartScenarios';
import { useAIActionStore } from '@/stores/ai-action.store';
import { useLayoutStore } from '@/stores/layout.store';
import styles from './QuickStartPanel.module.css';

const LS_KEY = 'xg_admin_onboarding_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(LS_KEY, v ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

const ICONS: Record<SetupIconName, React.ReactNode> = {
  'data-init': <CloudUploadOutlined />,
  'basic-config': <SettingOutlined />,
  leave: <FileTextOutlined />,
  identity: <TeamOutlined />,
  notification: <BellOutlined />,
  knowledge: <BookOutlined />,
  ai: <ThunderboltOutlined />,
};

export default function QuickStartPanel() {
  const navigate = useNavigate();
  const seedInput = useAIActionStore((s) => s.seedInput);
  const setAiPanelOpen = useLayoutStore((s) => s.setAiPanelOpen);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const handleActionClick = (a: SetupAction) => {
    if (a.aiPrompt) {
      seedInput(a.aiPrompt, { send: false });
      setAiPanelOpen(true);
    } else if (a.href) {
      navigate(a.href);
    }
  };

  const handleHide = () => {
    setCollapsed(true);
    writeCollapsed(true);
  };
  const handleShow = () => {
    setCollapsed(false);
    writeCollapsed(false);
  };

  if (collapsed) {
    return (
      <div className={styles.collapsedBar} onClick={handleShow}>
        <span className={styles.collapsedLeft}>
          <RocketOutlined className={styles.collapsedIcon} />
          <span className={styles.collapsedTitle}>首次配置</span>
        </span>
        <span className={styles.collapsedExpand}>
          <DownOutlined /> 展开
        </span>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <RocketOutlined className={styles.headIcon} />
          <span className={styles.headTitle}>首次配置</span>
        </div>
        <div className={styles.headRight}>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={handleHide}>
            隐藏
          </Button>
        </div>
      </div>

      <div className={styles.scenarioList}>
        {FIRST_SETUP_SCENARIOS.map((s) => (
          <div key={s.id} className={styles.scenarioBlock}>
            <div className={styles.scenarioHead}>
              <span className={styles.scenarioIcon}>{ICONS[s.iconName]}</span>
              <div className={styles.scenarioHeadText}>
                <div className={styles.scenarioTitle}>{s.title}</div>
                <div className={styles.scenarioSubtitle}>{s.subtitle}</div>
              </div>
            </div>
            <div className={styles.actionList}>
              {s.actions.map((a) => (
                <div
                  key={a.label}
                  className={styles.actionRow}
                  onClick={() => handleActionClick(a)}
                >
                  <span className={styles.actionLabel}>{a.label}</span>
                  <ArrowRightOutlined className={styles.actionArrow} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
