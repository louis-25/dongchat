import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export const ApiErrorResponse = (
  status: number,
  message: string,
  code: string,
) => {
  return applyDecorators(
    ApiResponse({
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
    }),
  );
};
