import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule } from '@nestjs/config';

@Module({
    imports: [ConfigModule, PassportModule],
    providers: [JwtStrategy],
})
export class AuthModule { }
