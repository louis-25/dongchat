import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Message } from './message.entity';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
import { PushService } from '../push/push.service';

/**
 * 클라이언트로 전달되는 메시지 표현(View).
 * Design Ref: §4.1 — id/flags/unreadCount 포함. content/message를 함께 담아 하위 호환.
 */
export interface MessageView {
  id: number;
  roomId: number;
  sender: string;
  senderId: number | null;
  // 삭제된 메시지는 빈 문자열로 마스킹되고 deletedAt로 식별한다.
  message: string;
  content: string;
  replyTo: { id: number; sender: string; message: string } | null;
  editedAt: string | null;
  deletedAt: string | null;
  unreadCount: number;
  createdAt: Date;
}

/**
 * 메시지 영속/읽음/수정/삭제 로직을 담당하는 서비스.
 * Design Ref: §2 — ChatGateway를 얇게 유지하기 위해 비즈니스 로직을 추출(Option C).
 */
@Injectable()
export class ChatMessageService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(ChatRoom)
    private readonly roomRepository: Repository<ChatRoom>,
    @InjectRepository(ChatRoomParticipant)
    private readonly participantRepository: Repository<ChatRoomParticipant>,
    private readonly pushService: PushService,
  ) {}

  /** 방 참여자 목록(읽음 계산/푸시 대상용) */
  private async getParticipants(
    roomId: number,
  ): Promise<ChatRoomParticipant[]> {
    return this.participantRepository.find({
      where: { room: { id: roomId } },
    });
  }

  /** 해당 유저가 방의 참여자인지 검증 */
  async assertMembership(roomId: number, userId: number): Promise<void> {
    const membership = await this.participantRepository.findOne({
      where: { room: { id: roomId }, user: { id: userId } },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: '해당 방에 접근할 권한이 없습니다.',
        code: 'CHAT_FORBIDDEN',
      });
    }
  }

  /**
   * 안 읽은 인원 수 계산 (Design Ref: §3.3)
   * 발신자 제외 참여자 중 lastReadMessageId < message.id 인 인원 수.
   */
  private computeUnread(
    message: Pick<Message, 'id' | 'senderId'>,
    participants: ChatRoomParticipant[],
  ): number {
    return participants.filter(
      (p) =>
        p.user.id !== message.senderId &&
        (p.lastReadMessageId === null || p.lastReadMessageId < message.id),
    ).length;
  }

  /** Message → MessageView 변환 */
  private toView(
    message: Message,
    roomId: number,
    participants: ChatRoomParticipant[],
  ): MessageView {
    const isDeleted = message.deletedAt !== null;
    return {
      id: message.id,
      roomId,
      sender: message.sender,
      senderId: message.senderId,
      message: isDeleted ? '' : message.content,
      content: isDeleted ? '' : message.content,
      replyTo:
        message.replyTo && message.replyTo.deletedAt === null
          ? {
              id: message.replyTo.id,
              sender: message.replyTo.sender,
              message: message.replyTo.content,
            }
          : message.replyTo
            ? {
                id: message.replyTo.id,
                sender: message.replyTo.sender,
                message: '',
              }
            : null,
      editedAt: message.editedAt ? message.editedAt.toISOString() : null,
      deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
      unreadCount: this.computeUnread(message, participants),
      createdAt: message.createdAt,
    };
  }

  /**
   * 방 메시지 페이지 조회 (Design Ref: §4.2, FR-08)
   * before 지정 시 그보다 과거(id < before)를 limit개. 결과는 시간순(ASC).
   */
  async getRoomMessages(
    roomId: number,
    before?: number,
    limit = 30,
  ): Promise<MessageView[]> {
    const participants = await this.getParticipants(roomId);
    const messages = await this.messageRepository.find({
      where: {
        room: { id: roomId },
        ...(before ? { id: LessThan(before) } : {}),
      },
      relations: ['replyTo'],
      order: { id: 'DESC' },
      take: limit,
    });
    // DESC로 가져온 페이지를 시간순으로 뒤집어 반환(클라이언트는 prepend).
    return messages.reverse().map((m) => this.toView(m, roomId, participants));
  }

  /**
   * 메시지 생성 + 푸시 발송 (Design Ref: §4.1)
   * 발신자 신원은 호출자(gateway)가 검증한 socket.data 값.
   */
  async createMessage(
    roomId: number,
    senderId: number,
    sender: string,
    content: string,
    replyToId?: number,
  ): Promise<MessageView> {
    const room = await this.roomRepository.findOne({
      where: { id: roomId },
      relations: ['participants', 'participants.user'],
    });
    if (!room) {
      throw new NotFoundException({
        message: '방을 찾을 수 없습니다.',
        code: 'CHAT_ROOM_NOT_FOUND',
      });
    }

    const isParticipant = room.participants?.some(
      (p) => p.user.id === senderId,
    );
    if (!isParticipant) {
      throw new ForbiddenException({
        message: '해당 방에 메시지를 보낼 권한이 없습니다.',
        code: 'CHAT_FORBIDDEN',
      });
    }

    // 답장 대상이 같은 방의 메시지인지 검증
    let replyTo: Message | null = null;
    if (replyToId) {
      replyTo = await this.messageRepository.findOne({
        where: { id: replyToId, room: { id: roomId } },
      });
    }

    const saved = await this.messageRepository.save(
      this.messageRepository.create({
        sender,
        senderId,
        content,
        room,
        replyTo,
        replyToId: replyTo ? replyTo.id : null,
      }),
    );
    saved.replyTo = replyTo;

    // 푸시 알림 (발신자 제외)
    const recipientIds = (room.participants ?? [])
      .filter((p) => p.user.id !== senderId)
      .map((p) => p.user.id);
    if (recipientIds.length > 0) {
      await this.pushService.sendNotificationToUsers(recipientIds, {
        title: room.name || sender,
        body: content,
        icon: '/icon.png',
        badge: '/badge.png',
        data: { roomId, sender, url: `/chat/${roomId}` },
      });
    }

    const participants = await this.getParticipants(roomId);
    return this.toView(saved, roomId, participants);
  }

  /**
   * 읽음 처리 (Design Ref: §4.1, FR-02)
   * 방의 최신 메시지 id로 lastReadMessageId를 단조 증가시킨다.
   * @returns 갱신된 lastReadMessageId (변경 없으면 null)
   */
  async markRead(roomId: number, userId: number): Promise<number | null> {
    const membership = await this.participantRepository.findOne({
      where: { room: { id: roomId }, user: { id: userId } },
    });
    if (!membership) {
      throw new ForbiddenException({
        message: '해당 방에 접근할 권한이 없습니다.',
        code: 'CHAT_FORBIDDEN',
      });
    }

    const latest = await this.messageRepository.findOne({
      where: { room: { id: roomId } },
      order: { id: 'DESC' },
    });
    if (!latest) return null;

    if (
      membership.lastReadMessageId === null ||
      membership.lastReadMessageId < latest.id
    ) {
      membership.lastReadMessageId = latest.id;
      await this.participantRepository.save(membership);
      return latest.id;
    }
    return membership.lastReadMessageId;
  }

  /** 본인 메시지 조회 + 소유권 검증 (FR-06) */
  private async findOwnedMessage(
    messageId: number,
    userId: number,
  ): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['room'],
    });
    if (!message || message.deletedAt !== null) {
      throw new NotFoundException({
        message: '메시지를 찾을 수 없습니다.',
        code: 'MESSAGE_NOT_FOUND',
      });
    }
    if (message.senderId === null || message.senderId !== userId) {
      throw new ForbiddenException({
        message: '본인 메시지만 수정/삭제할 수 있습니다.',
        code: 'CHAT_FORBIDDEN',
      });
    }
    return message;
  }

  /** 메시지 수정 (Design Ref: §4.1, FR-04) */
  async editMessage(
    messageId: number,
    userId: number,
    content: string,
  ): Promise<{
    id: number;
    roomId: number;
    content: string;
    editedAt: string;
  }> {
    const message = await this.findOwnedMessage(messageId, userId);
    message.content = content;
    message.editedAt = new Date();
    await this.messageRepository.save(message);
    return {
      id: message.id,
      roomId: message.room ? message.room.id : 0,
      content,
      editedAt: message.editedAt.toISOString(),
    };
  }

  /** 메시지 soft delete (Design Ref: §4.1, FR-05) */
  async deleteMessage(
    messageId: number,
    userId: number,
  ): Promise<{ id: number; roomId: number }> {
    const message = await this.findOwnedMessage(messageId, userId);
    message.deletedAt = new Date();
    await this.messageRepository.save(message);
    return { id: message.id, roomId: message.room ? message.room.id : 0 };
  }
}
