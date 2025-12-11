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
exports.ChatRoom = void 0;
const typeorm_1 = require("typeorm");
const message_entity_1 = require("./message.entity");
const chat_room_participant_entity_1 = require("./chat-room-participant.entity");
let ChatRoom = class ChatRoom {
    id;
    name;
    isGroup;
    messages;
    participants;
    createdAt;
    updatedAt;
};
exports.ChatRoom = ChatRoom;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], ChatRoom.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Object)
], ChatRoom.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], ChatRoom.prototype, "isGroup", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.Message, (message) => message.room),
    __metadata("design:type", Array)
], ChatRoom.prototype, "messages", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => chat_room_participant_entity_1.ChatRoomParticipant, (participant) => participant.room),
    __metadata("design:type", Array)
], ChatRoom.prototype, "participants", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ChatRoom.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ChatRoom.prototype, "updatedAt", void 0);
exports.ChatRoom = ChatRoom = __decorate([
    (0, typeorm_1.Entity)()
], ChatRoom);
//# sourceMappingURL=chat-room.entity.js.map