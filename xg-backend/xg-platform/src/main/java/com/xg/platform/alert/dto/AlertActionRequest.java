package com.xg.platform.alert.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AlertActionRequest {
    private String note;
    /** Days to mute starting now. Used only by the /mute endpoint. */
    private Integer days;
}
