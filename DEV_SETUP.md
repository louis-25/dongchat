# 로컬 개발 환경

## 준비물
- Node 24 (`.nvmrc`), pnpm, Docker Desktop

## 최초 1회
```bash
git clone <repo> && cd dongchat
cd client && pnpm install && cd ..

# 비밀 파일(gitignore됨) 만들고 값 채우기
cp supabase/.env.example supabase/.env          # 카카오 키, VAPID 키, 웹훅 비밀
cp client/.env.local.example client/.env.local  # Supabase URL·publishable key, VAPID 공개키

# 로컬 Supabase(Postgres·Auth·Realtime·Edge Functions)
npx -y supabase@2.120.0 start
npx -y supabase@2.120.0 status -o env   # PUBLISHABLE_KEY를 client/.env.local에 넣는다
```

`supabase start`가 마이그레이션과 `supabase/seed.sql`(테스트 계정, 로컬 푸시 웹훅 Vault 값)을 적용한다.
시드 계정: `admin@dongchat.local`(관리자), `alice@dongchat.local`, `bob@dongchat.local` — 비밀번호 `password123`.

- VAPID 키: `npx -y web-push generate-vapid-keys` → 공개키는 두 env 파일에, 개인키는 `supabase/.env`에만.
- 카카오: 개발자 콘솔에서 비즈 앱 전환 + 이메일 필수 동의, Redirect URI `http://localhost:54321/auth/v1/callback`.

## 매일
```bash
npx -y supabase@2.120.0 start      # 이미 떠 있으면 생략
cd client && pnpm dev               # http://localhost:3000
```
Studio: http://127.0.0.1:54323 (테이블·SQL·사용자). 메일(이메일 확인 사용 시): http://127.0.0.1:54324.

## 검증
```bash
cd client
pnpm exec tsc --noEmit && pnpm lint && pnpm test
SUPABASE_PUBLISHABLE_KEY=<키> PUSH_WEBHOOK_SECRET=local-dev-push-secret pnpm verify   # 로컬 Supabase 대상 통합 검증
cd .. && npx -y supabase@2.120.0 test db                                              # pgTAP
```

## 알아 둘 것
- DB 변경: `npx -y supabase@2.120.0 migration new <이름>` → SQL 작성 → `migration up`(데이터 유지) 또는 `db reset`(초기화+seed). 변경 후 `supabase gen types --local --lang typescript --schema public > client/src/lib/supabase/database.types.ts`.
- Edge Function 코드 수정은 Windows에서 핫 리로드되지 않는다: `docker restart supabase_edge_runtime_dongchat`. 새 함수·`config.toml` 변경은 `supabase stop && supabase start`.
- 강제 로그아웃·정지 수동 테스트: Studio SQL에서 `private.user_access`의 `sessions_revoked_at = now()` / `banned_until` 설정(관리자 화면 `/admin/users`로도 가능).
