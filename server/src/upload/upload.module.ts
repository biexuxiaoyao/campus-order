import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { QiniuService } from './qiniu.service';

@Module({
  controllers: [UploadController],
  providers: [UploadService, QiniuService],
  exports: [UploadService, QiniuService],
})
export class UploadModule {}
