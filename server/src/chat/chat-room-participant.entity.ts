import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
  Column,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { User } from '../users/user.entity';

@Entity()
@Unique(['room', 'user'])
export class ChatRoomParticipant {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ChatRoom, (room) => room.participants, { eager: true })
  room: ChatRoom;

  @ManyToOne(() => User, { eager: true })
  user: User;

  // Design Ref: §3.1 — 참여자가 마지막으로 읽은 메시지 id(FR-02). 단조 증가로만 갱신.
  @Column({ type: 'int', nullable: true })
  lastReadMessageId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
