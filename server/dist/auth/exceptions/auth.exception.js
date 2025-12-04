"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuplicateUserException = exports.UserNotFoundException = exports.InvalidPasswordException = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
class InvalidPasswordException extends common_2.HttpException {
    constructor() {
        super({ message: '비밀번호가 일치하지 않습니다.', code: 'AUTH_INVALID_PASSWORD' }, common_1.HttpStatus.UNAUTHORIZED);
    }
}
exports.InvalidPasswordException = InvalidPasswordException;
class UserNotFoundException extends common_2.HttpException {
    constructor() {
        super({ message: '사용자를 찾을 수 없습니다.', code: 'AUTH_USER_NOT_FOUND' }, common_1.HttpStatus.NOT_FOUND);
    }
}
exports.UserNotFoundException = UserNotFoundException;
class DuplicateUserException extends common_2.HttpException {
    constructor() {
        super({ message: '이미 존재하는 사용자입니다.', code: 'AUTH_DUPLICATE_USER' }, common_1.HttpStatus.CONFLICT);
    }
}
exports.DuplicateUserException = DuplicateUserException;
//# sourceMappingURL=auth.exception.js.map