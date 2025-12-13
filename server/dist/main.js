"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    });
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    const config = new swagger_1.DocumentBuilder()
        .setTitle('dongchat API')
        .setDescription('실시간 채팅 애플리케이션 API 문서')
        .setVersion('1.0')
        .addTag('Auth', '회원가입 및 로그인 관련 API')
        .addTag('Chat', '채팅 메시지 관련 API')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api-docs', app, document);
    await app.listen(process.env.PORT ?? 4000);
    console.log(`서버 실행 중: http://localhost:${process.env.PORT ?? 4000}`);
    console.log(`Swagger 문서: http://localhost:${process.env.PORT ?? 4000}/api-docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map