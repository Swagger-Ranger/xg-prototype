package com.xg.common.base;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PageQuery {

    @Min(1)
    private int page = 1;

    @Min(1)
    @Max(200)
    private int size = 20;

    public <T> Page<T> toPage() {
        return new Page<>(page, size);
    }
}
