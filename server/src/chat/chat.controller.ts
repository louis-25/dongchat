import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';

/**
 * 채팅 관련 API 요청을 처리하는 컨트롤러입니다.
 */
@Controller('api/messages')
export class ChatController {
    constructor(
        @InjectRepository(Message)
        private messageRepository: Repository<Message>,
    ) { }

    /**
     * 메시지 목록을 조회합니다.
     * @param page 페이지 번호 (기본값: 1)
     * @param limit 페이지당 항목 수 (기본값: 50)
     * @returns 메시지 목록
     */
    @Get()
    async getMessages(
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 50,
    ): Promise<Message[]> {
        const skip = (page - 1) * limit;
        return this.messageRepository.find({
            order: { createdAt: 'DESC' }, // 최신 메시지부터 조회
            skip,
            take: limit,
        });
    }
}
