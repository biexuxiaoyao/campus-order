import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotifyPrefsDto } from './dto/update-notify-prefs.dto';

const DEFAULT_NOTIFY_PREFS = {
  pickRemind: true,
  newOrder: true,
  refundResult: true,
  promotion: false,
  groupProgress: true,
};

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取用户基本信息（昵称、头像、手机号）
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true, avatar: true, phone: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  /**
   * 更新用户基本信息
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { nickname: true, avatar: true, phone: true },
    });
  }

  /**
   * 获取通知偏好设置，不存在时自动创建默认配置
   */
  async getNotificationPrefs(userId: string, tenantId: string) {
    let pref = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      pref = await this.prisma.notificationPreference.create({
        data: {
          userId,
          tenantId,
          prefs: DEFAULT_NOTIFY_PREFS,
        },
      });
    }

    return pref.prefs;
  }

  /**
   * 更新通知偏好设置（upsert）
   */
  async updateNotificationPrefs(
    userId: string,
    tenantId: string,
    dto: UpdateNotifyPrefsDto,
  ) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    const currentPrefs =
      (existing?.prefs as Record<string, unknown>) || DEFAULT_NOTIFY_PREFS;
    const merged = { ...currentPrefs, ...dto.prefs };

    const pref = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, tenantId, prefs: merged },
      update: { prefs: merged },
    });

    return pref.prefs;
  }

  /**
   * 申请数据导出（GDPR合规 — stub）
   */
  async requestDataExport(userId: string, tenantId: string) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        operatorId: userId,
        action: 'DATA_EXPORT_REQUEST',
        targetType: 'User',
        targetId: userId,
        detail: { status: 'pending' },
      },
    });

    return { message: '数据导出请求已提交，我们将在7个工作日内处理' };
  }

  /**
   * 申请注销账户（stub — 完整实现在 V2）
   */
  deactivateAccount(_userId: string) {
    return { message: '账户已申请注销，将在30天后生效' };
  }
}
