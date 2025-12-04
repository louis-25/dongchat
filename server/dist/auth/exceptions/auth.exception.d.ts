import { HttpException } from '@nestjs/common';
export declare class InvalidPasswordException extends HttpException {
    constructor();
}
export declare class UserNotFoundException extends HttpException {
    constructor();
}
export declare class DuplicateUserException extends HttpException {
    constructor();
}
