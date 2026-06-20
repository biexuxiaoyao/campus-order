import { Injectable, Optional, BadRequestException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { QiniuService } from './qiniu.service';

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @Optional() private readonly qiniuService?: QiniuService,
  ) {}

  /**
   * Save a single file and return its URL path.
   * Uses Qiniu Kodo when configured, otherwise falls back to local storage.
   */
  async saveFile(file: Express.Multer.File, tenantId: string): Promise<string> {
    const ext = this.extractExt(file.originalname);
    this.validateExt(ext);

    const filename = `${crypto.randomUUID()}${ext}`;
    const key = `${tenantId}/${filename}`;

    // ---- Qiniu path ----
    if (this.qiniuService?.isConfigured()) {
      try {
        const url = await this.qiniuService.uploadFile(file.path, key);
        // Remove the temp file multer wrote
        await fs.unlink(file.path).catch(() => {});
        return url;
      } catch (err) {
        this.logger.error(`七牛云上传失败，回退到本地存储: ${(err as Error).message}`);
        // Fall through to local storage
      }
    }

    // ---- Local fallback ----
    const dir = await this.getUploadDir(tenantId);
    const destPath = path.join(dir, filename);

    await fs.copyFile(file.path, destPath);
    // Remove the temp file multer wrote
    await fs.unlink(file.path).catch(() => {});

    return `/uploads/${tenantId}/${filename}`;
  }

  /**
   * Save multiple files and return their URL paths.
   */
  async saveFiles(
    files: Express.Multer.File[],
    tenantId: string,
  ): Promise<string[]> {
    const results = await Promise.all(
      files.map((file) => this.saveFile(file, tenantId)),
    );
    return results;
  }

  /**
   * Delete a file by its URL path.
   * Handles both Qiniu CDN URLs and local /uploads/ paths.
   */
  async deleteFile(url: string): Promise<void> {
    // ---- Qiniu path ----
    if (this.qiniuService?.isConfigured()) {
      const key = this.qiniuService.extractKey(url);
      if (key) {
        await this.qiniuService.deleteFile(key);
        return;
      }
    }

    // ---- Local fallback ----
    // Prevent directory traversal — only allow paths under the upload dir
    const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');

    // Remove leading /uploads/ prefix so we get the relative path
    const relative = url.replace(/^\/uploads\//, '');
    if (!relative || relative.includes('..')) {
      throw new BadRequestException('无效的文件路径');
    }

    const fullPath = path.resolve(uploadRoot, relative);

    // Safety: ensure resolved path still lives under upload root
    if (!fullPath.startsWith(uploadRoot)) {
      throw new BadRequestException('无效的文件路径');
    }

    await fs.unlink(fullPath);
  }

  /**
   * Get or create the tenant-specific upload directory.
   */
  async getUploadDir(tenantId: string): Promise<string> {
    const root = path.resolve(process.env.UPLOAD_DIR || './uploads');
    const dir = path.join(root, tenantId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractExt(originalName: string): string {
    const ext = originalName
      .substring(originalName.lastIndexOf('.'))
      .toLowerCase();
    // If there's no dot or the original is ".jpg", just return ".jpg"
    if (!ext || ext === originalName) {
      return '.jpg';
    }
    return ext;
  }

  private validateExt(ext: string): void {
    if (!ALLOWED_EXTS.includes(ext)) {
      throw new BadRequestException(
        `不支持的文件类型: ${ext}。仅允许: ${ALLOWED_EXTS.join(', ')}`,
      );
    }
  }
}
