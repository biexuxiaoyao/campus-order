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
      fs.writeFileSync(path.join(outputDir, 'server'), ''); // placeholder

      // Copy processed source into output
      this.copyDir(sourceDir, path.join(outputDir, 'server'));

      // docker-compose
      const dbName = `campus_${tenant.id.substring(0, 8)}`;
      fs.writeFileSync(
        path.join(deployDir, 'docker-compose.yml'),
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
          '      - ./init.sql:/docker-entrypoint-initdb.d/init.sql',
          '  app:',
          '    build: ./server',
          '    ports:',
          '      - "3000:3000"',
          '    depends_on:',
          '      - mysql',
          '    environment:',
          `      DATABASE_URL: mysql://root:\${DB_ROOT_PASSWORD:-changeme}@mysql:3306/${dbName}?charset=utf8mb4`,
          '      JWT_SECRET: ${JWT_SECRET:-change-me-in-production}',
          'volumes:',
          '  mysql_data:',
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
          '## 部署',
          '1. 安装 Docker + Docker Compose',
          '2. 设置环境变量 DB_ROOT_PASSWORD / JWT_SECRET',
          '3. `docker-compose up -d`',
          '4. 管理后台: http://your-server:3000/admin',
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
