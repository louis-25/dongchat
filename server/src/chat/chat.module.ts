import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { Message } from './message.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Message])],
    controllers: [ChatController],
    providers: [ChatGateway],
})
export class ChatModule { }
