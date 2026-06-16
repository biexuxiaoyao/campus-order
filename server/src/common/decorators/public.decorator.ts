import { SetMetadata } from '@nestjs/common';
import { PUBLIC_KEY } from '../guards/tenant.guard';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
