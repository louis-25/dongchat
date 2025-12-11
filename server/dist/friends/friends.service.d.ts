import { Repository } from 'typeorm';
import { Friend } from './friend.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
export declare class FriendsService {
    private friendRepository;
    private usersService;
    constructor(friendRepository: Repository<Friend>, usersService: UsersService);
    sendRequest(requesterId: number, receiverUsername: string): Promise<Friend>;
    respondRequest(requestId: number, userId: number, action: 'accept' | 'block'): Promise<Friend>;
    listFriends(userId: number): Promise<{
        id: number;
        friend: User;
    }[]>;
    listPending(userId: number): Promise<Friend[]>;
}
