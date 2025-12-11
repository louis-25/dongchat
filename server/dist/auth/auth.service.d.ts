import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '../users/user.entity';
export declare class AuthService {
    private usersService;
    private jwtService;
    constructor(usersService: UsersService, jwtService: JwtService);
    validateUser(username: string, pass: string): Promise<any>;
    login(user: any): Promise<{
        access_token: string;
        refresh_token: string;
        user: {
            id: any;
            username: any;
            role: any;
        };
    }>;
    refreshTokens(refreshToken: string): Promise<{
        access_token: string;
        refresh_token: string;
        user: {
            id: number;
            username: string;
            role: UserRole;
        };
    }>;
    register(username: string, pass: string): Promise<User>;
    loginWithKakao(providerId: string, nickname?: string, usernameHint?: string): Promise<{
        access_token: string;
        refresh_token: string;
        user: {
            id: any;
            username: any;
            role: any;
        };
    }>;
}
