import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';

/**
 * 사용자 관련 기능을 관리하는 모듈입니다.
 */
@Module({
    imports: [TypeOrmModule.forFeature([User])],
    providers: [UsersService],
    exports: [UsersService],
})
export class UsersModule { }
