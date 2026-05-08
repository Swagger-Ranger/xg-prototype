import api from './index';

export interface WeatherView {
  city: string | null;
  summary: string | null;
}

/**
 * One-line Chinese weather summary for the campus dashboard. The backend
 * resolves the school city from tenant settings by default; pass an explicit
 * city to override (rarely needed). Returns {@code summary: null} when the
 * weather can't be rendered — UI should omit the segment silently.
 */
export function getCurrentWeather(city?: string): Promise<WeatherView> {
  return api
    .get('/weather/current', { params: city ? { city } : undefined })
    .then((res) => res.data);
}
