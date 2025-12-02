import { Repository } from 'typeorm';
import { Message } from './message.entity';
export declare class ChatController {
    private messageRepository;
    constructor(messageRepository: Repository<Message>);
    getMessages(page?: number, limit?: number): Promise<Message[]>;
}
