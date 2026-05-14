package com.xg.business.dataimport.service;

import com.xg.business.dataimport.mapper.DataImportOrgMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 学生场景专用：从已映射好的列里拉 (college, major, class_name) 去重，建一棵预览树，
 * 跟现有 org_unit 比对，标出 "existing" / "to_create"。
 *
 * <p>预览输出结构：
 * <pre>
 * {
 *   "tree": [
 *     { "name", "type", "status", "id"?, "children": [...] }
 *   ],
 *   "stats": { "create_colleges": N, "create_majors": N, "create_classes": N,
 *              "existing_colleges": N, "existing_majors": N, "existing_classes": N },
 *   "errors": [ { "row": N, "message": "…" } ]
 * }
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrgTreeInferenceService {

    private final DataImportOrgMapper orgMapper;

    /**
     * @param mapping column_mapping JSONB ({ targets, mappings })
     * @param rows    parsed_payload.rows (列表的列表，字符串)
     */
    public Map<String, Object> infer(Map<String, Object> mapping, List<List<String>> rows) {
        int collegeIdx = findSourceIndexFor(mapping, "college");
        int majorIdx = findSourceIndexFor(mapping, "major");
        int classIdx = findSourceIndexFor(mapping, "class_name");

        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> errors = new ArrayList<>();
        if (collegeIdx < 0) {
            errors.add(error(0, "未识别到「学院」列，请回上一步把某一列映射到「学院」"));
        }
        if (classIdx < 0) {
            errors.add(error(0, "未识别到「班级」列，请回上一步把某一列映射到「班级」"));
        }

        // 现有节点索引：按 type + name 索引（同级同名假设唯一；学校命名实践基本满足）。
        // college 直接 by name；major / class 用 "{parent_name}/{name}" 兜父子。
        List<Map<String, Object>> existing = orgMapper.listAcademicOrgs();
        Map<Long, String> nameById = new HashMap<>();
        Map<Long, Long> parentById = new HashMap<>();
        Map<String, Long> collegeByName = new HashMap<>();
        Map<String, Long> majorByCompositeKey = new HashMap<>();      // "college/major"
        Map<String, Long> classByCompositeKey = new HashMap<>();      // "college/major/class" 或 "college//class"
        for (Map<String, Object> row : existing) {
            Long id = ((Number) row.get("id")).longValue();
            Long parentId = row.get("parent_id") == null ? null : ((Number) row.get("parent_id")).longValue();
            String name = (String) row.get("name");
            String type = (String) row.get("type");
            nameById.put(id, name);
            parentById.put(id, parentId);
            switch (type) {
                case "college" -> collegeByName.put(name, id);
                case "major" -> {
                    String collegeName = parentId == null ? null : nameById.get(parentId);
                    if (collegeName != null) majorByCompositeKey.put(collegeName + "/" + name, id);
                }
                case "class" -> {
                    String parentName = parentId == null ? null : nameById.get(parentId);
                    Long grandparentId = parentId == null ? null : parentById.get(parentId);
                    String grandparentName = grandparentId == null ? null : nameById.get(grandparentId);
                    if (grandparentName != null) {
                        // class 挂在 major 下：grandparent=college, parent=major
                        classByCompositeKey.put(grandparentName + "/" + parentName + "/" + name, id);
                    } else if (parentName != null) {
                        // class 直接挂 college：parent=college, major 空
                        classByCompositeKey.put(parentName + "//" + name, id);
                    }
                }
                default -> {}
            }
        }

        // 推断阶段：第一遍扫数据，去重 triples + 收集行级错误
        LinkedHashMap<String, CollegeNode> collegeMap = new LinkedHashMap<>();
        for (int r = 0; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            String college = safeCell(row, collegeIdx);
            String major = safeCell(row, majorIdx);
            String className = safeCell(row, classIdx);

            // 行级校验：班级在但学院空 = 没法挂
            if (!className.isEmpty() && college.isEmpty()) {
                errors.add(error(r + 1, "班级『" + className + "』所属学院为空，无法挂入组织树"));
                continue;
            }
            if (college.isEmpty() && className.isEmpty()) continue;     // 整行空，跳

            CollegeNode cNode = collegeMap.computeIfAbsent(college, CollegeNode::new);
            if (!major.isEmpty()) {
                MajorNode mNode = cNode.majors.computeIfAbsent(major, MajorNode::new);
                if (!className.isEmpty()) mNode.classes.add(className);
            } else if (!className.isEmpty()) {
                cNode.directClasses.add(className);
            }
        }

        // 转树 + 比对现有
        List<Map<String, Object>> tree = new ArrayList<>();
        int createColleges = 0, createMajors = 0, createClasses = 0;
        int existingColleges = 0, existingMajors = 0, existingClasses = 0;
        for (CollegeNode c : collegeMap.values()) {
            Long collegeId = collegeByName.get(c.name);
            boolean collegeExisting = collegeId != null;
            if (collegeExisting) existingColleges++;
            else createColleges++;

            Map<String, Object> cOut = makeNode(c.name, "college", collegeExisting ? "existing" : "to_create", collegeId);
            List<Map<String, Object>> children = new ArrayList<>();

            for (MajorNode m : c.majors.values()) {
                Long majorId = collegeExisting ? majorByCompositeKey.get(c.name + "/" + m.name) : null;
                boolean majorExisting = majorId != null;
                if (majorExisting) existingMajors++;
                else createMajors++;

                Map<String, Object> mOut = makeNode(m.name, "major", majorExisting ? "existing" : "to_create", majorId);
                List<Map<String, Object>> classes = new ArrayList<>();
                for (String cn : m.classes) {
                    Long classId = majorExisting ? classByCompositeKey.get(c.name + "/" + m.name + "/" + cn) : null;
                    boolean classExisting = classId != null;
                    if (classExisting) existingClasses++;
                    else createClasses++;
                    classes.add(makeNode(cn, "class", classExisting ? "existing" : "to_create", classId));
                }
                mOut.put("children", classes);
                children.add(mOut);
            }

            for (String cn : c.directClasses) {
                Long classId = collegeExisting ? classByCompositeKey.get(c.name + "//" + cn) : null;
                boolean classExisting = classId != null;
                if (classExisting) existingClasses++;
                else createClasses++;
                children.add(makeNode(cn, "class", classExisting ? "existing" : "to_create", classId));
            }

            cOut.put("children", children);
            tree.add(cOut);
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("create_colleges", createColleges);
        stats.put("create_majors", createMajors);
        stats.put("create_classes", createClasses);
        stats.put("existing_colleges", existingColleges);
        stats.put("existing_majors", existingMajors);
        stats.put("existing_classes", existingClasses);

        result.put("tree", tree);
        result.put("stats", stats);
        result.put("errors", errors);
        return result;
    }

    // ---------- helpers ----------

    private static int findSourceIndexFor(Map<String, Object> mapping, String targetKey) {
        if (mapping == null) return -1;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> mappings = (List<Map<String, Object>>) mapping.get("mappings");
        if (mappings == null) return -1;
        for (Map<String, Object> m : mappings) {
            if (targetKey.equals(m.get("target"))) {
                Object idx = m.get("source_index");
                if (idx instanceof Number n) return n.intValue();
            }
        }
        return -1;
    }

    private static String safeCell(List<String> row, int idx) {
        if (idx < 0 || row == null || idx >= row.size()) return "";
        String v = row.get(idx);
        return v == null ? "" : v.trim();
    }

    private static Map<String, Object> makeNode(String name, String type, String status, Long id) {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("name", name);
        n.put("type", type);
        n.put("status", status);
        if (id != null) n.put("id", id);
        return n;
    }

    private static Map<String, Object> error(int row, String message) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("row", row);
        e.put("message", message);
        return e;
    }

    private static class CollegeNode {
        final String name;
        final LinkedHashMap<String, MajorNode> majors = new LinkedHashMap<>();
        final java.util.LinkedHashSet<String> directClasses = new java.util.LinkedHashSet<>();
        CollegeNode(String name) { this.name = name; }
    }

    private static class MajorNode {
        final String name;
        final java.util.LinkedHashSet<String> classes = new java.util.LinkedHashSet<>();
        MajorNode(String name) { this.name = name; }
    }
}
