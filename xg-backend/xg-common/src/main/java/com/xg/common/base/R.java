package com.xg.common.base;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.xg.common.exception.ErrorCode;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class R<T> {

    private String code;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private T data;

    private String message;

    private R() {
    }

    public static <T> R<T> ok(T data) {
        R<T> r = new R<>();
        r.code = "SUCCESS";
        r.data = data;
        r.message = "成功";
        return r;
    }

    public static <T> R<T> ok() {
        return ok(null);
    }

    public static <T> R<T> fail(String code, String message) {
        R<T> r = new R<>();
        r.code = code;
        r.message = message;
        return r;
    }

    public static <T> R<T> fail(ErrorCode errorCode) {
        return fail(errorCode.getCode(), errorCode.getMessage());
    }
}
