import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { ChatRoomParticipant } from './chat-room-participant.entity';
import { UsersService } from '../users/users.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class ChatRoomsService {
    constructor(
        @InjectRepository(ChatRoom)
        private roomRepository: Repository<ChatRoom>,
        @InjectRepository(ChatRoomParticipant)
        private participantRepository: Repository<ChatRoomParticipant>,
        private usersService: UsersService,
    ) { }

    async createRoom(currentUserId: number, dto: CreateRoomDto) {
        const usernames = dto.participantUsernames || [];
        const uniqueUsernames = Array.from(new Set([...usernames]));

        const users = await Promise.all(uniqueUsernames.map((u) => this.usersService.findOne(u)));
        const missing = users.filter((u) => !u);
        if (missing.length > 0) {
            throw new NotFoundException('참여자 중 존재하지 않는 사용자가 있습니다.');
        }

        const currentUser = await this.usersService.findById(currentUserId);
        if (!currentUser) throw new NotFoundException('사용자를 찾을 수 없습니다.');

        const participants = [currentUser, ...(users as any)].filter((u, idx, arr) => arr.findIndex((x) => x.id === u.id) === idx);

        if (!dto.isGroup && participants.length !== 2) {
            throw new BadRequestException('1:1 채팅은 정확히 2명이어야 합니다.');
        }

        const room = this.roomRepository.create({
            name: dto.name || null,
            isGroup: dto.isGroup ?? false,
        });
        const savedRoom = await this.roomRepository.save(room);

        const participantEntities = participants.map((user) =>
            this.participantRepository.create({ room: savedRoom, user }),
        );
        await this.participantRepository.save(participantEntities);

        return this.getRoomWithParticipants(savedRoom.id);
    }

    async getRoomWithParticipants(roomId: number) {
        const room = await this.roomRepository.findOne({
            where: { id: roomId },
            relations: ['participants', 'participants.user'],
        });
        if (!room) throw new NotFoundException('방을 찾을 수 없습니다.');
        return room;
    }

    async listRoomsByUser(userId: number) {
        const memberships = await this.participantRepository.find({
            where: { user: { id: userId } },
            relations: ['room', 'room.participants', 'room.participants.user'],
        });
        return memberships.map((m) => m.room);
    }
}

