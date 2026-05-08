/**
 * Compose a user-facing toast message from an unknown error thrown by the
 * shared API client. The shared client rejects with {@code ApiError} (a
 * subclass of {@code Error}) carrying the backend's localized message, so we
 * surface it as the toast detail and fall back to {@code prefix} alone when
 * the error has no detail (e.g. a network drop with empty Error.message).
 */
export function describeApiError(err: unknown, prefix: string): string {
  const detail = err instanceof Error ? err.message : '';
  return detail ? `${prefix}：${detail}` : prefix;
}
