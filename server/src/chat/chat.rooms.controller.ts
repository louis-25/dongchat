import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatRoomsService } from './chat.rooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRoomDto } from './dto/create-room.dto';

@ApiTags('ChatRooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat/rooms')
export class ChatRoomsController {
  constructor(private chatRoomsService: ChatRoomsService) {}

  @Post()
  @ApiOperation({ summary: '채팅방 생성 (1:1 또는 그룹)' })
  async create(
    @Req() req: { user: { userId: number } },
    @Body() dto: CreateRoomDto,
  ) {
    return this.chatRoomsService.createRoom(Number(req.user.userId), dto);
  }

  @Get()
  @ApiOperation({ summary: '내 채팅방 목록' })
  async list(@Req() req: { user: { userId: number } }) {
    return this.chatRoomsService.listRoomsByUser(Number(req.user.userId));
  }
}
