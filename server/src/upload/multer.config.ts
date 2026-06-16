import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

export const multerConfig: MulterOptions = {
  dest: process.env.UPLOAD_DIR || './uploads',

  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10),
    files: 9,
  },

  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ext = file.originalname
      .substring(file.originalname.lastIndexOf('.'))
      .toLowerCase();

    if (!ALLOWED_MIMES.includes(file.mimetype) && !ALLOWED_EXTS.includes(ext)) {
      return cb(
        new BadRequestException(
          `不支持的文件类型: ${ext}。仅允许: ${ALLOWED_EXTS.join(', ')}`,
        ),
        false,
      );
    }

    cb(null, true);
  },
};
