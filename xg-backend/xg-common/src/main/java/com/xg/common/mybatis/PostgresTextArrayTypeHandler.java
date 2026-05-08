package com.xg.common.mybatis;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedTypes;

import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collections;
import java.util.List;

/**
 * MyBatis type handler for PostgreSQL {@code text[]} columns mapped to
 * {@code List<String>} on the Java side. Uses {@link java.sql.Connection#createArrayOf}
 * so the driver binds a real SQL array — JacksonTypeHandler would serialize the list
 * to a JSON string and PG would reject it ("expression is of type character varying").
 */
@MappedTypes(List.class)
public class PostgresTextArrayTypeHandler extends BaseTypeHandler<List<String>> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<String> parameter, JdbcType jdbcType)
            throws SQLException {
        Array array = ps.getConnection().createArrayOf("text", parameter.toArray(new String[0]));
        ps.setArray(i, array);
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return toList(rs.getArray(columnName));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return toList(rs.getArray(columnIndex));
    }

    @Override
    public List<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return toList(cs.getArray(columnIndex));
    }

    private List<String> toList(Array array) throws SQLException {
        if (array == null) return Collections.emptyList();
        Object raw = array.getArray();
        if (!(raw instanceof Object[] arr)) return Collections.emptyList();
        List<String> out = new java.util.ArrayList<>(arr.length);
        for (Object o : arr) {
            out.add(o == null ? null : o.toString());
        }
        return out;
    }
}
