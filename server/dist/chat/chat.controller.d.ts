import { Repository } from 'typeorm';
import { Message } from './message.entity';
import { ChatQueryDto } from './dto/chat-query.dto';
export declare class ChatController {
    private messageRepository;
    constructor(messageRepository: Repository<Message>);
    getMessages(query: ChatQueryDto): Promise<Message[]>;
}
