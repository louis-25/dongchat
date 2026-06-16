import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Message } from './message.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
import { ChatQueryDto } from './dto/chat-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest {
  user: { userId: number };
}

/**
 * 채팅 메시지 관련 API를 처리하는 컨트롤러입니다.
 */
@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(ChatRoomParticipant)
    private participantRepository: Repository<ChatRoomParticipant>,
  ) {}

  /**
   * 메시지 목록 조회 API
   * 요청자가 참여 중인 방의 메시지만 조회됩니다. 페이지네이션을 지원합니다.
   */
  @Get()
  @ApiOperation({
    summary: '메시지 조회',
    description:
      '요청자가 참여 중인 채팅방의 메시지를 페이지네이션하여 조회합니다.',
  })
  @ApiQuery({
    name: 'roomId',
    required: false,
    type: Number,
    description: '특정 방만 조회 (멤버여야 함)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '페이지 번호',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '페이지당 항목 수',
    example: 50,
  })
  @ApiResponse({ status: 200, description: '메시지 목록', type: [Message] })
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Query() query: ChatQueryDto,
  ) {
    const userId = req.user.userId;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    // 요청자가 참여 중인 방 목록
    const memberships = await this.participantRepository.find({
      where: { user: { id: userId } },
      relations: ['room'],
    });
    const myRoomIds = memberships.map((m) => m.room.id);

    // 조회 대상 방 결정
    let targetRoomIds: number[];
    if (query.roomId !== undefined) {
      const roomId = Number(query.roomId);
      if (!myRoomIds.includes(roomId)) {
        throw new ForbiddenException('해당 방의 메시지를 조회할 권한이 없습니다.');
      }
      targetRoomIds = [roomId];
    } else {
      targetRoomIds = myRoomIds;
    }

    // 참여 중인 방이 없으면 빈 배열
    if (targetRoomIds.length === 0) return [];

    return this.messageRepository.find({
      where: { room: { id: In(targetRoomIds) } },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
  }
}
