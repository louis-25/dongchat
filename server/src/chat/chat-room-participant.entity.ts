import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
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

  @CreateDateColumn()
  createdAt: Date;
}
