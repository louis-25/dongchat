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
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const message_entity_1 = require("./message.entity");
const message_query_dto_1 = require("./dto/message-query.dto");
let ChatController = class ChatController {
    messageRepository;
    constructor(messageRepository) {
        this.messageRepository = messageRepository;
    }
    async getMessages(query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 50;
        const skip = (page - 1) * limit;
        return this.messageRepository.find({
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
        });
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '메시지 조회', description: '저장된 채팅 메시지를 페이지네이션하여 조회합니다.' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '페이지 번호', example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '페이지당 항목 수', example: 50 }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '메시지 목록', type: [message_entity_1.Message] }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [message_query_dto_1.MessageQueryDto]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getMessages", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('채팅'),
    (0, common_1.Controller)('api/messages'),
    __param(0, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], ChatController);
//# sourceMappingURL=chat.controller.js.map