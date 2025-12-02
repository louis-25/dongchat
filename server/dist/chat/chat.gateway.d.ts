import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { Message } from './message.entity';
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private messageRepository;
    server: Server;
    constructor(messageRepository: Repository<Message>);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    handleMessage(payload: {
        sender: string;
        message: string;
    }): Promise<void>;
}
