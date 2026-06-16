import {
  Controller,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFiles,
  Headers,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { DeleteFileDto } from './dto/delete-file.dto';
import { multerConfig } from './multer.config';

@Controller('api/upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'files', maxCount: 9 }],
      multerConfig,
    ),
  )
  async upload(
    @UploadedFiles() fileFields: { files?: Express.Multer.File[] },
    @Headers('x-tenant-id') tenantId: string,
  ): Promise<{ urls: string[] }> {
    const files = fileFields.files ?? [];
    const urls = await this.uploadService.saveFiles(files, tenantId);
    return { urls };
  }

  @Delete()
  async delete(
    @Body() dto: DeleteFileDto,
  ): Promise<{ deleted: boolean }> {
    await this.uploadService.deleteFile(dto.url);
    return { deleted: true };
  }
}
