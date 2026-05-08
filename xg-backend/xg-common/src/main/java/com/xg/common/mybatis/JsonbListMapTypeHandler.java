package com.xg.common.mybatis;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.postgresql.util.PGobject;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/**
 * MyBatis type handler for PostgreSQL JSONB columns mapped to
 * {@code List<Map<String, Object>>}. Mirrors {@link JsonbMapTypeHandler} for
 * the array-of-objects shape used by e.g. {@code leave_config_patch.diff}
 * (an ordered list of {path, op, value} entries).
 */
public class JsonbListMapTypeHandler extends BaseTypeHandler<List<Map<String, Object>>> {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_TYPE = new TypeReference<>() {};

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<Map<String, Object>> parameter, JdbcType jdbcType)
            throws SQLException {
        PGobject pgObject = new PGobject();
        pgObject.setType("jsonb");
        try {
            pgObject.setValue(MAPPER.writeValueAsString(parameter));
        } catch (Exception e) {
            throw new SQLException("Failed to serialize List<Map> to JSONB", e);
        }
        ps.setObject(i, pgObject);
    }

    @Override
    public List<Map<String, Object>> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public List<Map<String, Object>> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public List<Map<String, Object>> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private List<Map<String, Object>> parse(String json) throws SQLException {
        if (json == null || json.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.readValue(json, LIST_TYPE);
        } catch (Exception e) {
            throw new SQLException("Failed to parse JSONB to List<Map>", e);
        }
    }
}
