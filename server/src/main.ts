import { config } from 'dotenv';
config(); // 确保 .env 在 PrismaClient 初始化前加载

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 安全头 (X-Content-Type-Options, X-Frame-Options, HSTS, CSP 等)
  app.use(helmet());

  // 上传文件静态资源访问
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // 全局校验管道 — 自动剔除未声明字段 + 拦截非法参数
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS - 仅允许已配置的域名
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://admin.ourplatform.com'] // 管理后台域名
        : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-app-id',
      'x-tenant-id',
      'x-requested-with',
    ],
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Server running on http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
