// 勤工助学 · 资助中心成员卡
//
// 原本叠了「资助中心成员 / 用工单位负责人 / 岗位负责人引导」三张卡,
// 第二张和「用人单位」表格语义重叠(同样是逐单位绑定 leader,且自带编辑能力),
// 第三张是没数据的纯提示卡,挪到「用人单位」tab 后冗余更明显 —— 整理后只剩
// 资助中心成员一张,逻辑上是「跨所有单位的薪资审核人池」,跟单位粒度的负责人
// 互补。「查本单位岗位」的 Drawer 入口已合并到「用人单位」主表格的行操作里。
//
// 文案铁律:绝不在 UI 暴露 role code(aid_center_officer 等),用 roleName 中文走。

import { Alert, Card, Space } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import RoleMembersTable from '@/components/role/RoleMembersTable';

const AID_CENTER_CODE = 'aid_center_officer';

export default function StaffAssignmentSection() {
  return (
    <Card
      size="small"
      style={{ borderRadius: 'var(--r-lg)' }}
      title={
        <Space size={8}>
          <TeamOutlined style={{ color: 'var(--ac)' }} />
          <span style={{ fontWeight: 600 }}>资助中心成员</span>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon={false}
        style={{ marginBottom: 12, fontSize: 13, background: 'var(--bg-3)', border: 'none' }}
        message="这些老师负责审核每月的勤工助学薪资单。用工单位上报薪资时,系统会发任务给这里所有成员,任一人审批即生效。本组人员跨所有用人单位生效,与上方表格里的「单位负责人」不冲突。"
      />
      <RoleMembersTable roleCode={AID_CENTER_CODE} roleName="资助中心" />
    </Card>
  );
}
