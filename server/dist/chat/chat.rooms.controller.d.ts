import { ChatRoomsService } from './chat.rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
export declare class ChatRoomsController {
    private chatRoomsService;
    constructor(chatRoomsService: ChatRoomsService);
    create(req: {
        user: {
            userId: number;
        };
    }, dto: CreateRoomDto): Promise<import("./chat-room.entity").ChatRoom>;
    list(req: {
        user: {
            userId: number;
        };
    }): Promise<import("./chat-room.entity").ChatRoom[]>;
}
