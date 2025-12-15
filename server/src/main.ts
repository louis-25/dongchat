import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS origin 설정: 환경 변수에서 여러 URL을 쉼표로 구분하여 받거나 기본값 사용
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : ['http://localhost:3000'];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // origin이 없으면 (같은 도메인 요청 등) 허용
      if (!origin) {
        callback(null, true);
        return;
      }
      // 허용된 origin 목록에 있으면 허용
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // 개발 환경에서는 localhost 허용
      if (
        process.env.NODE_ENV !== 'production' &&
        origin.includes('localhost')
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS 정책에 의해 차단되었습니다.'));
    },
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
  console.log(
    `Swagger 문서: http://localhost:${process.env.PORT ?? 4000}/api-docs`,
  );
}
void bootstrap();
