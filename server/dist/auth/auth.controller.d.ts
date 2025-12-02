import { AuthService } from './auth.service';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    register(body: {
        username: string;
        password: string;
    }): Promise<import("../users/user.entity").User>;
    login(body: {
        username: string;
        password: string;
    }): Promise<{
        access_token: string;
        user: {
            id: any;
            username: any;
        };
    }>;
}
