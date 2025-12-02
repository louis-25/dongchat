import { Repository } from 'typeorm';
import { User } from './user.entity';
export declare class UsersService {
    private usersRepository;
    constructor(usersRepository: Repository<User>);
    findOne(username: string): Promise<User | null>;
    create(username: string, pass: string): Promise<User>;
}
