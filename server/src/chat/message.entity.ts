import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 채팅 메시지를 저장하는 엔티티입니다.
 */
@Entity()
export class Message {
    @ApiProperty({ description: '메시지 ID' })
    @PrimaryGeneratedColumn()
    id: number;

    @ApiProperty({ description: '발신자 이름', example: 'testuser' })
    @Column()
    sender: string;

    @ApiProperty({ description: '메시지 내용', example: '안녕하세요!' })
    @Column('text')
    content: string;

    @ApiProperty({ description: '생성 시간' })
    @CreateDateColumn()
    createdAt: Date;
}
