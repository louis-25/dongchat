import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';
import * as bcrypt from 'bcrypt';

/**
 * 사용자 데이터 처리를 담당하는 서비스입니다.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  /**
   * 사용자명으로 사용자를 조회합니다.
   * @param username 사용자명
   */
  async findOne(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByProvider(
    provider: string,
    providerId: string,
  ): Promise<User | null> {
    return this.usersRepository.findOne({ where: { provider, providerId } });
  }

  /**
   * 새로운 사용자를 생성합니다.
   * @param username 사용자명
   * @param pass 비밀번호 (평문)
   */
  async create(
    username: string,
    pass: string,
    role: UserRole = UserRole.USER,
  ): Promise<User> {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(pass, salt);

    const user = this.usersRepository.create({
      username,
      password: hashedPassword,
      role,
    });

    return this.usersRepository.save(user);
  }

  async createOAuthUser(payload: {
    username: string;
    password: string;
    provider: string;
    providerId: string;
    nickname?: string | null;
    role?: UserRole;
  }): Promise<User> {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(payload.password, salt);

    const user = this.usersRepository.create({
      username: payload.username,
      password: hashedPassword,
      provider: payload.provider,
      providerId: payload.providerId,
      nickname: payload.nickname ?? null,
      role: payload.role ?? UserRole.USER,
    });

    return this.usersRepository.save(user);
  }
}
