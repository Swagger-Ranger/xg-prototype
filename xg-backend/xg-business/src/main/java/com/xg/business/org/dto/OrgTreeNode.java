package com.xg.business.org.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

/**
 * 派班 UI 用的扁平节点。前端拿到后按 parentId 自己拼成树。
 *
 * <p>每个节点带 leader 信息（仅 type='class' 时有意义）+ 该节点上挂的辅导员
 * 列表（college 节点的辅导员通过 org_closure 自动覆盖下级班级，前端展示时
 * 只在该节点本身显示一次）。
 */
@Getter
@Setter
public class OrgTreeNode {
    private Long id;
    private Long parentId;
    private String name;
    /** 'college' 或 'class'。 */
    private String type;
    private Integer sortOrder;

    /** 班主任 user id，仅 type='class' 有意义。 */
    private Long leaderId;
    private String leaderName;

    /** 该节点上挂着的辅导员映射（不包括上级继承的）。 */
    private List<CounselorMappingView> counselors;
}
