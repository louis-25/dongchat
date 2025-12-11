import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';
export declare class UsersService {
    private usersRepository;
    constructor(usersRepository: Repository<User>);
    findOne(username: string): Promise<User | null>;
    findById(id: number): Promise<User | null>;
    findByProvider(provider: string, providerId: string): Promise<User | null>;
    create(username: string, pass: string, role?: UserRole): Promise<User>;
    createOAuthUser(payload: {
        username: string;
        password: string;
        provider: string;
        providerId: string;
        nickname?: string | null;
        role?: UserRole;
    }): Promise<User>;
}
