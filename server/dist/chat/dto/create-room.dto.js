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
exports.CreateRoomDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreateRoomDto {
    name;
    isGroup;
    participantUsernames;
}
exports.CreateRoomDto = CreateRoomDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        required: false,
        description: '방 이름 (그룹일 때 주로 사용)',
    }),
    __metadata("design:type", String)
], CreateRoomDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false, description: '그룹 여부, 기본 false' }),
    __metadata("design:type", Boolean)
], CreateRoomDto.prototype, "isGroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        isArray: true,
        type: String,
        description: '참여자 username 목록 (현재 사용자 제외해도 서버가 포함시킴)',
        example: ['user1', 'user2'],
    }),
    __metadata("design:type", Array)
], CreateRoomDto.prototype, "participantUsernames", void 0);
//# sourceMappingURL=create-room.dto.js.map