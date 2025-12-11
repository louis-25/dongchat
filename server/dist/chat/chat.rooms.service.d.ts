import { Repository } from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
import { UsersService } from '../users/users.service';
import { CreateRoomDto } from './dto/create-room.dto';
export declare class ChatRoomsService {
    private roomRepository;
    private participantRepository;
    private usersService;
    constructor(roomRepository: Repository<ChatRoom>, participantRepository: Repository<ChatRoomParticipant>, usersService: UsersService);
    createRoom(currentUserId: number, dto: CreateRoomDto): Promise<ChatRoom>;
    getRoomWithParticipants(roomId: number): Promise<ChatRoom>;
    listRoomsByUser(userId: number): Promise<ChatRoom[]>;
}
