import { Message } from './message.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
export declare class ChatRoom {
    id: number;
    name: string | null;
    isGroup: boolean;
    messages: Message[];
    participants: ChatRoomParticipant[];
    createdAt: Date;
    updatedAt: Date;
}
