/**
 * Browser geolocation wrapper. Returns null on permission denial / API error /
 * timeout — callers should treat absence as "user did not share their location"
 * rather than as a hard failure (校园场景下学生有可能拒绝授权)。
 */

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export function getCurrentLocation(timeoutMs = 8000): Promise<GeoLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      resolve(null);
    };
    const timer = setTimeout(fail, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 0,
          capturedAt: new Date(pos.timestamp).toISOString(),
        });
      },
      () => {
        clearTimeout(timer);
        fail();
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/**
 * Build a public OpenStreetMap link that opens the spot in a new tab. Free,
 * no API key, no domain registration required (vs Baidu / Gaode).
 */
export function osmMapUrl(lat: number, lng: number, zoom = 16): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}
