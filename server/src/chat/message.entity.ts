import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Message {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    sender: string;

    @Column()
    content: string;

    @CreateDateColumn()
    createdAt: Date;
}
