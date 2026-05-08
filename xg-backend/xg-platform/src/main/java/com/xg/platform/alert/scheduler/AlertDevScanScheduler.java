package com.xg.platform.alert.scheduler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@Profile("dev")
@RequiredArgsConstructor
public class AlertDevScanScheduler {

    private final AlertScanScheduler scanScheduler;

    @Scheduled(fixedDelayString = "${xg.alert.dev-scan-interval-ms:120000}",
               initialDelayString = "${xg.alert.dev-scan-initial-delay-ms:60000}")
    public void devScan() {
        scanScheduler.runOnce("dev-auto");
    }
}
