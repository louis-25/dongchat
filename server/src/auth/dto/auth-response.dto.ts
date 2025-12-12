import { ApiProperty } from '@nestjs/swagger';

/**
 * 인증 응답 DTO
 */
export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT 액세스 토큰',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description: 'JWT 리프레시 토큰',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refresh_token: string;

  @ApiProperty({
    description: '사용자 정보',
    example: { id: 1, username: 'testuser', role: 'USER', profileImage: null },
  })
  user: {
    id: number;
    username: string;
    role: string;
    profileImage: string | null;
  };
}
