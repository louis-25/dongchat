import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Message } from './message.entity';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
import { PushService } from '../push/push.service';

// 소켓 핸드셰이크에서 JWT를 추출한다. (auth.token 우선, 없으면 Authorization 헤더)
const extractToken = (socket: Socket): string | null => {
  const authToken = (socket.handshake.auth as { token?: string } | undefined)
    ?.token;
  if (authToken) return authToken;
  const header = socket.handshake.headers?.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
};

interface JwtPayload {
  sub: number;
  username: string;
  role?: string;
}

// URL 정규화 함수: 끝의 슬래시 제거
const normalizeUrl = (url: string): string => {
  return url.trim().replace(/\/+$/, '');
};

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(normalizeUrl)
      : ['http://localhost:3000'],
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(ChatRoom)
    private roomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatRoomParticipant)
    private participantRepository: Repository<ChatRoomParticipant>,
    private pushService: PushService,
    private jwtService: JwtService,
  ) {}

  // 모든 소켓 연결에 대해 JWT를 검증하는 미들웨어를 등록한다.
  // 실패 시 next(Error)로 connect_error를 보내 클라이언트가 재연결(토큰 준비 후)을 시도할 수 있게 한다.
  afterInit(server: Server) {
    server.use((socket, next) => {
      try {
        const token = extractToken(socket);
        if (!token) {
          next(new Error('Unauthorized'));
          return;
        }
        const payload = this.jwtService.verify<JwtPayload>(token);
        socket.data.userId = payload.sub;
        socket.data.username = payload.username;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    console.log(
      `Client connected: ${client.id} (userId=${client.data.userId})`,
    );
  }
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: number },
  ) {
    // userId는 클라이언트 입력이 아닌 검증된 소켓 신원을 사용한다.
    const userId = client.data.userId as number;
    const membership = await this.participantRepository.findOne({
      where: {
        room: { id: payload.roomId },
        user: { id: userId },
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
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { message: string; roomId: number },
  ): Promise<void> {
    if (!payload.roomId) return;

    // 발신자 신원은 클라이언트 입력이 아닌 검증된 소켓에서 가져온다(스푸핑 방지).
    const senderId = client.data.userId as number;
    const sender = client.data.username as string;

    const room = await this.roomRepository.findOne({
      where: { id: payload.roomId },
      relations: ['participants', 'participants.user'],
    });
    if (!room) return;

    // 발신자가 실제 방 참여자인지 확인한다.
    const isParticipant = room.participants?.some(
      (p) => p.user.id === senderId,
    );
    if (!isParticipant) return;

    const newMessage = this.messageRepository.create({
      sender,
      content: payload.message,
      room,
    });
    await this.messageRepository.save(newMessage);
    
    // Socket.io로 메시지 전송
    this.server.to(String(payload.roomId)).emit('message', {
      roomId: payload.roomId,
      sender: newMessage.sender,
      message: newMessage.content,
      createdAt: newMessage.createdAt,
    });

    // 푸시 알림 전송 (메시지를 보낸 사람 제외)
    if (room.participants && room.participants.length > 0) {
      const recipientIds = room.participants
        .filter((p) => p.user.id !== senderId)
        .map((p) => p.user.id);

      if (recipientIds.length > 0) {
        await this.pushService.sendNotificationToUsers(recipientIds, {
          title: room.name || sender,
          body: payload.message,
          icon: '/icon.png',
          badge: '/badge.png',
          data: {
            roomId: payload.roomId,
            sender: sender,
            url: `/chat/${payload.roomId}`,
          },
        });
      }
    }
  }
}
