package com.xg.business.fielddef.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xg.business.fielddef.dto.FieldDefinitionRequest;
import com.xg.business.fielddef.mapper.FieldDefinitionMapper;
import com.xg.business.fielddef.model.FieldDefinition;
import com.xg.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class FieldDefinitionService {

    private final FieldDefinitionMapper mapper;
    private final ObjectMapper objectMapper;

    public List<FieldDefinition> list(boolean onlyEnabled) {
        QueryWrapper<FieldDefinition> qw = new QueryWrapper<>();
        if (onlyEnabled) qw.eq("enabled", true);
        qw.orderByAsc("sort_order").orderByAsc("id");
        return mapper.selectList(qw);
    }

    @Transactional
    public FieldDefinition create(FieldDefinitionRequest req) {
        QueryWrapper<FieldDefinition> exists = new QueryWrapper<FieldDefinition>().eq("code", req.getCode());
        if (mapper.selectCount(exists) > 0) {
            throw new BizException("FIELD_CODE_DUPLICATE", "字段编码已存在");
        }
        FieldDefinition f = new FieldDefinition();
        applyRequest(f, req);
        mapper.insert(f);
        return f;
    }

    @Transactional
    public FieldDefinition update(Long id, FieldDefinitionRequest req) {
        FieldDefinition existing = mapper.selectById(id);
        if (existing == null) throw new BizException("FIELD_NOT_FOUND", "字段不存在");
        if (!existing.getCode().equals(req.getCode())) {
            throw new BizException("FIELD_CODE_IMMUTABLE", "字段编码不可修改");
        }
        applyRequest(existing, req);
        mapper.updateById(existing);
        return existing;
    }

    @Transactional
    public void delete(Long id) {
        if (mapper.deleteById(id) == 0) {
            throw new BizException("FIELD_NOT_FOUND", "字段不存在");
        }
    }

    private void applyRequest(FieldDefinition target, FieldDefinitionRequest req) {
        target.setCode(req.getCode());
        target.setLabel(req.getLabel());
        target.setFieldType(req.getFieldType());
        target.setPlaceholder(req.getPlaceholder());
        target.setRequired(Boolean.TRUE.equals(req.getRequired()));
        target.setSortOrder(req.getSortOrder() == null ? 0 : req.getSortOrder());
        target.setEnabled(req.getEnabled() == null ? Boolean.TRUE : req.getEnabled());
        target.setOptions(serializeOptions(req.getOptions()));
        if (!"select".equals(req.getFieldType())) {
            target.setOptions(null);
        }
    }

    private String serializeOptions(List<String> options) {
        if (options == null || options.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(options);
        } catch (JsonProcessingException e) {
            throw new BizException("FIELD_OPTIONS_INVALID", "可选项序列化失败");
        }
    }
}
