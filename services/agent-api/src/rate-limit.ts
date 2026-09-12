export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): RateLimitDecision {
    const currentTime = this.now();
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= currentTime
        ? { count: 0, resetAt: currentTime + this.windowMs }
        : current;

    bucket.count += 1;
    this.buckets.set(key, bucket);
    this.operations += 1;

    if (this.operations % 250 === 0) this.removeExpired(currentTime);

    return {
      allowed: bucket.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  private removeExpired(currentTime: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= currentTime) this.buckets.delete(key);
    }
  }
}
