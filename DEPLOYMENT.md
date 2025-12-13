# Vercel 배포 가이드

## 개요

이 프로젝트는 monorepo 구조로 되어 있으며, 프론트엔드(Next.js)와 백엔드(NestJS)를 분리하여 배포하는 것을 권장합니다.

## 배포 전략

### 옵션 1: 분리 배포 (권장) ⭐

#### 프론트엔드 (Next.js) → Vercel

- Vercel은 Next.js에 최적화되어 있어 가장 간단합니다.

#### 백엔드 (NestJS) → Railway / Render / Fly.io

- NestJS는 WebSocket(Socket.io)을 사용하므로 전용 서버가 필요합니다.
- Vercel Serverless Functions는 WebSocket을 지원하지 않습니다.

### 옵션 2: Vercel Monorepo (프론트엔드만)

프론트엔드만 Vercel에 배포하고, 백엔드는 별도 플랫폼에 배포합니다.

---

## 배포 단계

### 1. 프론트엔드 배포 (Vercel)

#### Vercel 대시보드에서:

1. 새 프로젝트 생성
2. Git 저장소 연결
3. **Root Directory**: `client` 설정
4. **Framework Preset**: Next.js
5. **Build Command**: `pnpm build` (또는 자동 감지)
6. **Output Directory**: `.next` (자동 감지)
7. **Install Command**: `pnpm install`

#### 환경 변수 설정:

```
NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
NEXT_PUBLIC_NEXTAUTH_SECRET=your-secret-key
NEXT_PUBLIC_KAKAO_CLIENT_ID=your-kakao-client-id
NEXT_PUBLIC_KAKAO_CLIENT_SECRET=your-kakao-client-secret
NEXTAUTH_URL=https://your-frontend-url.vercel.app
```

### 2. 백엔드 배포 (Railway 권장)

#### Railway 배포:

1. [Railway.app](https://railway.app) 가입
2. 새 프로젝트 생성 → "Deploy from GitHub repo"
3. 저장소 선택 후 **Root Directory**: `server` 설정
4. **Start Command**: `pnpm start:prod`

#### 환경 변수 설정:

```
DB_HOST=your-db-host
DB_PORT=3306
DB_USERNAME=your-db-username
DB_PASSWORD=your-db-password
DB_DATABASE=your-db-name
JWT_SECRET=your-jwt-secret
FRONTEND_URL=https://your-frontend-url.vercel.app
PORT=4000
```

#### MySQL 데이터베이스:

- Railway에서 MySQL 서비스 추가
- 또는 PlanetScale, Supabase 등 외부 DB 사용

### 3. 백엔드 CORS 설정 수정

`server/src/main.ts` 파일을 수정하여 배포된 프론트엔드 URL을 허용:

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
});
```

---

## 대안: Render 배포

### 백엔드 (Render):

1. [Render.com](https://render.com) 가입
2. "New Web Service" 선택
3. 저장소 연결
4. 설정:
   - **Root Directory**: `server`
   - **Build Command**: `cd server && pnpm install && pnpm build`
   - **Start Command**: `cd server && pnpm start:prod`
   - **Environment**: Node

---

## 환경 변수 체크리스트

### 프론트엔드 (Vercel)

- [ ] `NEXT_PUBLIC_API_URL` - 백엔드 URL
- [ ] `NEXT_PUBLIC_NEXTAUTH_SECRET` - NextAuth 시크릿 키
- [ ] `NEXT_PUBLIC_KAKAO_CLIENT_ID` - 카카오 클라이언트 ID
- [ ] `NEXT_PUBLIC_KAKAO_CLIENT_SECRET` - 카카오 클라이언트 시크릿
- [ ] `NEXTAUTH_URL` - 프론트엔드 URL

### 백엔드 (Railway/Render)

- [ ] `DB_HOST` - 데이터베이스 호스트
- [ ] `DB_PORT` - 데이터베이스 포트 (기본: 3306)
- [ ] `DB_USERNAME` - 데이터베이스 사용자명
- [ ] `DB_PASSWORD` - 데이터베이스 비밀번호
- [ ] `DB_DATABASE` - 데이터베이스 이름
- [ ] `JWT_SECRET` - JWT 시크릿 키
- [ ] `FRONTEND_URL` - 프론트엔드 URL (CORS용)
- [ ] `PORT` - 서버 포트 (기본: 4000)

---

## 주의사항

1. **WebSocket 연결**: Socket.io는 서버리스 환경에서 제대로 작동하지 않으므로 전용 서버가 필요합니다.
2. **데이터베이스**: 프로덕션에서는 `synchronize: true`를 `false`로 변경하고 마이그레이션을 사용하세요.
3. **환경 변수**: `.env` 파일은 Git에 커밋하지 마세요.
4. **CORS**: 백엔드의 CORS 설정이 프론트엔드 URL을 포함하도록 확인하세요.

---

## 빠른 시작 (Railway + Vercel)

### 1. Railway에 백엔드 배포

```bash
# Railway CLI 설치 (선택사항)
npm i -g @railway/cli
railway login
railway init
railway up
```

### 2. Vercel에 프론트엔드 배포

```bash
# Vercel CLI 설치
npm i -g vercel
cd client
vercel
```

---

## 문제 해결

### CORS 에러

- 백엔드의 `FRONTEND_URL` 환경 변수가 올바른지 확인
- 프론트엔드 URL이 CORS 허용 목록에 포함되어 있는지 확인

### WebSocket 연결 실패

- 백엔드가 전용 서버에서 실행 중인지 확인
- Socket.io 클라이언트의 연결 URL이 올바른지 확인

### 데이터베이스 연결 실패

- 데이터베이스 호스트가 외부 접근을 허용하는지 확인
- 방화벽 설정 확인
- 연결 문자열 확인
