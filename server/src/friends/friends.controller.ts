import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';

@ApiTags('Friends')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('friends')
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  @Post('request')
  @ApiOperation({ summary: '친구 요청 보내기' })
  async request(
    @Req() req: { user: { userId: number } },
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendsService.sendRequest(req.user.userId, dto.username);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: '친구 요청 수락' })
  async accept(
    @Req() req: { user: { userId: number } },
    @Param('id') id: string,
  ) {
    return this.friendsService.respondRequest(
      Number(id),
      req.user.userId,
      'accept',
    );
  }

  @Patch(':id/block')
  @ApiOperation({ summary: '친구 요청 차단' })
  async block(
    @Req() req: { user: { userId: number } },
    @Param('id') id: string,
  ) {
    return this.friendsService.respondRequest(
      Number(id),
      req.user.userId,
      'block',
    );
  }

  @Get()
  @ApiOperation({ summary: '친구 목록 조회' })
  async list(@Req() req: { user: { userId: number } }) {
    return this.friendsService.listFriends(req.user.userId);
  }

  @Get('pending')
  @ApiOperation({ summary: '받은 친구 요청 목록 조회' })
  async pending(@Req() req: { user: { userId: number } }) {
    return this.friendsService.listPending(req.user.userId);
  }
}
