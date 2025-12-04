"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiErrorResponse = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ApiErrorResponse = (status, message, code) => {
    return (0, common_1.applyDecorators)((0, swagger_1.ApiResponse)({
        status,
        description: message,
        schema: {
            type: 'object',
            properties: {
                status: { type: 'number', example: status },
                message: { type: 'string', example: message },
                code: { type: 'string', example: code },
            },
        },
    }));
};
exports.ApiErrorResponse = ApiErrorResponse;
//# sourceMappingURL=api-error-response.decorator.js.map