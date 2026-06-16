# server/AGENTS.md — 백엔드 가이드

dongchat 백엔드(NestJS)에서 코드를 작성·수정할 때 따라야 하는 규칙입니다.
루트 [AGENTS.md](../AGENTS.md)의 `/nestjs-best-practices` 스킬·context7 규칙이 그대로 적용되며,
이 문서는 그 위에 프로젝트 고유의 구조·컨벤션을 정의합니다.

## 기술 스택

- **NestJS 11** / **TypeScript** / **pnpm**
- **TypeORM 0.3** + **MySQL** (mysql2)
- **JWT** (`@nestjs/jwt`) + **Passport** (`passport-jwt`)
- **Socket.io** (`@nestjs/websockets` + `@nestjs/platform-socket.io`) — 실시간 채팅
- **Swagger** (`@nestjs/swagger`) — `/api-docs`(UI), `/api-docs-json`(프론트 Orval 소비)
- **class-validator** (DTO 검증), **bcrypt** (비밀번호 해시), **web-push** (푸시 알림)

## 디렉터리 구조

도메인별 모듈로 구성합니다. 각 모듈은 `*.module.ts` + `*.controller.ts` + `*.service.ts` + `*.entity.ts` + `dto/`.

```
src/
  main.ts                    # 부트스트랩: CORS, 글로벌 필터, Swagger 설정
  app.module.ts              # 루트 모듈 (ConfigModule 글로벌, TypeORM forRootAsync)
  auth/                      # 인증 (JWT 발급/갱신, Kakao OAuth, 가드/전략)
  users/                     # 사용자
  chat/                      # 채팅 (REST + chat.gateway.ts WebSocket)
  friends/                   # 친구 요청/수락/차단
  push/                      # 웹 푸시 구독·발송
  common/
    filters/                 # HttpExceptionFilter (글로벌)
    exceptions/              # base.exception
    decorators/              # Roles, ApiErrorResponse
    guards/                  # RolesGuard
```

## 신규 도메인 추가 시

1. `nest g module/controller/service <name>` 또는 동일 구조로 수동 생성.
2. 엔티티는 `@Entity()` + TypeORM 데코레이터로 작성. `app.module.ts`는 `autoLoadEntities: true`이므로
   엔티티 자동 등록되지만, **Repository는 해당 모듈에서 `TypeOrmModule.forFeature([...])`로 등록**해야 합니다.
3. 루트 모듈 `imports`에 새 모듈 추가.

## DB 규칙

- 개발 환경은 `synchronize: true` (스키마 자동 동기화). **프로덕션에서는 마이그레이션으로 전환 검토 필요** — 엔티티 변경이 곧 스키마 변경임을 인지하고 신중히.
- 접속 정보는 `ConfigService`로 환경 변수에서 주입 (`DB_HOST/PORT/USERNAME/PASSWORD/DATABASE`).

## 인증·인가 규칙

- JWT는 [auth/auth.service.ts](src/auth/auth.service.ts)에서 발급: access `15m`, refresh `7d`.
  payload는 `{ username, sub(=userId), role }` 형태로 통일합니다.
- 비밀번호는 항상 **bcrypt** 해시. 평문 저장·비교 금지.
- 토큰 시크릿은 env `NEXTAUTH_SECRET` (프론트 NextAuth와 공유) — [jwt.strategy.ts](src/auth/jwt.strategy.ts).
- 역할 기반 인가는 `@Roles(UserRole.X)` 데코레이터 + `RolesGuard` 조합 사용
  ([common/decorators/roles.decorator.ts](src/common/decorators/roles.decorator.ts), [common/guards/roles.guard.ts](src/common/guards/roles.guard.ts)).

## 에러 처리 규칙 (프론트와 계약)

- 도메인 예외는 `HttpException`을 상속해 **`{ message, code }` + HTTP status**로 던집니다
  (예: [auth/exceptions/auth.exception.ts](src/auth/exceptions/auth.exception.ts)).
- 글로벌 [HttpExceptionFilter](src/common/filters/http-exception.filter.ts)가 모든 응답을
  `{ status, code, message }`로 정규화합니다. `code`는 프론트 [error-handler.ts](../client/src/lib/error-handler.ts)의
  매핑 키와 일치해야 합니다 (`AUTH_USER_NOT_FOUND`, `AUTH_INVALID_PASSWORD`, `AUTH_DUPLICATE_USER`, `VALIDATION_FAILED` 등).
- 새 에러 코드 추가 시 **프론트 매핑도 함께 업데이트**할 것.

## API 문서 규칙 (Orval 계약)

- 프론트는 `/api-docs-json`을 Orval로 소비하므로 **Swagger 데코레이터가 곧 API 계약**입니다.
- 모든 엔드포인트에 `@ApiTags`, `@ApiOperation`, `@ApiResponse`, 에러는 `@ApiErrorResponse(...)` 부여.
- 요청/응답 DTO는 `@ApiProperty`로 필드를 명시 ([auth/dto/](src/auth/dto/) 참조). 컨트롤러 변경 후 프론트에서 `pnpm generate:api` 재실행이 필요함을 기억.

## WebSocket 규칙

- 게이트웨이는 [chat/chat.gateway.ts](src/chat/chat.gateway.ts) 패턴을 따릅니다.
- **모든 소켓 연결은 `afterInit`의 미들웨어에서 JWT 검증** (`auth.token` → `Authorization` 헤더 순).
  검증된 신원은 `socket.data.userId/username`에 저장.
- **클라이언트가 보낸 `senderId`/`userId`를 신뢰하지 말 것** — 항상 `socket.data`의 검증된 값 사용(스푸핑 방지).
- 메시지 발신 전 방 참여자(`participant`) 여부를 반드시 확인.
- CORS origin은 `FRONTEND_URL`(쉼표 구분) 환경 변수로 관리하고 끝 슬래시를 정규화합니다(`main.ts`와 동일 규칙).

## 자주 쓰는 명령

```bash
pnpm start:dev   # watch 개발 서버
pnpm build       # 빌드
pnpm lint        # ESLint --fix
pnpm test        # 단위 테스트 (*.spec.ts)
pnpm test:e2e    # E2E 테스트
```
