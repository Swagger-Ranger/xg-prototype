// 「系统管理 → 团队管理」主页。卡片网格列出 kind='team' 的所有行,
// 支持筛选(全部 / 进行中 / 常驻 / 已归档)、按名称搜索、新建团队、查看详情。
//
// 跟「角色权限」页的关系:
//   - 都基于 sys_role 表,通过 kind 字段区分
//   - 角色权限页(kind='role'):关注权限码矩阵,长期岗位定义
//   - 本页(kind='team'):关注业务编组成员管理 + 时间窗,频繁创建 / 归档

import { useMemo, useState } from 'react';
import { Button, Empty, Input, Segmented, Spin, Tag, Tooltip } from 'antd';
import {
  PlusOutlined,
  TeamOutlined,
  CalendarOutlined,
  TagOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { message } from '@/utils/antdApp';
import {
  archiveTeam,
  listRoles,
  unarchiveTeam,
  type RoleSummary,
  type TeamType,
} from '@/api/rolePermission';
import { describeApiError } from '@/utils/api-error';
import TeamFormModal from './TeamFormModal';
import TeamDetail from './TeamDetail';

type Filter = 'active' | 'archived';
type ActiveSub = 'all' | 'running' | 'permanent' | 'upcoming' | 'ended';

const TEAM_TYPE_LABEL: Record<TeamType, string> = {
  review: '评审 / 评定',
  temporary: '临时',
  cross_dept: '跨部门',
  student_org: '学生组织',
  other: '其它',
};

interface DerivedStatus {
  key: 'running' | 'permanent' | 'upcoming' | 'ended' | 'archived';
  label: string;
  color: string;
  emoji: string;
}

function deriveStatus(t: RoleSummary, today = new Date()): DerivedStatus {
  if (t.archived_at) return { key: 'archived', label: '已归档', color: 'default', emoji: '⚫' };
  if (!t.start_date && !t.end_date)
    return { key: 'permanent', label: '常驻', color: 'blue', emoji: '⚪' };
  const todayStr = today.toISOString().slice(0, 10);
  if (t.start_date && todayStr < t.start_date)
    return { key: 'upcoming', label: '未开始', color: 'gold', emoji: '🟡' };
  if (t.end_date && todayStr > t.end_date)
    return { key: 'ended', label: '已结束', color: 'red', emoji: '🔴' };
  return { key: 'running', label: '进行中', color: 'green', emoji: '🟢' };
}

function formatRange(t: RoleSummary): string {
  if (!t.start_date && !t.end_date) return '常驻';
  const fmt = (s: string | null) => (s ? s.slice(5) : '—'); // MM-DD only
  return `${fmt(t.start_date)} ~ ${fmt(t.end_date)}`;
}

export default function TeamsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('active');
  const [activeSub, setActiveSub] = useState<ActiveSub>('all');
  const [keyword, setKeyword] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleSummary | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const teamsQ = useQuery<RoleSummary[]>({
    queryKey: ['admin.teams', filter, keyword],
    queryFn: () =>
      listRoles({ kind: 'team', archived: filter === 'archived', keyword: keyword || undefined }),
    staleTime: 30 * 1000,
  });

  const archiveMut = useMutation({
    mutationFn: (code: string) => archiveTeam(code),
    onSuccess: () => {
      message.success('已归档');
      qc.invalidateQueries({ queryKey: ['admin.teams'] });
    },
    onError: (e) => message.error(describeApiError(e, '归档失败')),
  });

  const unarchiveMut = useMutation({
    mutationFn: (code: string) => unarchiveTeam(code),
    onSuccess: () => {
      message.success('已撤归档');
      qc.invalidateQueries({ queryKey: ['admin.teams'] });
    },
    onError: (e) => message.error(describeApiError(e, '撤归档失败')),
  });

  const teams = teamsQ.data ?? [];

  // 二级状态筛选(仅未归档时启用)— 按 derive 后的状态过滤
  const filteredTeams = useMemo(() => {
    if (filter === 'archived' || activeSub === 'all') return teams;
    return teams.filter((t) => deriveStatus(t).key === activeSub);
  }, [teams, filter, activeSub]);

  // 详情视图 — 选中某个团队时切到详情
  if (selectedCode) {
    return (
      <TeamDetail
        code={selectedCode}
        onBack={() => setSelectedCode(null)}
        onEdit={(team) => {
          setEditing(team);
          setFormOpen(true);
        }}
      />
    );
  }

  return (
    <div>
      {/* 顶部:筛选 + 搜索 + 新建 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { label: '未归档', value: 'active' },
            { label: '已归档', value: 'archived' },
          ]}
        />
        {filter === 'active' && (
          <Segmented
            value={activeSub}
            onChange={(v) => setActiveSub(v as ActiveSub)}
            size="small"
            options={[
              { label: '全部', value: 'all' },
              { label: '进行中', value: 'running' },
              { label: '常驻', value: 'permanent' },
              { label: '未开始', value: 'upcoming' },
              { label: '已结束', value: 'ended' },
            ]}
          />
        )}
        <Input.Search
          placeholder="按团队名称搜索"
          allowClear
          value={keywordDraft}
          onChange={(e) => setKeywordDraft(e.target.value)}
          onSearch={(v) => setKeyword(v)}
          style={{ maxWidth: 280 }}
        />
        <div style={{ flex: 1 }} />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          新建团队
        </Button>
      </div>

      {/* 列表:卡片网格 / Loading / Empty */}
      {teamsQ.isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : filteredTeams.length === 0 ? (
        <Empty
          description={
            filter === 'archived'
              ? '暂无已归档团队'
              : keyword
              ? '没找到匹配的团队'
              : '还没有团队,点右上「新建团队」开始'
          }
          style={{ padding: 60 }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {filteredTeams.map((t) => (
            <TeamCard
              key={t.code}
              team={t}
              onOpen={() => setSelectedCode(t.code)}
              onEdit={() => {
                setEditing(t);
                setFormOpen(true);
              }}
              onArchive={() => archiveMut.mutate(t.code)}
              onUnarchive={() => unarchiveMut.mutate(t.code)}
              archiving={archiveMut.isPending && archiveMut.variables === t.code}
              unarchiving={unarchiveMut.isPending && unarchiveMut.variables === t.code}
            />
          ))}
        </div>
      )}

      <TeamFormModal
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['admin.teams'] });
        }}
      />
    </div>
  );
}

