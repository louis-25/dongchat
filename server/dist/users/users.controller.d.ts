import { Repository } from 'typeorm';
import { User } from './user.entity';
export declare class UsersController {
    private usersRepository;
    constructor(usersRepository: Repository<User>);
    findAll(page?: number, limit?: number, sort?: string, order?: 'ASC' | 'DESC'): Promise<{
        total: number;
        page: number;
        limit: number;
        items: User[];
    }>;
}
