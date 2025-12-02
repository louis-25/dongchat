import { Controller, Post, Body, UnauthorizedException, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * 인증 관련 API 요청을 처리하는 컨트롤러입니다.
 */
@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    /**
     * 회원가입 API
     */
    @Post('register')
    async register(@Body() body: { username: string; password: string }) {
        return this.authService.register(body.username, body.password);
    }

    /**
     * 로그인 API
     */
    @Post('login')
    async login(@Body() body: { username: string; password: string }) {
        const user = await this.authService.validateUser(body.username, body.password);
        if (!user) {
            throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
        }
        return this.authService.login(user);
    }
}
