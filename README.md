# dongchat

친구·1:1/그룹 채팅(실시간, 읽음 수, 답장·수정·삭제), 웹 푸시, 관리자 모더레이션(정지·강제 로그아웃·강퇴·방 열람)을 갖춘 채팅 앱.

- 클라이언트: Next.js 16 (`client/`) — Vercel
- 백엔드: Supabase (Postgres + RLS/RPC, Auth(이메일·카카오), Realtime Broadcast, Edge Function) (`supabase/`)

로컬 개발은 [DEV_SETUP.md](DEV_SETUP.md), 배포는 [DEPLOYMENT.md](DEPLOYMENT.md), 설계는 `docs/superpowers/specs/2026-10-13-supabase-migration-design.md`.
