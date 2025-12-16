import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PushSubscribeDto {
  @ApiProperty({
    description: '푸시 서비스 엔드포인트 URL',
    example: 'https://fcm.googleapis.com/fcm/send/...',
  })
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({
    description: 'P256DH 공개 키',
    example: 'BL7ELU24fJTAlH5Kyl8N6BDCac8u8li_U5PIwG963MOvdYs9s7LSzj8x...',
  })
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty({
    description: '인증 비밀키',
    example: 'juarI8x__VnHvsOgfeAPHg',
  })
  @IsString()
  @IsNotEmpty()
  auth: string;
}

