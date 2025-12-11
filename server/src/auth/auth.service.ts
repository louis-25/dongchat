import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  DuplicateUserException,
  InvalidPasswordException,
  UserNotFoundException,
} from './exceptions/auth.exception';
import { User, UserRole } from '../users/user.entity';
import { randomBytes } from 'crypto';

/**
 * 인증 관련 로직을 처리하는 서비스입니다.
 */
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  /**
   * 사용자 자격 증명을 검증합니다.
   */
  async validateUser(username: string, pass: string): Promise<User> {
    const user = await this.usersService.findOne(username);
    if (!user) {
      throw new UserNotFoundException();
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new InvalidPasswordException();
    }

    return user;
  }

  /**
   * 로그인을 처리하고 JWT 토큰을 발급합니다.
   */
  login(user: User) {
    const payload = {
      username: user.username,
      sub: user.id,
      role: user.role ?? UserRole.USER,
    };
    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refresh_token: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        username: user.username,
        role: user.role ?? UserRole.USER,
      },
    };
  }

  /**
   * Refresh 토큰으로 새로운 Access 토큰을 발급합니다.
   */
  async refreshTokens(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{ username: string }>(
        refreshToken,
      );
      const user = await this.usersService.findOne(payload.username);

      if (!user) {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }

      const newPayload = {
        username: user.username,
        sub: user.id,
        role: user.role ?? UserRole.USER,
      };
      return {
        access_token: this.jwtService.sign(newPayload, { expiresIn: '15m' }),
        refresh_token: this.jwtService.sign(newPayload, { expiresIn: '7d' }),
        user: {
          id: user.id,
          username: user.username,
          role: user.role ?? UserRole.USER,
        },
      };
    } catch {
      throw new UnauthorizedException('토큰이 만료되었거나 유효하지 않습니다.');
    }
  }

  /**
   * 회원가입을 처리합니다.
   */
  async register(username: string, pass: string) {
    // 이미 존재하는 사용자인지 확인
    const existingUser = await this.usersService.findOne(username);
    if (existingUser) {
      throw new DuplicateUserException();
    }
    return this.usersService.create(username, pass, UserRole.USER);
  }

  /**
   * 카카오 OAuth 사용자 upsert 후 JWT 발급
   */
  async loginWithKakao(
    providerId: string,
    nickname?: string,
    usernameHint?: string,
  ) {
    const kakaoUsername = usernameHint || `kakao_${providerId}`;
    let user = await this.usersService.findByProvider('KAKAO', providerId);

    if (!user) {
      const fallbackPassword = randomBytes(16).toString('hex');
      user = await this.usersService.createOAuthUser({
        username: kakaoUsername,
        password: fallbackPassword,
        provider: 'KAKAO',
        providerId,
        nickname: nickname || null,
        role: UserRole.USER,
      });
    }

    return this.login(user);
  }
}
