import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('dongchat API')
    .setDescription('실시간 채팅 애플리케이션 API 문서')
    .setVersion('1.0')
    .addTag('Auth', '회원가입 및 로그인 관련 API')
    .addTag('Chat', '채팅 메시지 관련 API')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 4000);
  console.log(`서버 실행 중: http://localhost:${process.env.PORT ?? 4000}`);
  console.log(`Swagger 문서: http://localhost:${process.env.PORT ?? 4000}/api-docs`);
}
bootstrap();
