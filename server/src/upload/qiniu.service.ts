import { Injectable, Logger } from '@nestjs/common';
import * as qiniu from 'qiniu';

@Injectable()
export class QiniuService {
  private readonly logger = new Logger(QiniuService.name);

  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly bucket: string;
  private readonly domain: string;
  private readonly zone: qiniu.conf.Zone;
  private readonly mac: qiniu.auth.digest.Mac;
  private readonly config: qiniu.conf.Config;

  constructor() {
    this.accessKey = process.env.QINIU_ACCESS_KEY ?? '';
    this.secretKey = process.env.QINIU_SECRET_KEY ?? '';
    this.bucket = process.env.QINIU_BUCKET ?? '';
    this.domain = process.env.QINIU_DOMAIN ?? '';

    const zoneName = process.env.QINIU_ZONE || 'z2';
    this.zone = this.resolveZone(zoneName);

    if (this.isConfigured()) {
      this.mac = new qiniu.auth.digest.Mac(this.accessKey, this.secretKey);
      this.config = new qiniu.conf.Config();
      this.config.zone = this.zone;
      this.config.useHttpsDomain = true;

      this.logger.log(
        `七牛云已配置: bucket=${this.bucket}, domain=${this.domain}, zone=${zoneName}`,
      );
    }
  }

  /**
   * Whether all required Qiniu credentials are present.
   */
  isConfigured(): boolean {
    return !!(this.accessKey && this.secretKey && this.bucket && this.domain);
  }

  /**
   * Upload a local file to Qiniu Kodo and return the public CDN URL.
   */
  uploadFile(localPath: string, key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadToken = this.generateUploadToken(key);
      const formUploader = new qiniu.form_up.FormUploader(this.config);
      const putExtra = new qiniu.form_up.PutExtra();

      formUploader.putFile(
        uploadToken,
        key,
        localPath,
        putExtra,
        (respErr, respBody, respInfo) => {
          if (respErr) {
            this.logger.error(`七牛云上传失败: ${respErr.message}`, respErr.stack);
            return reject(respErr);
          }
          if (respInfo.statusCode === 200) {
            const url = this.publicUrl(key);
            this.logger.log(`上传成功: ${url}`);
            resolve(url);
          } else {
            const msg = `七牛云上传失败: status=${respInfo.statusCode}, body=${JSON.stringify(respBody)}`;
            this.logger.error(msg);
            reject(new Error(msg));
          }
        },
      );
    });
  }

  /**
   * Delete a file from Qiniu Kodo by its key.
   */
  deleteFile(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const bucketManager = new qiniu.rs.BucketManager(this.mac, this.config);

      bucketManager.delete(
        this.bucket,
        key,
        (respErr, respBody, respInfo) => {
          if (respErr) {
            this.logger.error(`七牛云删除失败: ${respErr.message}`, respErr.stack);
            return reject(respErr);
          }
          if (respInfo.statusCode === 200 || respInfo.statusCode === 612) {
            // 612 = file not found, treat as success (idempotent delete)
            this.logger.log(`删除成功: ${key}`);
            resolve();
          } else {
            const msg = `七牛云删除失败: status=${respInfo.statusCode}, body=${JSON.stringify(respBody)}`;
            this.logger.error(msg);
            reject(new Error(msg));
          }
        },
      );
    });
  }

  /**
   * Extract the object key from a full Qiniu CDN URL.
   */
  extractKey(url: string): string | null {
    // URL format: https://{domain}/{key}
    const prefix = `https://${this.domain}/`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length);
    }
    // Also support http
    const httpPrefix = `http://${this.domain}/`;
    if (url.startsWith(httpPrefix)) {
      return url.slice(httpPrefix.length);
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateUploadToken(key?: string): string {
    const scope = key ? `${this.bucket}:${key}` : this.bucket;
    const putPolicy = new qiniu.rs.PutPolicy({
      scope,
      expires: 7200, // 2 hours
    });
    return putPolicy.uploadToken(this.mac);
  }

  private publicUrl(key: string): string {
    // Ensure https:// prefix
    const domain = this.domain.replace(/^https?:\/\//, '');
    return `https://${domain}/${key}`;
  }

  private resolveZone(zoneName: string): qiniu.conf.Zone {
    const zones: Record<string, qiniu.conf.Zone> = {
      z0: qiniu.zone.Zone_z0,   // 华东
      z1: qiniu.zone.Zone_z1,   // 华北
      z2: qiniu.zone.Zone_z2,   // 华南
      na0: qiniu.zone.Zone_na0, // 北美
      as0: qiniu.zone.Zone_as0, // 东南亚
    };
    const zone = zones[zoneName];
    if (!zone) {
      this.logger.warn(
        `未知的七牛云区域: ${zoneName}，使用默认华南(z2)`,
      );
      return qiniu.zone.Zone_z2;
    }
    return zone;
  }
}
