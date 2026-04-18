package com.xg.common.exception;

public interface ErrorCode {

    String getCode();

    String getMessage();

    default BizException exception() {
        return new BizException(this);
    }
}
