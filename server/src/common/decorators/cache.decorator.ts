import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY = 'cache:key';
export const CACHE_TTL = 'cache:ttl';
export const CACHE_EVICT = 'cache:evict';

/**
 * Mark a method's result as cacheable.
 *
 * Usage:
 *   @Cacheable(120)  // cache for 120 seconds (default 60)
 *   async getMenu(tenantId: string) { ... }
 *
 * The actual cache check/store logic is implemented in the service layer
 * (e.g. DishService) by reading this metadata via Reflect.getMetadata.
 */
export function Cacheable(ttl?: number) {
  return (target: object, propertyKey: string, descriptor: PropertyDescriptor) => {
    SetMetadata(CACHE_KEY, propertyKey)(target, propertyKey, descriptor);
    if (ttl !== undefined) {
      SetMetadata(CACHE_TTL, ttl)(target, propertyKey, descriptor);
    }
    return descriptor;
  };
}

/**
 * Evict matching cache keys after method execution.
 *
 * Usage:
 *   @CacheEvict('dish:*')
 *   async createDish(data: CreateDishDto) { ... }
 *
 * The actual eviction logic is implemented in the service layer
 * by reading this metadata via Reflect.getMetadata.
 */
export function CacheEvict(pattern: string) {
  return (target: object, propertyKey: string, descriptor: PropertyDescriptor) => {
    SetMetadata(CACHE_EVICT, pattern)(target, propertyKey, descriptor);
    return descriptor;
  };
}
