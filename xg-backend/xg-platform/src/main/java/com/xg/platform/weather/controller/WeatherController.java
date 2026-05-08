package com.xg.platform.weather.controller;

import com.xg.common.base.R;
import com.xg.platform.tenant.dto.TenantSettingsView;
import com.xg.platform.tenant.service.TenantSettingsService;
import com.xg.platform.weather.client.WeatherClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only weather endpoint for the campus dashboard's welcome strip.
 * Backend-resolved (rather than direct AMap call from the browser) to keep
 * the API key off the client. Resolves the school city from tenant settings
 * by default, but lets a caller override via {@code ?city=}.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/weather")
@RequiredArgsConstructor
public class WeatherController {

    private final WeatherClient weatherClient;
    private final TenantSettingsService tenantSettingsService;

    /**
     * Returns a one-line Chinese weather summary like "杭州当前晴 18°C, 西北
     * 风 3 级, 注意天气变化" or {@code summary: null} when:
     *   · no city configured / overridden
     *   · city not in WeatherClient's whitelist
     *   · AMap key not configured / upstream errored
     *
     * Always 200; {@code summary: null} = "no weather to show", let the UI
     * gracefully omit the segment.
     */
    @GetMapping("/current")
    public R<WeatherView> current(@RequestParam(required = false) String city) {
        String resolvedCity = (city != null && !city.isBlank())
                ? city.trim()
                : resolveTenantCity();

        WeatherView view = new WeatherView();
        view.setCity(resolvedCity);
        if (resolvedCity == null || resolvedCity.isBlank()) {
            return R.ok(view);
        }
        view.setSummary(weatherClient.fetchSummary(resolvedCity));
        return R.ok(view);
    }

    private String resolveTenantCity() {
        try {
            TenantSettingsView settings = tenantSettingsService.getCurrent();
            return settings.getSchoolCity();
        } catch (Exception e) {
            log.warn("could not resolve tenant.school_city: {}", e.getMessage());
            return null;
        }
    }

    @lombok.Data
    public static class WeatherView {
        private String city;
        private String summary;
    }
}
