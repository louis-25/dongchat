"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({
        origin: 'http://localhost:3000',
        credentials: true,
    });
    const config = new swagger_1.DocumentBuilder()
        .setTitle('동챗 API')
        .setDescription('실시간 채팅 애플리케이션 API 문서')
        .setVersion('1.0')
        .addTag('인증', '회원가입 및 로그인 관련 API')
        .addTag('채팅', '채팅 메시지 관련 API')
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