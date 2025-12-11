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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const register_dto_1 = require("./dto/register.dto");
const login_dto_1 = require("./dto/login.dto");
const auth_response_dto_1 = require("./dto/auth-response.dto");
const refresh_token_dto_1 = require("./dto/refresh-token.dto");
const api_error_response_decorator_1 = require("../common/decorators/api-error-response.decorator");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async register(registerDto) {
        return this.authService.register(registerDto.username, registerDto.password);
    }
    async login(loginDto) {
        const user = await this.authService.validateUser(loginDto.username, loginDto.password);
        return this.authService.login(user);
    }
    async refresh(refreshTokenDto) {
        return this.authService.refreshTokens(refreshTokenDto.refresh_token);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    (0, swagger_1.ApiOperation)({
        summary: '회원가입',
        description: '새로운 사용자를 등록합니다.',
    }),
    (0, swagger_1.ApiBody)({ type: register_dto_1.RegisterDto }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '회원가입 성공', type: Object }),
    (0, api_error_response_decorator_1.ApiErrorResponse)(409, '이미 존재하는 사용자입니다.', 'AUTH_DUPLICATE_USER'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, swagger_1.ApiOperation)({
        summary: '로그인',
        description: '사용자 인증 후 JWT 토큰을 발급합니다.',
    }),
    (0, swagger_1.ApiBody)({ type: login_dto_1.LoginDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '로그인 성공',
        type: auth_response_dto_1.AuthResponseDto,
    }),
    (0, api_error_response_decorator_1.ApiErrorResponse)(401, '비밀번호가 일치하지 않습니다.', 'AUTH_INVALID_PASSWORD'),
    (0, api_error_response_decorator_1.ApiErrorResponse)(404, '사용자를 찾을 수 없습니다.', 'AUTH_USER_NOT_FOUND'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, swagger_1.ApiOperation)({
        summary: '토큰 갱신',
        description: 'Refresh 토큰으로 새로운 Access 토큰을 발급합니다.',
    }),
    (0, swagger_1.ApiBody)({ type: refresh_token_dto_1.RefreshTokenDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '토큰 갱신 성공',
        type: auth_response_dto_1.AuthResponseDto,
    }),
    (0, api_error_response_decorator_1.ApiErrorResponse)(401, '토큰이 만료되었거나 유효하지 않습니다.', 'AUTH_UNAUTHORIZED'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map