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
exports.MessageQueryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class MessageQueryDto {
    page = 1;
    limit = 50;
}
exports.MessageQueryDto = MessageQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '페이지 번호',
        example: 1,
        default: 1,
    }),
    __metadata("design:type", Number)
], MessageQueryDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: '페이지당 항목 수',
        example: 50,
        default: 50,
    }),
    __metadata("design:type", Number)
], MessageQueryDto.prototype, "limit", void 0);
//# sourceMappingURL=message-query.dto.js.map