import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { KakaoLoginDto } from './dto/kakao-login.dto';

@ApiTags('Auth')
@Controller('auth')
export class KakaoController {
  constructor(private authService: AuthService) {}

  @Post('kakao')
  @ApiOperation({ summary: '카카오 OAuth 로그인/회원가입' })
  async kakaoLogin(@Body() body: KakaoLoginDto) {
    return this.authService.loginWithKakao(
      body.providerId,
      body.nickname,
      body.username,
    );
  }
}
