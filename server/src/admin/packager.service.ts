import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class PackagerService {
  constructor(private prisma: PrismaService) {}

  /** Module → server source directories to include/exclude */
  private static MODULE_DIRS: Record<string, string[]> = {
    'group-meal': ['src/group-order'],
    prepaid: ['src/prepaid'],
    discount: ['src/discount'],
    points: ['src/points'],
    coupon: ['src/coupon'],
    printer: ['src/printer'],
    'push-notify': ['src/notify'],
    'advanced-stats': [],
    'dine-in': [],
    delivery: [],
    base: [],
  };

  /**
   * Execute source code delivery.
   * Copies server/src, strips unpurchased module dirs, injects watermarks,
   * generates deploy config, zips everything.
   */
  async executeDelivery(
    deliveryId: string,
  ): Promise<{ success: boolean; outputZip?: string; error?: string }> {
    const delivery = await this.prisma.sourceDelivery.findUnique({
      where: { id: deliveryId },
      include: { tenant: true },
    });
    if (!delivery) return { success: false, error: 'Delivery not found' };

    await this.prisma.sourceDelivery.update({
      where: { id: deliveryId },
      data: { status: 'processing' },
    });

    try {
      const tenant = delivery.tenant;
      const moduleSnapshot = (delivery.moduleSnapshot as string[]) || [];
      const projectRoot = path.join(process.cwd(), '..');
      const deliveriesDir = path.join(process.cwd(), 'deliveries');
      const workDir = path.join(deliveriesDir, deliveryId);
      const sourceDir = path.join(workDir, 'source');
      const outputDir = path.join(workDir, 'output');
      fs.mkdirSync(outputDir, { recursive: true });

      // ── 1. Copy server source (skip node_modules, dist, .git, deliveries) ──
      this.copyDir(path.join(projectRoot, 'server'), sourceDir, {
        skip: new Set([
          'node_modules',
          'dist',
          '.git',
          'deliveries',
          '.claude',
        ]),
      });

      // ── 2. Strip unpurchased module directories ──
      const removedModules: string[] = [];
      for (const modId of Object.keys(PackagerService.MODULE_DIRS)) {
        if (modId === 'base') continue;
        if (!moduleSnapshot.includes(modId)) {
          for (const dir of PackagerService.MODULE_DIRS[modId]) {
            const dirPath = path.join(sourceDir, dir);
            if (fs.existsSync(dirPath)) {
              fs.rmSync(dirPath, { recursive: true, force: true });
              removedModules.push(modId);
            }
          }
        }
      }

      // ── 3. Inject watermarks into .ts/.js/.vue files ──
      const watermarkHeader = `/* @watermark ${delivery.watermarkId} @tenant ${tenant.id} @delivered ${new Date().toISOString()} */\n`;
      let watermarkedFiles = 0;
      this.walkFiles(sourceDir, (filePath) => {
        const ext = path.extname(filePath);
        if (['.ts', '.js', '.vue', '.json'].includes(ext)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          if (!content.includes('@watermark')) {
            fs.writeFileSync(filePath, watermarkHeader + content);
            watermarkedFiles++;
          }
        }
      });

      // ── 4. Generate deploy config ──
      const deployDir = path.join(outputDir, 'deploy');
      fs.mkdirSync(deployDir, { recursive: true });

      // Copy processed server source
      this.copyDir(sourceDir, path.join(outputDir, 'server'));

      // Copy admin-web dist (if exists)
      const adminDist = path.join(projectRoot, 'admin-web', 'dist');
      if (fs.existsSync(adminDist)) {
        this.copyDir(adminDist, path.join(outputDir, 'admin-web'));
      }

      // Generate server Dockerfile
      const dbName = `campus_${tenant.id.substring(0, 8)}`;
      fs.writeFileSync(
        path.join(outputDir, 'server', 'Dockerfile'),
        [
          'FROM node:22-alpine',
          'WORKDIR /app',
          'COPY package*.json ./',
          'RUN npm ci --omit=dev',
          'COPY . .',
          'RUN npx prisma generate',
          'RUN npm run build',
          'EXPOSE 3000',
          'CMD npx prisma migrate deploy && node dist/src/main.js',
        ].join('\n'),
      );

      // Generate init.sql for MySQL
      fs.writeFileSync(
        path.join(deployDir, 'init.sql'),
        `CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`,
      );

      // docker-compose with nginx for admin-web
      fs.writeFileSync(
        path.join(outputDir, 'docker-compose.yml'),
        [
          'version: "3.8"',
          'services:',
          '  mysql:',
          '    image: mysql:8.0',
          '    environment:',
          `      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASSWORD:-changeme}`,
          `      MYSQL_DATABASE: ${dbName}`,
          '    volumes:',
          '      - mysql_data:/var/lib/mysql',
          '      - ./deploy/init.sql:/docker-entrypoint-initdb.d/init.sql',
          '    ports:',
          '      - "3306:3306"',
          '  app:',
          '    build: ./server',
          '    ports:',
          '      - "3000:3000"',
          '    depends_on:',
          '      - mysql',
          '    environment:',
          `      DATABASE_URL: mysql://root:\${DB_ROOT_PASSWORD:-changeme}@mysql:3306/${dbName}?charset=utf8mb4&allowPublicKeyRetrieval=true`,
          '      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}',
          '      PORT: 3000',
          '    restart: unless-stopped',
          '  nginx:',
          '    image: nginx:alpine',
          '    ports:',
          '      - "80:80"',
          '    volumes:',
          '      - ./admin-web:/usr/share/nginx/html/admin:ro',
          `      - ./deploy/nginx.conf:/etc/nginx/conf.d/default.conf:ro`,
          '    depends_on:',
          '      - app',
          'volumes:',
          '  mysql_data:',
        ].join('\n'),
      );

      // nginx config
      fs.writeFileSync(
        path.join(deployDir, 'nginx.conf'),
        [
          'server {',
          '    listen 80;',
          '    location /admin {',
          '        alias /usr/share/nginx/html/admin;',
          '        index index.html;',
          '        try_files $uri $uri/ /admin/index.html;',
          '    }',
          '    location /api {',
          '        proxy_pass http://app:3000;',
          '        proxy_set_header Host $host;',
          '        proxy_set_header X-Real-IP $remote_addr;',
          '    }',
          '    location /uploads {',
          '        proxy_pass http://app:3000;',
          '    }',
          '}',
        ].join('\n'),
      );

      // README
      fs.writeFileSync(
        path.join(outputDir, 'README.md'),
        [
          `# ${tenant.name} — 点餐系统源码交付包`,
          '',
          `- 交付版本: ${delivery.version}`,
          `- 交付日期: ${new Date().toISOString().split('T')[0]}`,
          `- 水印ID: ${delivery.watermarkId}`,
          `- 包含模块: ${moduleSnapshot.join(', ')}`,
          '',
          '## 目录结构',
          '```',
          '├── server/          # NestJS 后端源码',
          '├── admin-web/       # 商家管理后台 (构建产物)',
          '├── docker-compose.yml',
          '├── deploy/',
          '│   ├── init.sql      # 数据库初始化',
          '│   └── nginx.conf    # Nginx 配置',
          '└── README.md',
          '```',
          '',
          '## 部署步骤',
          '1. 安装 Docker (20.10+) + Docker Compose (v2)',
          '2. 设置环境变量: `export DB_ROOT_PASSWORD=yourpassword JWT_SECRET=your_jwt_secret`',
          '3. 启动: `docker-compose up -d`',
          '4. 初始化数据库: `docker-compose exec app npx prisma migrate deploy`',
          '5. (可选) 导入种子数据: `docker-compose exec app npx ts-node prisma/seed.ts`',
          '',
          '## 访问地址',
          `- 管理后台: http://<服务器IP>/admin`,
          `- 后端 API: http://<服务器IP>/api`,
          '',
          '## 首次配置',
          '1. 登录管理后台 (默认账号联系交付方获取)',
          '2. 在「品牌配置」中设置小程序 AppID 等信息',
          '3. 在「门店管理」中创建门店和菜品',
          '',
          '## 小程序端',
          '小程序源码请联系交付方获取，使用 uni-app 编译为微信小程序。',
        ].join('\n'),
      );

      // ── 5. Zip ──
      const zipPath = path.join(deliveriesDir, `${deliveryId}.zip`);
      await this.createZip(outputDir, zipPath);

      // ── 6. Checksum + update ──
      const checksum = crypto
        .createHash('sha256')
        .update(fs.readFileSync(zipPath))
        .digest('hex');

      await this.prisma.sourceDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'completed',
          checksum,
          downloadUrl: `/api/admin/source-delivery/${deliveryId}/download`,
        },
      });

      // Cleanup work dir
      fs.rmSync(workDir, { recursive: true, force: true });

      return { success: true, outputZip: zipPath };
    } catch (err: any) {
      console.error(`[Packager] ${deliveryId} failed:`, err.message);
      await this.prisma.sourceDelivery.update({
        where: { id: deliveryId },
        data: { status: 'failed' },
      });
      return { success: false, error: err.message };
    }
  }

  getDownloadPath(deliveryId: string): string {
    return path.join(process.cwd(), 'deliveries', `${deliveryId}.zip`);
  }

  // ── Helpers ──

  private copyDir(
    src: string,
    dest: string,
    opts?: { skip?: Set<string> },
  ): void {
    const skip = opts?.skip || new Set();
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDir(s, d, opts);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }

  private walkFiles(dir: string, fn: (filePath: string) => void): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        this.walkFiles(p, fn);
      } else {
        fn(p);
      }
    }
  }

  private async createZip(sourceDir: string, zipPath: string): Promise<void> {
    const { exec } = await import('child_process');
    return new Promise((resolve, reject) => {
      const psCmd = `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${zipPath}" -Force`;
      exec(`powershell -Command "${psCmd}"`, { timeout: 60000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
