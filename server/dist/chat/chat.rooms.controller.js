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
exports.ChatRoomsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const chat_rooms_service_1 = require("./chat.rooms.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const create_room_dto_1 = require("./dto/create-room.dto");
let ChatRoomsController = class ChatRoomsController {
    chatRoomsService;
    constructor(chatRoomsService) {
        this.chatRoomsService = chatRoomsService;
    }
    async create(req, dto) {
        return this.chatRoomsService.createRoom(Number(req.user.userId), dto);
    }
    async list(req) {
        return this.chatRoomsService.listRoomsByUser(Number(req.user.userId));
    }
};
exports.ChatRoomsController = ChatRoomsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '채팅방 생성 (1:1 또는 그룹)' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_room_dto_1.CreateRoomDto]),
    __metadata("design:returntype", Promise)
], ChatRoomsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '내 채팅방 목록' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChatRoomsController.prototype, "list", null);
exports.ChatRoomsController = ChatRoomsController = __decorate([
    (0, swagger_1.ApiTags)('ChatRooms'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('chat/rooms'),
    __metadata("design:paramtypes", [chat_rooms_service_1.ChatRoomsService])
], ChatRoomsController);
//# sourceMappingURL=chat.rooms.controller.js.map