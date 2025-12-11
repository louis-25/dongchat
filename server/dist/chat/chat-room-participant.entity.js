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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRoomParticipant = void 0;
const typeorm_1 = require("typeorm");
const chat_room_entity_1 = require("./chat-room.entity");
const user_entity_1 = require("../users/user.entity");
let ChatRoomParticipant = class ChatRoomParticipant {
    id;
    room;
    user;
    createdAt;
};
exports.ChatRoomParticipant = ChatRoomParticipant;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], ChatRoomParticipant.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => chat_room_entity_1.ChatRoom, (room) => room.participants, { eager: true }),
    __metadata("design:type", chat_room_entity_1.ChatRoom)
], ChatRoomParticipant.prototype, "room", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { eager: true }),
    __metadata("design:type", user_entity_1.User)
], ChatRoomParticipant.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ChatRoomParticipant.prototype, "createdAt", void 0);
exports.ChatRoomParticipant = ChatRoomParticipant = __decorate([
    (0, typeorm_1.Entity)(),
    (0, typeorm_1.Unique)(['room', 'user'])
], ChatRoomParticipant);
//# sourceMappingURL=chat-room-participant.entity.js.map