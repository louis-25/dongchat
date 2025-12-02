import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';

/**
 * 인증 관련 API 요청을 처리하는 컨트롤러입니다.
 */
@ApiTags('인증')
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    /**
     * 회원가입 API
     */
    @Post('register')
    @ApiOperation({ summary: '회원가입', description: '새로운 사용자를 등록합니다.' })
    @ApiBody({ type: RegisterDto })
    @ApiResponse({ status: 201, description: '회원가입 성공', type: Object })
    @ApiResponse({ status: 401, description: '이미 존재하는 사용자' })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto.username, registerDto.password);
    }

    /**
     * 로그인 API
     */
    @Post('login')
    @ApiOperation({ summary: '로그인', description: '사용자 인증 후 JWT 토큰을 발급합니다.' })
    @ApiBody({ type: LoginDto })
    @ApiResponse({ status: 200, description: '로그인 성공', type: AuthResponseDto })
    @ApiResponse({ status: 401, description: '아이디 또는 비밀번호 오류' })
    async login(@Body() loginDto: LoginDto) {
        const user = await this.authService.validateUser(loginDto.username, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
        }
        return this.authService.login(user);
    }
}
