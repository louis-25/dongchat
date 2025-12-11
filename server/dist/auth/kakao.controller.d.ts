import { AuthService } from './auth.service';
import { KakaoLoginDto } from './dto/kakao-login.dto';
export declare class KakaoController {
    private authService;
    constructor(authService: AuthService);
    kakaoLogin(body: KakaoLoginDto): Promise<{
        access_token: string;
        refresh_token: string;
        user: {
            id: any;
            username: any;
            role: any;
        };
    }>;
}
