import { ApiProperty } from '@nestjs/swagger';

/**
 * 친구 요청 보내기 DTO
 */
export class SendFriendRequestDto {
  @ApiProperty({
    description: '친구 요청을 보낼 사용자의 아이디',
    example: 'testuser',
  })
  username: string;
}

