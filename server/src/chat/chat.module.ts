import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { Message } from './message.entity';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
import { ChatRoomsController } from './chat.rooms.controller';
import { ChatRoomsService } from './chat.rooms.service';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, ChatRoom, ChatRoomParticipant]),
    UsersModule,
    PushModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('NEXTAUTH_SECRET'),
      }),
    }),
  ],
  controllers: [ChatController, ChatRoomsController],
  providers: [ChatGateway, ChatRoomsService],
})
export class ChatModule {}
