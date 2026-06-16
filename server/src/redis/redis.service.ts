import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly prefix: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.prefix = process.env.REDIS_PREFIX || 'cache:';
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Build a full cache key by prepending the configured prefix.
   */
  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  /**
   * Get a cached value by key. Automatically deserializes JSON objects.
   */
  async get<T = any>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.key(key));
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /**
   * Set a cache value with an optional TTL (default 60 seconds).
   * Objects are automatically JSON-serialized.
   */
  async set(key: string, value: any, ttl: number = 60): Promise<'OK'> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);

    if (ttl > 0) {
      return this.redis.setex(this.key(key), ttl, serialized);
    }
    return this.redis.set(this.key(key), serialized);
  }

  /**
   * Delete a single cache key.
   */
  async del(key: string): Promise<number> {
    return this.redis.del(this.key(key));
  }

  /**
   * Delete all keys matching a glob pattern (e.g. "dish:*").
   */
  async delPattern(pattern: string): Promise<number> {
    const keys = await this.redis.keys(this.key(pattern));
    if (keys.length === 0) return 0;
    return this.redis.del(...keys);
  }

  /**
   * Check whether a key exists in cache.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(this.key(key));
    return result === 1;
  }

  /**
   * Increment a counter key. Returns the new value.
   */
  async incr(key: string): Promise<number> {
    return this.redis.incr(this.key(key));
  }

  /**
   * Set or update the TTL on an existing key.
   */
  async expire(key: string, ttl: number): Promise<number> {
    return this.redis.expire(this.key(key), ttl);
  }

  /**
   * Get the underlying ioredis client for advanced usage.
   */
  getClient(): Redis {
    return this.redis;
  }
}
