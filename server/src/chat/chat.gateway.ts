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
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
      : ['http://localhost:3000'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(ChatRoom)
    private roomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatRoomParticipant)
    private participantRepository: Repository<ChatRoomParticipant>,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    client: Socket,
    payload: { roomId: number; userId: number },
  ) {
    const membership = await this.participantRepository.findOne({
      where: {
        room: { id: payload.roomId },
        user: { id: payload.userId },
      },
      relations: ['room'],
    });
    if (!membership) {
      client.emit('join_error', { message: '권한이 없습니다.' });
      return;
    }

    client.join(String(payload.roomId));
    const messages = await this.messageRepository.find({
      where: { room: { id: payload.roomId } },
      order: { createdAt: 'ASC' },
      take: 50,
    });
    client.emit('initial_messages', {
      roomId: payload.roomId,
      messages: messages.map((m) => ({
        sender: m.sender,
        message: m.content,
        createdAt: m.createdAt,
      })),
    });
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() payload: { sender: string; message: string; roomId: number },
  ): Promise<void> {
    if (!payload.roomId) return;

    const room = await this.roomRepository.findOne({
      where: { id: payload.roomId },
    });
    if (!room) return;

    const newMessage = this.messageRepository.create({
      sender: payload.sender,
      content: payload.message,
      room,
    });
    await this.messageRepository.save(newMessage);
    this.server.to(String(payload.roomId)).emit('message', {
      roomId: payload.roomId,
      sender: newMessage.sender,
      message: newMessage.content,
      createdAt: newMessage.createdAt,
    });
  }
}
