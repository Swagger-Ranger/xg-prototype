package com.xg.platform.workflow.form;

import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class FormField {
    private String name;
    private String label;
    private String type;
    private boolean required;
    private List<String> options;
    private boolean indexed;
    private boolean deprecated;
    private String placeholder;
    private String pattern;
    private Integer minLength;
    private Integer maxLength;
    private Double min;
    private Double max;
    /** UI rendering hint; not validated server-side. e.g. textarea, radio, select. */
    private String widget;
    /** For type=file: max number of files; null means 1. */
    private Integer fileMaxCount;
    /** For type=file: accept hint forwarded to the browser, e.g. "image/*" or ".pdf,.doc". */
    private String fileAccept;
    /** For type=file: per-file size limit in KB, advisory (also enforced by FileService). */
    private Long fileMaxSizeKb;
}
