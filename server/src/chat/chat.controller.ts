import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ChatQueryDto } from './dto/chat-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatMessageService, MessageView } from './chat-message.service';

interface AuthenticatedRequest {
  user: { userId: number };
}

/**
 * 채팅 메시지 관련 API를 처리하는 컨트롤러입니다.
 * Design Ref: §4.2 — cursor(before) 기반 페이지네이션.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly messageService: ChatMessageService) {}

  /**
   * 메시지 목록 조회 API (cursor 페이지네이션)
   * 요청자가 참여 중인 방의 메시지만 조회됩니다.
   */
  @Get()
  @ApiOperation({
    summary: '메시지 조회 (cursor)',
    description:
      '참여 중인 채팅방의 메시지를 before cursor 기준으로 과거 방향 페이지네이션하여 조회합니다.',
  })
  @ApiQuery({
    name: 'roomId',
    required: true,
    type: Number,
    description: '채팅방 ID (멤버여야 함)',
  })
  @ApiQuery({
    name: 'before',
    required: false,
    type: Number,
    description: '이 메시지 ID 미만의 과거 메시지',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '페이지당 항목 수',
    example: 30,
  })
  @ApiResponse({ status: 200, description: '메시지 목록(시간순)' })
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Query() query: ChatQueryDto,
  ): Promise<MessageView[]> {
    const userId = req.user.userId;

    // roomId 미지정 시 조회 대상이 없으므로 빈 배열 반환.
    if (query.roomId === undefined) return [];

    const roomId = Number(query.roomId);
    // 권한 검증 (비멤버 → CHAT_FORBIDDEN 403)
    await this.messageService.assertMembership(roomId, userId);

    const before = query.before ? Number(query.before) : undefined;
    const limit = Number(query.limit) || 30;
    return this.messageService.getRoomMessages(roomId, before, limit);
  }
}
