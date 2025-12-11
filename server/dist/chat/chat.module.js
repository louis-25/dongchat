"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const chat_gateway_1 = require("./chat.gateway");
const chat_controller_1 = require("./chat.controller");
const message_entity_1 = require("./message.entity");
const chat_room_entity_1 = require("./chat-room.entity");
const chat_room_participant_entity_1 = require("./chat-room-participant.entity");
const chat_rooms_controller_1 = require("./chat.rooms.controller");
const chat_rooms_service_1 = require("./chat.rooms.service");
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([message_entity_1.Message, chat_room_entity_1.ChatRoom, chat_room_participant_entity_1.ChatRoomParticipant])],
        controllers: [chat_controller_1.ChatController, chat_rooms_controller_1.ChatRoomsController],
        providers: [chat_gateway_1.ChatGateway, chat_rooms_service_1.ChatRoomsService],
    })
], ChatModule);
//# sourceMappingURL=chat.module.js.map