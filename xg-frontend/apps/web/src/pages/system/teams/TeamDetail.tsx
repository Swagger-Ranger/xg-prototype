// 团队详情页 — 从 TeamsPage 卡片点【查看】跳进来。
// 顶部:返回 / 名称 / 状态徽标 / 操作按钮(编辑 + 归档/恢复)
// 中部:基本信息卡(类型 / 周期 / 备注 / 创建时间)
// 下部:成员管理表(复用 RoleMembersTable,自己有"添加成员 / 移除"能力)

import { Button, Card, Descriptions, Spin, Tag, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  InboxOutlined,
  RollbackOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from '@/utils/antdApp';
import {
  archiveTeam,
  deleteRole,
  listRoles,
  unarchiveTeam,
  type RoleSummary,
  type TeamType,
} from '@/api/rolePermission';
import { describeApiError } from '@/utils/api-error';
import RoleMembersTable from '@/components/role/RoleMembersTable';

const TEAM_TYPE_LABEL: Record<TeamType, string> = {
  review: '评审 / 评定',
  temporary: '临时工作组',
  cross_dept: '跨部门联动',
  student_org: '学生组织',
  other: '其它',
};

interface DerivedStatus {
  label: string;
  color: string;
}

function deriveStatus(t: RoleSummary, today = new Date()): DerivedStatus {
  if (t.archived_at) return { label: '已归档', color: 'default' };
  if (!t.start_date && !t.end_date) return { label: '常驻', color: 'blue' };
  const todayStr = today.toISOString().slice(0, 10);
  if (t.start_date && todayStr < t.start_date) return { label: '未开始', color: 'gold' };
  if (t.end_date && todayStr > t.end_date) return { label: '已结束', color: 'red' };
  return { label: '进行中', color: 'green' };
}

interface TeamDetailProps {
  code: string;
  onBack: () => void;
  onEdit: (team: RoleSummary) => void;
}

export default function TeamDetail({ code, onBack, onEdit }: TeamDetailProps) {
  const qc = useQueryClient();

  // 单团队查询 — 复用 listRoles,前端 filter by code(只 1 行,简单且 server-side keyword 已可缩小)
  const teamQ = useQuery<RoleSummary | null>({
    queryKey: ['admin.team.detail', code],
    queryFn: async () => {
      // 后端 listRoles 不带 code 参数,这里宽容地拉所有 team 再 find。性能 OK(团队数量小)。
      const all = await listRoles({ kind: 'team' });
      return all.find((t) => t.code === code) ?? null;
    },
    staleTime: 10 * 1000,
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveTeam(code),
    onSuccess: () => {
      message.success('已归档');
      qc.invalidateQueries({ queryKey: ['admin.team.detail', code] });
      qc.invalidateQueries({ queryKey: ['admin.teams'] });
    },
    onError: (e) => message.error(describeApiError(e, '归档失败')),
  });

  const unarchiveMut = useMutation({
    mutationFn: () => unarchiveTeam(code),
    onSuccess: () => {
      message.success('已撤归档');
      qc.invalidateQueries({ queryKey: ['admin.team.detail', code] });
      qc.invalidateQueries({ queryKey: ['admin.teams'] });
    },
    onError: (e) => message.error(describeApiError(e, '撤归档失败')),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteRole(code),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['admin.teams'] });
      onBack();
    },
    onError: (e) => message.error(describeApiError(e, '删除失败')),
  });

  function confirmDelete() {
    if (!teamQ.data) return;
    Modal.confirm({
      title: `彻底删除团队「${teamQ.data.name}」?`,
      content:
        '若该团队还有成员,删除会被拒绝;请先在下方「成员」区移出全部成员。删除不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMut.mutateAsync(),
    });
  }

  if (teamQ.isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin />
      </div>
    );
  }
  if (!teamQ.data) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回团队列表
        </Button>
        <div style={{ marginTop: 24, color: 'var(--fg-3)' }}>团队不存在或已删除。</div>
      </div>
    );
  }

  const team = teamQ.data;
  const status = deriveStatus(team);
  const isArchived = !!team.archived_at;

  return (
    <div>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回
        </Button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{team.name}</h2>
        <Tag color={status.color}>{status.label}</Tag>
        <div style={{ flex: 1 }} />
        {!isArchived && (
          <>
            <Button icon={<EditOutlined />} onClick={() => onEdit(team)}>
              编辑
            </Button>
            <Button
              icon={<InboxOutlined />}
              onClick={() => archiveMut.mutate()}
              loading={archiveMut.isPending}
            >
              归档
            </Button>
          </>
        )}
        {isArchived && (
          <Button
            icon={<RollbackOutlined />}
            onClick={() => unarchiveMut.mutate()}
            loading={unarchiveMut.isPending}
          >
            撤归档
          </Button>
        )}
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={confirmDelete}
          loading={deleteMut.isPending}
        >
          删除
        </Button>
      </div>

      {/* 基本信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="类型">
            {team.team_type ? TEAM_TYPE_LABEL[team.team_type] : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="工作周期">
            {team.start_date || team.end_date
              ? `${team.start_date ?? '—'} ~ ${team.end_date ?? '—'}`
              : '常驻'}
          </Descriptions.Item>
          <Descriptions.Item label="成员数">{team.member_count} 人</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={status.color}>{status.label}</Tag>
          </Descriptions.Item>
          {team.description && (
            <Descriptions.Item label="备注" span={2}>
              {team.description}
            </Descriptions.Item>
          )}
          {team.archived_at && (
            <Descriptions.Item label="归档时间" span={2}>
              {team.archived_at}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* 成员管理 */}
      <Card size="small" title="成员">
        <RoleMembersTable roleCode={team.code} roleName={team.name} />
      </Card>
    </div>
  );
}
