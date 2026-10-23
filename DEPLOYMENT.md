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
   - Site URL: `https://dongchat-eta.vercel.app`, Redirect URLs: `https://dongchat-eta.vercel.app/auth/callback`
   - JWT 만료 600초(로컬 `config.toml`과 동일), 최소 비밀번호 6자
   - 카카오 provider: REST API 키/Secret 입력. 카카오 콘솔 Redirect URI에 `https://<ref>.supabase.co/auth/v1/callback` 추가
   - **실사용자 전 커스텀 SMTP 연결 필수**: 기본 SMTP는 시간당 2통. 연결 전에는 이메일 확인을 끈 상태로 운영한다.
5. Realtime 설정: "Allow public access" 끄기(비공개 채널만).

## 2. 웹 푸시
```bash
npx -y supabase@2.120.0 functions deploy send-push --no-verify-jwt
npx -y supabase@2.120.0 secrets set VAPID_PUBLIC_KEY=<공개키> VAPID_PRIVATE_KEY=<개인키> VAPID_SUBJECT=https://dongchat-eta.vercel.app PUSH_WEBHOOK_SECRET=<임의의 긴 값>
```
Studio SQL에서 웹훅 값(Vault) 설정 — 비밀은 위 `PUSH_WEBHOOK_SECRET`과 같은 값:
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_webhook_url');
select vault.create_secret('<PUSH_WEBHOOK_SECRET 값>', 'push_webhook_secret');
```
주의:
- `VAPID_SUBJECT`는 실제 사이트 주소나 실제 메일이어야 한다. Apple(아이폰)은 `mailto:…@dongchat.local` 같은 가짜 주소를 `403 BadJwtToken`으로 거부한다(안드로이드는 통과해서 놓치기 쉽다).
- `secrets set`은 로컬 `supabase/.env`도 함께 읽어 올린다. 로컬 전용 `PUSH_ALLOW_HTTP`뿐 아니라 로컬 `PUSH_WEBHOOK_SECRET`도 올라가 운영 값(Vault와 같아야 함)을 덮어쓰고, 그러면 모든 알림이 401이 된다. 값 하나만 바꿀 때는 `supabase/.env`를 잠시 다른 이름으로 옮기고 `secrets set --env-file <그 값만 담은 파일>`로 올린 뒤 되돌린다. 끝나면 `secrets list`로 `PUSH_ALLOW_HTTP`가 없는지, 값 해시가 바뀌지 않았는지 확인한다.

`PUSH_ALLOW_HTTP`는 운영에 절대 설정하지 않는다 — 설정하지 않으면 알려진 브라우저 푸시 서비스(FCM·Mozilla·Windows·Apple)의 https 주소로만 발송한다(SSRF 방지).

## 2-1. 수신 웹훅(외부 스크립트 → 채팅방)
```bash
npx -y supabase@2.120.0 functions deploy webhook --no-verify-jwt
```
새 비밀 없음(`SUPABASE_URL`, service role 키는 런타임이 넣는다). 발급·관리는 Studio SQL Editor에서만 한다(앱·API로는 호출 불가).
```sql
-- 기존 그룹 방에 봇 넣기(방 id = 앱 주소 /chat/rooms/<id>). 1:1 방은 거절된다.
select public.create_webhook('채용봇', 123);
-- 새 그룹 방(이름 = 웹훅 이름, 방장 = 첫 사용자)을 만들어 넣기
select public.create_webhook('채용봇', array['<username>', '<username>']);
-- 목록·재발급·삭제(삭제해도 이전 메시지와 봇 이름은 남는다)
select id, room_id, name, last_used_at from private.webhooks;
select public.rotate_webhook(<id>);
select public.delete_webhook(<id>);
```
- 반환된 `dch_…` 토큰은 **이때 한 번만** 보인다(DB에는 해시만 저장). 잃어버리면 `rotate_webhook`.
- 보내는 쪽 — 토큰은 헤더로만 받는다(주소에 넣지 않는다):
```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/webhook" \
  -H "Authorization: Bearer dch_..." -H "Content-Type: text/plain; charset=utf-8" --data-binary @jobs.txt
# 또는 -H "Content-Type: application/json" -d '{"text":"..."}'
```
- 응답: 200 `{"posted": n}`, 401 토큰 틀림·봇이 방에서 강퇴됨, 400 빈 본문, 413 20,000자 초과 또는 나눈 뒤 10조각 초과, 405 POST 아님.
- 2,000자가 넘으면 줄 단위로 나눠 여러 메시지(최대 10개)로 올린다. `http(s)://` 주소는 앱에서 누를 수 있다.
- Windows 명령줄의 `-d '한글'`은 시스템 코드페이지로 넘어가 글자가 깨진다. 한글은 UTF-8 파일(`--data-binary @파일`)로 보낸다.

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
