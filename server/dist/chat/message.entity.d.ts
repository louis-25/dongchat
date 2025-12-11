import { ChatRoom } from './chat-room.entity';
export declare class Message {
    id: number;
    sender: string;
    content: string;
    room: ChatRoom | null;
    createdAt: Date;
}
