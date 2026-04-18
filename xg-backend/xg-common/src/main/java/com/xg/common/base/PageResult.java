package com.xg.common.base;

import com.baomidou.mybatisplus.core.metadata.IPage;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class PageResult<T> {

    private List<T> data;
    private long total;
    private int page;
    private int size;

    public static <T> PageResult<T> of(IPage<T> page) {
        PageResult<T> result = new PageResult<>();
        result.data = page.getRecords();
        result.total = page.getTotal();
        result.page = (int) page.getCurrent();
        result.size = (int) page.getSize();
        return result;
    }
}
