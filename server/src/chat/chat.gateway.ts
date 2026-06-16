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
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatMessageService } from './chat-message.service';

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

// 검증된 소켓 신원. socket.data(any)를 타입 안전하게 다루기 위한 형태.
interface AuthedSocketData {
  userId: number;
  username: string;
}

const sdata = (socket: Socket): AuthedSocketData =>
  socket.data as AuthedSocketData;

// URL 정규화 함수: 끝의 슬래시 제거
const normalizeUrl = (url: string): string => {
  return url.trim().replace(/\/+$/, '');
};

// 도메인 예외 → 소켓 에러 코드 매핑 (Design Ref: §6.1)
const toErrorCode = (e: unknown): { code: string; message: string } => {
  if (e instanceof ForbiddenException || e instanceof NotFoundException) {
    const res = e.getResponse() as { code?: string; message?: string };
    return {
      code: res.code ?? 'CHAT_ERROR',
      message: res.message ?? '요청을 처리할 수 없습니다.',
    };
  }
  return { code: 'CHAT_ERROR', message: '요청을 처리할 수 없습니다.' };
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
    // Design Ref: §2 — 영속/읽음/수정/삭제 로직은 서비스에 위임하고 게이트웨이는 얇게 유지.
    private readonly messageService: ChatMessageService,
    private readonly jwtService: JwtService,
  ) {}

  // 모든 소켓 연결에 대해 JWT를 검증하는 미들웨어를 등록한다.
  afterInit(server: Server) {
    server.use((socket, next) => {
      try {
        const token = extractToken(socket);
        if (!token) {
          next(new Error('Unauthorized'));
          return;
        }
        const payload = this.jwtService.verify<JwtPayload>(token);
        const data = sdata(socket);
        data.userId = payload.sub;
        data.username = payload.username;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    console.log(
      `Client connected: ${client.id} (userId=${sdata(client).userId})`,
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
    const userId = sdata(client).userId;
    try {
      await this.messageService.assertMembership(payload.roomId, userId);
    } catch {
      client.emit('join_error', { message: '권한이 없습니다.' });
      return;
    }

    await client.join(String(payload.roomId));

    // Design Ref: §4.2 — 입장 시 최신 메시지 페이지(기본 30개)를 View로 전달.
    const messages = await this.messageService.getRoomMessages(payload.roomId);
    client.emit('initial_messages', { roomId: payload.roomId, messages });

    // 입장과 동시에 읽음 처리하고 방에 브로드캐스트 (FR-02)
    const lastReadMessageId = await this.messageService.markRead(
      payload.roomId,
      userId,
    );
    if (lastReadMessageId !== null) {
      this.server.to(String(payload.roomId)).emit('read_update', {
        roomId: payload.roomId,
        userId,
        lastReadMessageId,
      });
    }
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      roomId: number;
      content?: string;
      message?: string;
      replyToId?: number;
    },
  ): Promise<void> {
    if (!payload.roomId) return;
    // 발신자 신원은 클라이언트 입력이 아닌 검증된 소켓에서 가져온다(스푸핑 방지).
    const { userId: senderId, username: sender } = sdata(client);
    const content = (payload.content ?? payload.message ?? '').trim();
    if (!content) return;

    try {
      const view = await this.messageService.createMessage(
        payload.roomId,
        senderId,
        sender,
        content,
        payload.replyToId,
      );
      this.server.to(String(payload.roomId)).emit('message', view);
    } catch (e) {
      client.emit('message_error', toErrorCode(e));
    }
  }

  // Design Ref: §4.1 — 읽음 처리 (FR-02)
  @SubscribeMessage('message_read')
  async handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: number },
  ): Promise<void> {
    if (!payload?.roomId) return;
    const userId = sdata(client).userId;
    try {
      const lastReadMessageId = await this.messageService.markRead(
        payload.roomId,
        userId,
      );
      if (lastReadMessageId !== null) {
        this.server.to(String(payload.roomId)).emit('read_update', {
          roomId: payload.roomId,
          userId,
          lastReadMessageId,
        });
      }
    } catch (e) {
      client.emit('message_error', toErrorCode(e));
    }
  }

  // Design Ref: §4.1 — 메시지 수정 (FR-04, 소유권 검증)
  @SubscribeMessage('message_edit')
  async handleEdit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { messageId: number; content: string },
  ): Promise<void> {
    const userId = sdata(client).userId;
    const content = (payload?.content ?? '').trim();
    if (!payload?.messageId || !content) return;
    try {
      const result = await this.messageService.editMessage(
        payload.messageId,
        userId,
        content,
      );
      this.server.to(String(result.roomId)).emit('message_edited', result);
    } catch (e) {
      client.emit('message_error', toErrorCode(e));
    }
  }

  // Design Ref: §4.1 — 메시지 삭제 (FR-05, soft delete, 소유권 검증)
  @SubscribeMessage('message_delete')
  async handleDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { messageId: number },
  ): Promise<void> {
    const userId = sdata(client).userId;
    if (!payload?.messageId) return;
    try {
      const result = await this.messageService.deleteMessage(
        payload.messageId,
        userId,
      );
      this.server.to(String(result.roomId)).emit('message_deleted', result);
    } catch (e) {
      client.emit('message_error', toErrorCode(e));
    }
  }
}
