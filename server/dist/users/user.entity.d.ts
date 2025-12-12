export declare enum UserRole {
    ADMIN = "ADMIN",
    USER = "USER",
    OBSERVER = "OBSERVER"
}
export declare class User {
    id: number;
    username: string;
    password: string;
    provider: string;
    providerId: string | null;
    nickname: string | null;
    profileImage: string | null;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
}
