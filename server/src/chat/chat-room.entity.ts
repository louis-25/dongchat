import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Message } from './message.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';

@Entity()
export class ChatRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'boolean', default: false })
  isGroup: boolean;

  @OneToMany(() => Message, (message) => message.room)
  messages: Message[];

  @OneToMany(() => ChatRoomParticipant, (participant) => participant.room)
  participants: ChatRoomParticipant[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
