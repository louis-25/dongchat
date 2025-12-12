import { FriendsService } from './friends.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
export declare class FriendsController {
    private friendsService;
    constructor(friendsService: FriendsService);
    request(req: {
        user: {
            userId: number;
        };
    }, dto: SendFriendRequestDto): Promise<import("./friend.entity").Friend>;
    accept(req: {
        user: {
            userId: number;
        };
    }, id: string): Promise<import("./friend.entity").Friend>;
    block(req: {
        user: {
            userId: number;
        };
    }, id: string): Promise<import("./friend.entity").Friend>;
    list(req: {
        user: {
            userId: number;
        };
    }): Promise<{
        id: number;
        friend: import("../users/user.entity").User;
    }[]>;
    pending(req: {
        user: {
            userId: number;
        };
    }): Promise<import("./friend.entity").Friend[]>;
}
