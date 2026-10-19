// One shared limit per app instance; no visitor data or timers are needed.
export function createRateLimiter({ limit = 30, windowMs = 60_000, now = () => performance.now() } = {}) {
  let count = 0;
  let resetAt = 0;

  // Return 0 when allowed, or the number of seconds until a retry is allowed.
  return () => {
    const time = now();
    if (time >= resetAt) {
      count = 0;
      resetAt = time + windowMs;
    }
    if (count >= limit) return Math.ceil((resetAt - time) / 1000);
    count += 1;
    return 0;
  };
}
