import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { Message } from './message.entity';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
import { ChatRoomsController } from './chat.rooms.controller';
import { ChatRoomsService } from './chat.rooms.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message, ChatRoom, ChatRoomParticipant])],
  controllers: [ChatController, ChatRoomsController],
  providers: [ChatGateway, ChatRoomsService],
})
export class ChatModule {}
