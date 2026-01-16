/**
 * Rate limiter utility using Cloudflare KV Store
 * Implements sliding window rate limiting
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitSettings {
  authenticated: {
    read: RateLimitConfig;
    write: RateLimitConfig;
  };
  anonymous: {
    read: RateLimitConfig;
    write: RateLimitConfig;
  };
}

/**
 * RateLimiter class for KV-based rate limiting
 * Uses sliding window implementation with 1-minute windows
 */
export class RateLimiter {
  private kv: KVNamespace;
  private readonly windowMs = 60 * 1000; // 1 minute
  private settings: RateLimitSettings;

  constructor(kv: KVNamespace) {
    this.kv = kv;
    this.settings = {
      authenticated: {
        read: { maxRequests: 100, windowMs: this.windowMs },
        write: { maxRequests: 10, windowMs: this.windowMs },
      },
      anonymous: {
        read: { maxRequests: 30, windowMs: this.windowMs },
        write: { maxRequests: 0, windowMs: this.windowMs },
      },
    };
  }

  /**
   * Check if a request should be allowed
   * @param userId - User ID or 'anonymous'
   * @param action - 'read' or 'write'
   * @param isAuthenticated - Whether user is authenticated
   * @returns RateLimitResult with allowed status and remaining count
   */
  async checkLimit(
    userId: string,
    action: 'read' | 'write',
    isAuthenticated: boolean = false
  ): Promise<RateLimitResult> {
    const config = isAuthenticated
      ? this.settings.authenticated[action]
      : this.settings.anonymous[action];

    // Check if anonymous users are allowed for write actions
    if (!isAuthenticated && action === 'write' && config.maxRequests === 0) {
      const now = Date.now();
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + this.windowMs,
      };
    }

    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const key = `rate_limit:${userId}:${action}:${windowStart}`;

    try {
      // Get current count from KV
      const countStr = await this.kv.get<string>(key);
      const count = countStr ? parseInt(countStr, 10) : 0;

      const remaining = Math.max(0, config.maxRequests - count);
      const allowed = count < config.maxRequests;

      if (allowed) {
        // Increment counter and set TTL
        await this.kv.put(key, String(count + 1), {
          expirationTtl: Math.ceil(this.windowMs / 1000) + 10, // Add 10s buffer
        });
      }

      const resetTime = windowStart + this.windowMs;

      return {
        allowed,
        remaining,
        resetTime,
      };
    } catch (error) {
      // If KV fails, log and allow request (fail open)
      console.error('Rate limiter KV error:', error);
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: now + this.windowMs,
      };
    }
  }

  /**
   * Check multiple actions for a single user
   * @param userId - User ID or 'anonymous'
   * @param actions - Array of action types to check
   * @param isAuthenticated - Whether user is authenticated
   * @returns Object with results for each action
   */
  async checkMultiple(
    userId: string,
    actions: Array<'read' | 'write'>,
    isAuthenticated: boolean = false
  ): Promise<Record<string, RateLimitResult>> {
    const results: Record<string, RateLimitResult> = {};

    for (const action of actions) {
      results[action] = await this.checkLimit(userId, action, isAuthenticated);
    }

    return results;
  }

  /**
   * Reset rate limit for a user and action
   * @param userId - User ID
   * @param action - Action type
   * @returns Promise<boolean>
   */
  async resetLimit(userId: string, action: 'read' | 'write'): Promise<boolean> {
    try {
      const now = Date.now();
      const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
      const key = `rate_limit:${userId}:${action}:${windowStart}`;
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error('Failed to reset rate limit:', error);
      return false;
    }
  }

  /**
   * Update rate limit settings
   * @param settings - New settings
   */
  updateSettings(settings: Partial<RateLimitSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
    };
  }
}

/**
 * Create a rate limiter instance
 * @param kv - KV namespace
 * @returns RateLimiter instance
 */
export function createRateLimiter(kv: KVNamespace): RateLimiter {
  return new RateLimiter(kv);
}
