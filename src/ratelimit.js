// src/ratelimit.js — token bucket, one bucket per connection (or per user).
// Scope chosen so a runaway retry loop can't starve the demo, but normal
// human+agent traffic never notices it exists.
export function createRateLimiter({ capacity, refillPerSec }) {
  const buckets = new Map(); // key → { tokens, last }

  const probe = (key, now = Date.now()) => {
    let b = buckets.get(key);
    if (!b) {
      b = { tokens: capacity, last: now };
      buckets.set(key, b);
    }
    const elapsedSec = (now - b.last) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
    b.last = now;
    return b;
  };

  return {
    tryTake(key, cost = 1, now = Date.now()) {
      const b = probe(key, now);
      if (b.tokens >= cost) {
        b.tokens -= cost;
        return { ok: true, remaining: b.tokens };
      }
      return { ok: false, remaining: b.tokens, retryAfterMs: Math.ceil(((cost - b.tokens) / refillPerSec) * 1000) };
    },
    /** Drop state for keys with no recent activity — call periodically. */
    sweep(now = Date.now()) {
      for (const [key, b] of buckets) {
        if (now - b.last > Math.max(60_000, (capacity / refillPerSec) * 2_000)) buckets.delete(key);
      }
    },
    size() {
      return buckets.size;
    },
  };
}
