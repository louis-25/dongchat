import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 메시지 조회 쿼리 DTO
 */
export class ChatQueryDto {
  @ApiPropertyOptional({
    description: '조회할 채팅방 ID (지정 시 해당 방의 멤버여야 함)',
    example: 1,
  })
  roomId?: number;

  @ApiPropertyOptional({
    description: '이 메시지 ID 미만의 과거 메시지를 조회 (cursor, FR-08)',
    example: 120,
  })
  before?: number;

  @ApiPropertyOptional({
    description: '페이지당 항목 수',
    example: 30,
    default: 30,
  })
  limit?: number = 30;

  /**
   * @deprecated cursor(before) 방식으로 대체됨. 하위 호환용으로만 유지.
   */
  @ApiPropertyOptional({
    description: '[deprecated] 페이지 번호 (before cursor 사용 권장)',
    example: 1,
  })
  page?: number;
}
