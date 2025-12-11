import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({
    required: false,
    description: '방 이름 (그룹일 때 주로 사용)',
  })
  name?: string;

  @ApiProperty({ required: false, description: '그룹 여부, 기본 false' })
  isGroup?: boolean;

  @ApiProperty({
    isArray: true,
    type: String,
    description: '참여자 username 목록 (현재 사용자 제외해도 서버가 포함시킴)',
    example: ['user1', 'user2'],
  })
  participantUsernames: string[];
}
