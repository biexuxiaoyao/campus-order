import { Module, Global } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

/**
 * 通用模块
 *
 * 提供全局过滤器、拦截器、DTO 等基础设施。
 * ThrottlerModule 在此注册为全局，所有模块共享限流配置。
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,  // 60 秒窗口
        limit: 60,   // 窗口内最多 60 次请求
      },
    ]),
  ],
  exports: [ThrottlerModule],
})
export class CommonModule {}
