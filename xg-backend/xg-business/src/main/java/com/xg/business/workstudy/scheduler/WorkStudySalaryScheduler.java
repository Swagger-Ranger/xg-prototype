package com.xg.business.workstudy.scheduler;

import com.xg.business.workstudy.service.WorkStudySalarySettlementService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily salary settlement — runs at 03:00 (after the 02:00 alert scan so the
 * day's final timesheet state is in). Materializes one {@code work_study_salary}
 * row per settled timesheet that does not yet have one.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkStudySalaryScheduler {

    private final WorkStudySalarySettlementService settlementService;

    @Scheduled(cron = "0 0 3 * * *")
    public void dailySettle() {
        settlementService.runOnce("scheduled");
    }
}
