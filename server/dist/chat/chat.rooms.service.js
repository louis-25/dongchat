"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRoomsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const chat_room_entity_1 = require("./chat-room.entity");
const chat_room_participant_entity_1 = require("./chat-room-participant.entity");
const users_service_1 = require("../users/users.service");
let ChatRoomsService = class ChatRoomsService {
    roomRepository;
    participantRepository;
    usersService;
    constructor(roomRepository, participantRepository, usersService) {
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
        this.usersService = usersService;
    }
    async createRoom(currentUserId, dto) {
        const usernames = dto.participantUsernames || [];
        const uniqueUsernames = Array.from(new Set([...usernames]));
        const users = await Promise.all(uniqueUsernames.map((u) => this.usersService.findOne(u)));
        const missing = users.filter((u) => !u);
        if (missing.length > 0) {
            throw new common_1.NotFoundException('참여자 중 존재하지 않는 사용자가 있습니다.');
        }
        const currentUser = await this.usersService.findById(currentUserId);
        if (!currentUser)
            throw new common_1.NotFoundException('사용자를 찾을 수 없습니다.');
        const participants = [currentUser, ...users].filter((u, idx, arr) => arr.findIndex((x) => x.id === u.id) === idx);
        if (!dto.isGroup && participants.length !== 2) {
            throw new common_1.BadRequestException('1:1 채팅은 정확히 2명이어야 합니다.');
        }
        const room = this.roomRepository.create({
            name: dto.name || null,
            isGroup: dto.isGroup ?? false,
        });
        const savedRoom = await this.roomRepository.save(room);
        const participantEntities = participants.map((user) => this.participantRepository.create({ room: savedRoom, user }));
        await this.participantRepository.save(participantEntities);
        return this.getRoomWithParticipants(savedRoom.id);
    }
    async getRoomWithParticipants(roomId) {
        const room = await this.roomRepository.findOne({
            where: { id: roomId },
            relations: ['participants', 'participants.user'],
        });
        if (!room)
            throw new common_1.NotFoundException('방을 찾을 수 없습니다.');
        return room;
    }
    async listRoomsByUser(userId) {
        const memberships = await this.participantRepository.find({
            where: { user: { id: userId } },
            relations: ['room', 'room.participants', 'room.participants.user'],
        });
        return memberships.map((m) => m.room);
    }
};
exports.ChatRoomsService = ChatRoomsService;
exports.ChatRoomsService = ChatRoomsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(chat_room_entity_1.ChatRoom)),
    __param(1, (0, typeorm_1.InjectRepository)(chat_room_participant_entity_1.ChatRoomParticipant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        users_service_1.UsersService])
], ChatRoomsService);
//# sourceMappingURL=chat.rooms.service.js.map