import { ApiProperty } from '@nestjs/swagger';

export class KakaoLoginDto {
  @ApiProperty({
    description: '카카오 provider 고유 ID',
    example: '1234567890',
  })
  providerId: string;

  @ApiProperty({
    description: '표시 이름',
    example: '카카오닉네임',
    required: false,
  })
  nickname?: string;

  @ApiProperty({
    description: 'username 대체 값',
    example: 'kakao_1234567890',
    required: false,
  })
  username?: string;

  @ApiProperty({
    description: '프로필 이미지 URL',
    example: 'https://k.kakaocdn.net/dn/.../img_640x640.jpg',
    required: false,
  })
  profileImage?: string;
}
