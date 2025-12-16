import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { PushService } from './push.service';
import { PushSubscribeDto } from './dto/push-subscribe.dto';

@ApiTags('Push')
@Controller('push')
export class PushController {
  constructor(private pushService: PushService) {}

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '푸시 알림 구독' })
  async subscribe(
    @Request() req: { user: { userId: number } },
    @Body() subscribeDto: PushSubscribeDto,
  ) {
    const subscription = await this.pushService.subscribe(req.user.userId, {
      endpoint: subscribeDto.endpoint,
      keys: {
        p256dh: subscribeDto.p256dh,
        auth: subscribeDto.auth,
      },
    });

    return {
      success: true,
      subscription,
    };
  }

  @Delete('unsubscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '푸시 알림 구독 해제' })
  async unsubscribe(
    @Request() req: { user: { userId: number } },
    @Body() body: { endpoint: string },
  ) {
    await this.pushService.unsubscribe(req.user.userId, body.endpoint);
    return { success: true };
  }
}
