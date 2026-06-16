import { Injectable, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

@Injectable()
export class UploadService {
  /**
   * Save a single file and return its URL path.
   */
  async saveFile(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<string> {
    const ext = this.extractExt(file.originalname);
    this.validateExt(ext);

    const dir = await this.getUploadDir(tenantId);
    const filename = `${crypto.randomUUID()}${ext}`;
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
   */
  async deleteFile(url: string): Promise<void> {
    // Prevent directory traversal — only allow paths under the upload dir
    const uploadRoot = path.resolve(
      process.env.UPLOAD_DIR || './uploads',
    );

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
