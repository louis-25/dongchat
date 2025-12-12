export declare class AuthResponseDto {
    access_token: string;
    refresh_token: string;
    user: {
        id: number;
        username: string;
        role: string;
        profileImage: string | null;
    };
}
