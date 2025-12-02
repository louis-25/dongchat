import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';

@WebSocketGateway({
    cors: {
        origin: 'http://localhost:3000',
        credentials: true,
    },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(
        @InjectRepository(Message)
        private messageRepository: Repository<Message>,
    ) { }

    async handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
        const messages = await this.messageRepository.find({
            order: { createdAt: 'ASC' },
            take: 50,
        });
        client.emit('initial_messages', messages);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('message')
    async handleMessage(@MessageBody() payload: { sender: string; message: string }): Promise<void> {
        const newMessage = this.messageRepository.create({
            sender: payload.sender,
            content: payload.message,
        });
        await this.messageRepository.save(newMessage);
        this.server.emit('message', {
            sender: newMessage.sender,
            message: newMessage.content,
        });
    }
}
