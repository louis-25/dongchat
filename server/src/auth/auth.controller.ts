import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { User } from '../users/user.entity';

/**
 * 인증 관련 API 요청을 처리하는 컨트롤러입니다.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * 회원가입 API
   */
  @Post('register')
  @ApiOperation({
    summary: '회원가입',
    description: '새로운 사용자를 등록합니다.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: '회원가입 성공', type: Object })
  @ApiErrorResponse(409, '이미 존재하는 사용자입니다.', 'AUTH_DUPLICATE_USER')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(
      registerDto.username,
      registerDto.password,
    );
  }

  /**
   * 로그인 API
   */
  @Post('login')
  @ApiOperation({
    summary: '로그인',
    description: '사용자 인증 후 JWT 토큰을 발급합니다.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: '로그인 성공',
    type: AuthResponseDto,
  })
  @ApiErrorResponse(
    401,
    '비밀번호가 일치하지 않습니다.',
    'AUTH_INVALID_PASSWORD',
  )
  @ApiErrorResponse(404, '사용자를 찾을 수 없습니다.', 'AUTH_USER_NOT_FOUND')
  async login(@Body() loginDto: LoginDto) {
    const user: User = await this.authService.validateUser(
      loginDto.username,
      loginDto.password,
    );
    return this.authService.login(user);
  }

  /**
   * 토큰 갱신 API
   */
  @Post('refresh')
  @ApiOperation({
    summary: '토큰 갱신',
    description: 'Refresh 토큰으로 새로운 Access 토큰을 발급합니다.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: '토큰 갱신 성공',
    type: AuthResponseDto,
  })
  @ApiErrorResponse(
    401,
    '토큰이 만료되었거나 유효하지 않습니다.',
    'AUTH_UNAUTHORIZED',
  )
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refresh_token);
  }
}
