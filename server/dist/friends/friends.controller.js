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
exports.FriendsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const friends_service_1 = require("./friends.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const send_friend_request_dto_1 = require("./dto/send-friend-request.dto");
let FriendsController = class FriendsController {
    friendsService;
    constructor(friendsService) {
        this.friendsService = friendsService;
    }
    async request(req, dto) {
        return this.friendsService.sendRequest(req.user.userId, dto.username);
    }
    async accept(req, id) {
        return this.friendsService.respondRequest(Number(id), req.user.userId, 'accept');
    }
    async block(req, id) {
        return this.friendsService.respondRequest(Number(id), req.user.userId, 'block');
    }
    async list(req) {
        return this.friendsService.listFriends(req.user.userId);
    }
    async pending(req) {
        return this.friendsService.listPending(req.user.userId);
    }
};
exports.FriendsController = FriendsController;
__decorate([
    (0, common_1.Post)('request'),
    (0, swagger_1.ApiOperation)({ summary: '친구 요청 보내기' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, send_friend_request_dto_1.SendFriendRequestDto]),
    __metadata("design:returntype", Promise)
], FriendsController.prototype, "request", null);
__decorate([
    (0, common_1.Patch)(':id/accept'),
    (0, swagger_1.ApiOperation)({ summary: '친구 요청 수락' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FriendsController.prototype, "accept", null);
__decorate([
    (0, common_1.Patch)(':id/block'),
    (0, swagger_1.ApiOperation)({ summary: '친구 요청 차단' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FriendsController.prototype, "block", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '친구 목록 조회' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FriendsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('pending'),
    (0, swagger_1.ApiOperation)({ summary: '받은 친구 요청 목록 조회' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FriendsController.prototype, "pending", null);
exports.FriendsController = FriendsController = __decorate([
    (0, swagger_1.ApiTags)('Friends'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('friends'),
    __metadata("design:paramtypes", [friends_service_1.FriendsService])
], FriendsController);
//# sourceMappingURL=friends.controller.js.map