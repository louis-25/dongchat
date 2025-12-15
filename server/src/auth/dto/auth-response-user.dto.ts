import { ApiProperty } from '@nestjs/swagger';

/**
 * 인증 응답의 사용자 정보 DTO
 */
export class AuthResponseDtoUser {
  @ApiProperty({
    description: '사용자 ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: '사용자명',
    example: 'testuser',
  })
  username: string;

  @ApiProperty({
    description: '사용자 역할',
    example: 'USER',
    enum: ['USER', 'ADMIN'],
  })
  role: string;

  @ApiProperty({
    description: '프로필 이미지 URL',
    example: null,
    nullable: true,
  })
  profileImage: string | null;
}

