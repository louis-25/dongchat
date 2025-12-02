import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 메시지 조회 쿼리 DTO
 */
export class MessageQueryDto {
    @ApiPropertyOptional({
        description: '페이지 번호',
        example: 1,
        default: 1,
    })
    page?: number = 1;

    @ApiPropertyOptional({
        description: '페이지당 항목 수',
        example: 50,
        default: 50,
    })
    limit?: number = 50;
}
