package com.xg.platform.workflow.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TimelineActorVO {
    /** Source user id. May be null if no actor was resolved (e.g. unfilled approval slot). */
    private Long id;
    /** Display name. Masked to a role label (e.g. "辅导员") when the viewer is the student initiator. */
    private String name;
    /** Role hint for the UI to render the right icon, e.g. "counselor" / "dean" / "student". May be null. */
    private String role;
}