function TeamCard({
  team,
  onOpen,
  onEdit,
  onArchive,
  onUnarchive,
  archiving,
  unarchiving,
}: {
  team: RoleSummary;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  archiving: boolean;
  unarchiving: boolean;
}) {
  const status = deriveStatus(team);
  const isArchived = !!team.archived_at;
  return (
    <div
      style={{
        background: 'var(--bg-1, #fff)',
        border: '1px solid var(--border, #f0f0f0)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: isArchived ? 0.7 : 1,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
      onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* 状态徽标 */}
      <div>
        <Tag color={status.color} style={{ margin: 0 }}>
          {status.emoji} {status.label}
        </Tag>
      </div>

      {/* 名称 */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.4,
          marginTop: 4,
          minHeight: 42,
        }}
      >
        {team.name}
      </div>

      {/* 周期 */}
      <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>
        <CalendarOutlined style={{ marginRight: 6 }} />
        {formatRange(team)}
      </div>

      {/* 类型 */}
      {team.team_type && (
        <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>
          <TagOutlined style={{ marginRight: 6 }} />
          {TEAM_TYPE_LABEL[team.team_type] ?? team.team_type}
        </div>
      )}

      {/* 成员数 */}
      <div style={{ color: 'var(--fg-2)', fontSize: 13, fontWeight: 500 }}>
        <TeamOutlined style={{ marginRight: 6 }} />
        {team.member_count} 人
      </div>

      {/* 操作按钮 */}
      <div
        style={{ display: 'flex', gap: 4, marginTop: 4 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Button size="small" type="link" style={{ padding: '0 6px' }} onClick={onOpen}>
          查看
        </Button>
        {!isArchived && (
          <>
            <Button size="small" type="link" style={{ padding: '0 6px' }} onClick={onEdit}>
              编辑
            </Button>
            <Tooltip title="归档后该团队从默认列表隐藏,但成员关系保留">
              <Button
                size="small"
                type="link"
                icon={<InboxOutlined />}
                style={{ padding: '0 6px' }}
                onClick={onArchive}
                loading={archiving}
              >
                归档
              </Button>
            </Tooltip>
          </>
        )}
        {isArchived && (
          <Button
            size="small"
            type="link"
            style={{ padding: '0 6px' }}
            onClick={onUnarchive}
            loading={unarchiving}
          >
            恢复
          </Button>
        )}
      </div>
    </div>
  );
}
