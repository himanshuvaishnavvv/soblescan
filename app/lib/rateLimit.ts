const requestLog = new Map<string, number[]>();

export function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(key) || []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    requestLog.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return false;
}