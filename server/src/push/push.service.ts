import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from './push-subscription.entity';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private pushSubscriptionRepository: Repository<PushSubscription>,
    private configService: ConfigService,
  ) {
    // VAPID 키 설정
    const vapidPublicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivateKey =
      this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidSubject = this.configService.get<string>(
      'VAPID_SUBJECT',
      'mailto:admin@dongchat.com',
    );

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      this.logger.log('VAPID keys configured');
    } else {
      this.logger.warn(
        'VAPID keys not configured. Push notifications will not work.',
      );
    }
  }

  /**
   * 푸시 구독 저장
   */
  async subscribe(
    userId: number,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
  ): Promise<PushSubscription> {
    // 기존 구독이 있으면 업데이트, 없으면 생성
    const existing = await this.pushSubscriptionRepository.findOne({
      where: { userId, endpoint: subscription.endpoint },
    });

    if (existing) {
      existing.p256dh = subscription.keys.p256dh;
      existing.auth = subscription.keys.auth;
      return await this.pushSubscriptionRepository.save(existing);
    }

    const pushSubscription = this.pushSubscriptionRepository.create({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });

    return await this.pushSubscriptionRepository.save(pushSubscription);
  }

  /**
   * 푸시 구독 해제
   */
  async unsubscribe(userId: number, endpoint: string): Promise<void> {
    await this.pushSubscriptionRepository.delete({ userId, endpoint });
  }

  /**
   * 사용자의 모든 푸시 구독 조회
   */
  async getUserSubscriptions(
    userId: number,
  ): Promise<PushSubscription[]> {
    return await this.pushSubscriptionRepository.find({
      where: { userId },
    });
  }

  /**
   * 푸시 알림 전송
   */
  async sendNotification(
    userId: number,
    payload: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      data?: Record<string, unknown>;
    },
  ): Promise<void> {
    const subscriptions = await this.getUserSubscriptions(userId);

    const notificationPayload = JSON.stringify(payload);

    const promises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          notificationPayload,
        );
        this.logger.log(`Push notification sent to user ${userId}`);
      } catch (error) {
        this.logger.error(
          `Failed to send push notification to user ${userId}:`,
          error,
        );

        // 구독이 만료되었거나 유효하지 않은 경우 삭제
        if (error.statusCode === 410 || error.statusCode === 404) {
          await this.unsubscribe(userId, subscription.endpoint);
          this.logger.log(
            `Removed invalid subscription for user ${userId}`,
          );
        }
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 여러 사용자에게 푸시 알림 전송
   */
  async sendNotificationToUsers(
    userIds: number[],
    payload: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      data?: Record<string, unknown>;
    },
  ): Promise<void> {
    const promises = userIds.map((userId) =>
      this.sendNotification(userId, payload),
    );
    await Promise.allSettled(promises);
  }
}

