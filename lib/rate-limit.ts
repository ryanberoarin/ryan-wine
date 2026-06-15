type Entry = { count: number; reset: number }
const store = new Map<string, Entry>()

/**
 * Returns true if the request is allowed, false if rate limited.
 * key: unique string (e.g. "admin-login:1.2.3.4")
 * max: max requests per window
 * windowMs: window duration in milliseconds
 *
 * NOTE: in-memory — resets on cold start. Provides per-instance protection
 * which is sufficient for low-traffic apps. For global rate limiting across
 * all Vercel instances, use Upstash Redis.
 */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}

export function retryAfterSeconds(key: string): number {
  const entry = store.get(key)
  if (!entry) return 0
  return Math.ceil((entry.reset - Date.now()) / 1000)
}
