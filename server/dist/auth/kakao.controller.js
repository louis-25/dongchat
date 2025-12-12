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
exports.KakaoController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const kakao_login_dto_1 = require("./dto/kakao-login.dto");
let KakaoController = class KakaoController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async kakaoLogin(body) {
        return this.authService.loginWithKakao(body.providerId, body.nickname, body.username, body.profileImage);
    }
};
exports.KakaoController = KakaoController;
__decorate([
    (0, common_1.Post)('kakao'),
    (0, swagger_1.ApiOperation)({ summary: '카카오 OAuth 로그인/회원가입' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [kakao_login_dto_1.KakaoLoginDto]),
    __metadata("design:returntype", Promise)
], KakaoController.prototype, "kakaoLogin", null);
exports.KakaoController = KakaoController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], KakaoController);
//# sourceMappingURL=kakao.controller.js.map