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
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const message_entity_1 = require("./message.entity");
const chat_room_entity_1 = require("./chat-room.entity");
const chat_room_participant_entity_1 = require("./chat-room-participant.entity");
let ChatGateway = class ChatGateway {
    messageRepository;
    roomRepository;
    participantRepository;
    server;
    constructor(messageRepository, roomRepository, participantRepository) {
        this.messageRepository = messageRepository;
        this.roomRepository = roomRepository;
        this.participantRepository = participantRepository;
    }
    handleConnection(client) {
        console.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        console.log(`Client disconnected: ${client.id}`);
    }
    async handleJoinRoom(client, payload) {
        const membership = await this.participantRepository.findOne({
            where: {
                room: { id: payload.roomId },
                user: { id: payload.userId },
            },
            relations: ['room'],
        });
        if (!membership) {
            client.emit('join_error', { message: '권한이 없습니다.' });
            return;
        }
        client.join(String(payload.roomId));
        const messages = await this.messageRepository.find({
            where: { room: { id: payload.roomId } },
            order: { createdAt: 'ASC' },
            take: 50,
        });
        client.emit('initial_messages', {
            roomId: payload.roomId,
            messages: messages.map((m) => ({
                sender: m.sender,
                message: m.content,
                createdAt: m.createdAt,
            })),
        });
    }
    async handleMessage(payload) {
        if (!payload.roomId)
            return;
        const room = await this.roomRepository.findOne({
            where: { id: payload.roomId },
        });
        if (!room)
            return;
        const newMessage = this.messageRepository.create({
            sender: payload.sender,
            content: payload.message,
            room,
        });
        await this.messageRepository.save(newMessage);
        this.server.to(String(payload.roomId)).emit('message', {
            roomId: payload.roomId,
            sender: newMessage.sender,
            message: newMessage.content,
            createdAt: newMessage.createdAt,
        });
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join_room'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleJoinRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('message'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleMessage", null);
exports.ChatGateway = ChatGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: 'http://localhost:3000',
            credentials: true,
        },
    }),
    __param(0, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __param(1, (0, typeorm_1.InjectRepository)(chat_room_entity_1.ChatRoom)),
    __param(2, (0, typeorm_1.InjectRepository)(chat_room_participant_entity_1.ChatRoomParticipant)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map