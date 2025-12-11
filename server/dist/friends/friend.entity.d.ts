import { User } from '../users/user.entity';
export declare enum FriendStatus {
    PENDING = "PENDING",
    ACCEPTED = "ACCEPTED",
    BLOCKED = "BLOCKED"
}
export declare class Friend {
    id: number;
    requester: User;
    receiver: User;
    status: FriendStatus;
    createdAt: Date;
    updatedAt: Date;
}
