package com.xg.business.collection.dto;

import com.xg.common.base.PageQuery;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CollectionQueryRequest extends PageQuery {

    private String status;

    private String search;
}
