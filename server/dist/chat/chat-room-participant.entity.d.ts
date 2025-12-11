import { ChatRoom } from './chat-room.entity';
import { User } from '../users/user.entity';
export declare class ChatRoomParticipant {
    id: number;
    room: ChatRoom;
    user: User;
    createdAt: Date;
}
