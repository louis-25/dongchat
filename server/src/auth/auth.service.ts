import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

/**
 * 인증 관련 로직을 처리하는 서비스입니다.
 */
@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    /**
     * 사용자 자격 증명을 검증합니다.
     */
    async validateUser(username: string, pass: string): Promise<any> {
        const user = await this.usersService.findOne(username);
        if (user && (await bcrypt.compare(pass, user.password))) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    /**
     * 로그인을 처리하고 JWT 토큰을 발급합니다.
     */
    async login(user: any) {
        const payload = { username: user.username, sub: user.id };
        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                username: user.username,
            }
        };
    }

    /**
     * 회원가입을 처리합니다.
     */
    async register(username: string, pass: string) {
        // 이미 존재하는 사용자인지 확인
        const existingUser = await this.usersService.findOne(username);
        if (existingUser) {
            throw new UnauthorizedException('이미 존재하는 사용자입니다.');
        }
        return this.usersService.create(username, pass);
    }
}
