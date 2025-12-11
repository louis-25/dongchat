import { FriendsService } from './friends.service';
export declare class FriendsController {
    private friendsService;
    constructor(friendsService: FriendsService);
    request(req: any, username: string): Promise<import("./friend.entity").Friend[]>;
    accept(req: any, id: string): Promise<import("./friend.entity").Friend>;
    block(req: any, id: string): Promise<import("./friend.entity").Friend>;
    list(req: any): Promise<{
        id: number;
        friend: import("../users/user.entity").User;
    }[]>;
    pending(req: any): Promise<import("./friend.entity").Friend[]>;
}
