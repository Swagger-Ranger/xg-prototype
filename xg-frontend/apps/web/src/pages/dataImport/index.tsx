import { useState } from 'react';
import { Button, Steps, Upload } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  InboxOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  SolutionOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { message } from '@/utils/antdApp';
import { describeApiError } from '@/utils/api-error';
import {
  createSession,
  type DataImportSession,
  type ImportScenario,
} from '@/api/dataImport';
import StepMapping from './StepMapping';
import StepOrgPreview from './StepOrgPreview';
import StepValidate from './StepValidate';
import StepResult from './StepResult';
import styles from './index.module.css';

const SCENARIOS: { key: ImportScenario; title: string; desc: string; icon: React.ReactNode }[] = [
  {
    key: 'student',
    title: '学生花名册',
    desc: '导入学生信息，含学院/专业/班级',
    icon: <TeamOutlined />,
  },
  {
    key: 'teacher',
    title: '教师基础信息',
    desc: '导入教师姓名、工号、联系方式',
    icon: <SolutionOutlined />,
  },
  {
    key: 'counselor',
    title: '教职工角色赋予',
    desc: '给已存在的教职工批量配角色 + 从属单位',
    icon: <UserSwitchOutlined />,
  },
];

export default function DataImportPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState<ImportScenario | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<DataImportSession | null>(null);

  const resetWizard = () => {
    setStep(0);
    setScenario(null);
    setFile(null);
    setSession(null);
  };

  const canSubmit = !!scenario && !!file && !submitting;

  const handleSubmit = async () => {
    if (!scenario || !file) return;
    setSubmitting(true);
    try {
      const s = await createSession(scenario, file);
      setSession(s);
      setStep(1);
      message.success(`已解析 ${s.total_rows ?? 0} 行`);
    } catch (e) {
      message.error(describeApiError(e, '上传失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>数据初始化</div>
        <div className={styles.subtitle}>把外部表里的学生、教师、配角色信息批量导进来，小夕帮你对字段</div>
      </div>

      <Steps
        className={styles.steps}
        current={step}
        size="small"
        items={[
          { title: '上传文件' },
          { title: 'AI 帮你对字段' },
          { title: '核对结构' },
          { title: '校验确认' },
          { title: '完成' },
        ]}
      />

      {step === 0 && (
        <StepUpload
          scenario={scenario}
          onScenario={setScenario}
          file={file}
          onFile={setFile}
          canSubmit={canSubmit}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}

      {step === 1 && session && (
        <StepMapping
          session={session}
          onSessionUpdate={setSession}
          onBack={() => setStep(0)}
          onNext={() => setStep(session.scenario === 'student' ? 2 : 3)}
        />
      )}

      {step === 2 && session && session.scenario === 'student' && (
        <StepOrgPreview
          session={session}
          onSessionUpdate={setSession}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && session && (
        <StepValidate
          session={session}
          onSessionUpdate={setSession}
          onBack={() => setStep(session.scenario === 'student' ? 2 : 1)}
          onExecuted={() => setStep(4)}
        />
      )}

      {step === 4 && session && (
        <StepResult
          session={session}
          onRestart={resetWizard}
          onClose={() => navigate('/workspace')}
        />
      )}

      {/* Step 2/3/4 全局可见的"重新上传"快捷入口 —— 校验出错时不用一路点上一步 */}
      {step > 0 && step < 4 && (
        <div className={styles.reuploadBar}>
          <Button type="link" icon={<ReloadOutlined />} onClick={resetWizard}>
            修改 Excel 后重新上传
          </Button>
          <span className={styles.reuploadHint}>
            会丢弃当前列映射 / 校验结果，回到 Step 1
          </span>
        </div>
      )}
    </div>
  );
}

interface StepUploadProps {
  scenario: ImportScenario | null;
  onScenario: (s: ImportScenario) => void;
  file: File | null;
  onFile: (f: File | null) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}

function StepUpload({
  scenario,
  onScenario,
  file,
  onFile,
  canSubmit,
  submitting,
  onSubmit,
}: StepUploadProps) {
  return (
    <div className={styles.card}>
      <div className={styles.sectionLabel}>选择导入类型</div>
      <div className={styles.scenarioGrid}>
        {SCENARIOS.map((s) => (
          <div
            key={s.key}
            className={`${styles.scenarioCard} ${scenario === s.key ? styles.scenarioCardActive : ''}`}
            onClick={() => onScenario(s.key)}
          >
            <div className={styles.scenarioIcon}>{s.icon}</div>
            <div className={styles.scenarioTitle}>{s.title}</div>
            <div className={styles.scenarioDesc}>{s.desc}</div>
          </div>
        ))}
      </div>

      <div className={styles.sectionLabel}>上传文件</div>
      <div className={styles.upload}>
        <Upload.Dragger
          name="file"
          accept=".xlsx,.xls,.csv"
          multiple={false}
          maxCount={1}
          fileList={file ? [{ uid: '1', name: file.name, status: 'done' } as never] : []}
          beforeUpload={(f) => {
            onFile(f);
            return false; // prevent auto-upload — we POST on "next"
          }}
          onRemove={() => onFile(null)}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">拖拽 Excel / CSV 到此处，或点击选择</p>
          <p className="ant-upload-hint">支持 .xlsx / .xls / .csv,单次最多 5000 行</p>
        </Upload.Dragger>
      </div>

      <div className={styles.actions}>
        <Button type="primary" disabled={!canSubmit} loading={submitting} onClick={onSubmit}>
          下一步：AI 解析列
        </Button>
      </div>
    </div>
  );
}

