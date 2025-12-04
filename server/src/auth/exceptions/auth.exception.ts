import { HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';

export class InvalidPasswordException extends HttpException {
    constructor() {
        super({ message: '비밀번호가 일치하지 않습니다.', code: 'AUTH_INVALID_PASSWORD' }, HttpStatus.UNAUTHORIZED);
    }
}

export class UserNotFoundException extends HttpException {
    constructor() {
        super({ message: '사용자를 찾을 수 없습니다.', code: 'AUTH_USER_NOT_FOUND' }, HttpStatus.NOT_FOUND);
    }
}

export class DuplicateUserException extends HttpException {
    constructor() {
        super({ message: '이미 존재하는 사용자입니다.', code: 'AUTH_DUPLICATE_USER' }, HttpStatus.CONFLICT);
    }
}
