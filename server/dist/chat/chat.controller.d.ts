import { Repository } from 'typeorm';
import { Message } from './message.entity';
import { MessageQueryDto } from './dto/message-query.dto';
export declare class ChatController {
    private messageRepository;
    constructor(messageRepository: Repository<Message>);
    getMessages(query: MessageQueryDto): Promise<Message[]>;
}
