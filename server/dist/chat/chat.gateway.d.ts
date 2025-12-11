import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { Message } from './message.entity';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private messageRepository;
    private roomRepository;
    private participantRepository;
    server: Server;
    constructor(messageRepository: Repository<Message>, roomRepository: Repository<ChatRoom>, participantRepository: Repository<ChatRoomParticipant>);
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinRoom(client: Socket, payload: {
        roomId: number;
        userId: number;
    }): Promise<void>;
    handleMessage(payload: {
        sender: string;
        message: string;
        roomId: number;
    }): Promise<void>;
}
