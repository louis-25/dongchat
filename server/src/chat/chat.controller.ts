import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';
import { MessageQueryDto } from './dto/message-query.dto';

/**
 * 채팅 메시지 관련 API를 처리하는 컨트롤러입니다.
 */
@ApiTags('채팅')
@Controller('api/messages')
export class ChatController {
    constructor(
        @InjectRepository(Message)
        private messageRepository: Repository<Message>,
    ) { }

    /**
     * 메시지 목록 조회 API
     * 페이지네이션을 지원합니다.
     */
    @Get()
    @ApiOperation({ summary: '메시지 조회', description: '저장된 채팅 메시지를 페이지네이션하여 조회합니다.' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: '페이지 번호', example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: '페이지당 항목 수', example: 50 })
    @ApiResponse({ status: 200, description: '메시지 목록', type: [Message] })
    async getMessages(@Query() query: MessageQueryDto) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 50;
        const skip = (page - 1) * limit;

        return this.messageRepository.find({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });
    }
}
