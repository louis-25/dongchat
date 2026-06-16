import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ChatRoom } from './chat-room.entity';

/**
 * 채팅 메시지를 저장하는 엔티티입니다.
 * Design Ref: §3.1 — 읽음/수정/삭제/답장을 위한 컬럼 확장 (Option C)
 */
@Entity()
export class Message {
  @ApiProperty({ description: '메시지 ID' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: '발신자 표시 이름', example: 'testuser' })
  @Column()
  sender: string;

  // Design Ref: §3.1 — 소유권 검증 기준(FR-06). 구버전 메시지는 NULL이라 수정/삭제 대상에서 제외된다.
  @ApiProperty({ description: '발신자 ID', nullable: true })
  @Column({ type: 'int', nullable: true })
  senderId: number | null;

  @ApiProperty({ description: '메시지 내용', example: '안녕하세요!' })
  @Column('text')
  content: string;

  @ManyToOne(() => ChatRoom, (room) => room.messages, { nullable: true })
  room: ChatRoom | null;

  // Design Ref: §3.1 — 답장 자기참조 (FR-07)
  @ManyToOne(() => Message, { nullable: true })
  @JoinColumn({ name: 'replyToId' })
  replyTo: Message | null;

  @ApiProperty({ description: '답장 대상 메시지 ID', nullable: true })
  @Column({ type: 'int', nullable: true })
  replyToId: number | null;

  // Design Ref: §3.1 — 수정 시각(FR-04). null이면 미수정.
  @ApiProperty({ description: '수정 시각', nullable: true })
  @Column({ type: 'datetime', nullable: true })
  editedAt: Date | null;

  // Design Ref: §3.1 — soft delete(FR-05). null이면 미삭제.
  @ApiProperty({ description: '삭제 시각(soft delete)', nullable: true })
  @Column({ type: 'datetime', nullable: true })
  deletedAt: Date | null;

  @ApiProperty({ description: '생성 시간' })
  @CreateDateColumn()
  createdAt: Date;
}
