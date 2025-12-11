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
exports.FriendsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const friend_entity_1 = require("./friend.entity");
const users_service_1 = require("../users/users.service");
let FriendsService = class FriendsService {
    friendRepository;
    usersService;
    constructor(friendRepository, usersService) {
        this.friendRepository = friendRepository;
        this.usersService = usersService;
    }
    async sendRequest(requesterId, receiverUsername) {
        const requester = await this.usersService.findById(requesterId);
        const receiver = await this.usersService.findOne(receiverUsername);
        if (!receiver) {
            throw new common_1.NotFoundException('사용자를 찾을 수 없습니다.');
        }
        if (!requester) {
            throw new common_1.NotFoundException('요청자를 찾을 수 없습니다.');
        }
        if (requester.id === receiver.id) {
            throw new common_1.BadRequestException('본인에게 친구 요청을 보낼 수 없습니다.');
        }
        const existing = await this.friendRepository.findOne({
            where: [
                { requester, receiver },
                { requester: receiver, receiver: requester },
            ],
        });
        if (existing) {
            throw new common_1.BadRequestException('이미 친구 요청이 존재합니다.');
        }
        const entity = this.friendRepository.create({
            requester,
            receiver,
            status: friend_entity_1.FriendStatus.PENDING,
        });
        return this.friendRepository.save(entity);
    }
    async respondRequest(requestId, userId, action) {
        const request = await this.friendRepository.findOne({
            where: { id: requestId },
        });
        if (!request) {
            throw new common_1.NotFoundException('요청을 찾을 수 없습니다.');
        }
        if (request.receiver.id !== userId) {
            throw new common_1.BadRequestException('승인/차단 권한이 없습니다.');
        }
        request.status =
            action === 'accept' ? friend_entity_1.FriendStatus.ACCEPTED : friend_entity_1.FriendStatus.BLOCKED;
        return this.friendRepository.save(request);
    }
    async listFriends(userId) {
        const list = await this.friendRepository.find({
            where: [
                { requester: { id: userId }, status: friend_entity_1.FriendStatus.ACCEPTED },
                { receiver: { id: userId }, status: friend_entity_1.FriendStatus.ACCEPTED },
            ],
        });
        const toPublic = (f) => {
            const friendUser = f.requester.id === userId ? f.receiver : f.requester;
            return { id: f.id, friend: friendUser };
        };
        return list.map(toPublic);
    }
    async listPending(userId) {
        return this.friendRepository.find({
            where: [{ receiver: { id: userId }, status: friend_entity_1.FriendStatus.PENDING }],
        });
    }
};
exports.FriendsService = FriendsService;
exports.FriendsService = FriendsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(friend_entity_1.Friend)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        users_service_1.UsersService])
], FriendsService);
//# sourceMappingURL=friends.service.js.map