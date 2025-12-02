import { ApiProperty } from '@nestjs/swagger';

/**
 * 회원가입 요청 DTO
 */
export class RegisterDto {
    @ApiProperty({
        description: '사용자 아이디',
        example: 'testuser',
    })
    username: string;

    @ApiProperty({
        description: '비밀번호',
        example: 'password123',
    })
    password: string;
}
