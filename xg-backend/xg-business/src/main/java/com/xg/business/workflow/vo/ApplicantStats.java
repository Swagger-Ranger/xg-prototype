package com.xg.business.workflow.vo;

import lombok.Data;

@Data
public class ApplicantStats {
    private int absent30d;
    private int leaveCount30d;
    private int openAlertsCritical;
    private int openAlertsHigh;
    private int openAlertsMedium;
    private int openAlertsLow;
    private int unpunishedViolations;
    private int violation90d;
}
