import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Response } from 'express';

const ERROR_CODE_MAP: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'AUTH_UNAUTHORIZED',
    403: 'AUTH_FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_FAILED',
    500: 'INTERNAL_SERVER_ERROR',
};

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const status = exception.getStatus();
        const exceptionResponse = exception.getResponse();

        let message = '요청 처리 중 오류가 발생했습니다.';
        let code: string = ERROR_CODE_MAP[status] ?? 'UNKNOWN_ERROR';

        if (typeof exceptionResponse === 'string') {
            message = exceptionResponse;
        } else if (typeof exceptionResponse === 'object') {
            const body = exceptionResponse as any;

            message = body.message || message;

            // 우선순위: (1) 개발자가 명시한 code → (2) 매핑 테이블 → (3) fallback
            if (body.code) {
                code = body.code;
            } else if (ERROR_CODE_MAP[status]) {
                code = ERROR_CODE_MAP[status];
            }
        }

        response.status(status).json({
            status,
            code,
            message,
        });
    }
}
