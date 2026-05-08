package com.xg.business.academic.dto;

import lombok.Data;

/** Tiny pair used by the class-schedule admin editor's class picker. */
@Data
public class ClassRow {
    private Long id;
    private String name;
    /** Parent unit name (typically the 学院 name) for disambiguation in the picker. */
    private String parentName;
}
