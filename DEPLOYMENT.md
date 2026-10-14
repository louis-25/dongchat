# 배포 (Supabase Free + Vercel Hobby)

## 1. Supabase 프로젝트
1. supabase.com에서 프로젝트 생성(리전: 서울 `ap-northeast-2`). DB 비밀번호 보관.
2. 저장소 루트에서:
   ```bash
   npx -y supabase@2.120.0 login
   npx -y supabase@2.120.0 link --project-ref <ref>
   npx -y supabase@2.120.0 db push                 # migrations 적용(seed는 적용 안 됨)
   ```
3. 관리자 지정(Studio SQL): `insert into private.user_roles (user_id, role) select id, 'ADMIN' from auth.users where email = '<관리자 이메일>';` (가입 후)
4. Authentication 설정
   - Site URL: `https://<vercel 도메인>`, Redirect URLs: `https://<vercel 도메인>/auth/callback`
   - JWT 만료 600초(로컬 `config.toml`과 동일), 최소 비밀번호 6자
   - 카카오 provider: REST API 키/Secret 입력. 카카오 콘솔 Redirect URI에 `https://<ref>.supabase.co/auth/v1/callback` 추가
   - **실사용자 전 커스텀 SMTP 연결 필수**: 기본 SMTP는 시간당 2통. 연결 전에는 이메일 확인을 끈 상태로 운영한다.
5. Realtime 설정: "Allow public access" 끄기(비공개 채널만).

## 2. 웹 푸시
```bash
npx -y supabase@2.120.0 functions deploy send-push --no-verify-jwt
npx -y supabase@2.120.0 secrets set VAPID_PUBLIC_KEY=<공개키> VAPID_PRIVATE_KEY=<개인키> VAPID_SUBJECT=mailto:<연락 메일> PUSH_WEBHOOK_SECRET=<임의의 긴 값>
```
Studio SQL에서 웹훅 값(Vault) 설정 — 비밀은 위 `PUSH_WEBHOOK_SECRET`과 같은 값:
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_webhook_url');
select vault.create_secret('<PUSH_WEBHOOK_SECRET 값>', 'push_webhook_secret');
```
`PUSH_ALLOW_HTTP`는 운영에 절대 설정하지 않는다 — 설정하지 않으면 알려진 브라우저 푸시 서비스(FCM·Mozilla·Windows·Apple)의 https 주소로만 발송한다(SSRF 방지).

## 3. Vercel
- Root Directory: `client`, Framework: Next.js, Install: `pnpm install`
- 환경 변수: `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<공개키>`
- secret/service role 키는 Vercel에 넣지 않는다.

## 4. 배포 후 확인
1. 가입·로그인(이메일, 카카오) → 친구 추가 → 방 생성 → 두 브라우저로 메시지·읽음 수 확인
2. 알림 허용 후 다른 계정이 보낸 메시지가 푸시로 오는지, 알림 클릭 시 그 방이 열리는지
3. 관리자 `/admin/users`에서 정지·강제 로그아웃이 대상 화면에 즉시 반영되는지

## 무료 플랜 한도와 위험 (배포 전 공식 페이지에서 다시 확인: https://supabase.com/pricing , https://vercel.com/pricing — 이 문서 작성 2026-10-14)
- **Supabase Free: 7일 무활동 시 프로젝트 일시 정지**(대시보드에서 재개), 활성 Free 프로젝트 2개까지. 데모용이면 주의.
- **Vercel Hobby: 개인·비상업 용도 한정.** 상업 서비스로 운영하려면 Pro가 필요하다.
- DB 용량·Edge Function 호출 수·Realtime 메시지 수(수신자 수만큼 계산)·동시 연결 수에 월 한도가 있다 — 위 가격 페이지의 현재 값을 기준으로 판단한다.
- 방마다 Realtime 채널을 연다 — 사용자당 참여 방이 수백 개가 되면 user 채널 단일 구독으로 바꿔야 한다(스펙 §8.4).
- 백업: Free는 자동 백업 없음 → 중요해지면 `supabase db dump`를 주기적으로.

## NestJS로 되돌리려면
Postgres(스키마·함수)는 그대로 두고 `client/src/services/` 내부만 fetch/socket.io로 바꾼다. 이벤트 이름·payload는 스펙 §8.1 표를 따른다(스펙 §6 이식 체크리스트).
