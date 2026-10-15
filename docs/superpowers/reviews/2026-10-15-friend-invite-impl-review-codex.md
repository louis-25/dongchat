# 친구 초대 링크 구현 검토

검토 범위: `main...HEAD`, 구현 계획·설계 문서, 그리고 현재 `client/src`, `supabase/` 코드. 진행 기록의 Ruling(프로젝트 `useRouter` 사용, Redirect URL 설정 변경 없음)도 반영했다.

## Critical

- 없음. `safeNext`가 외부/역슬래시 URL 및 인증 진입 경로를 거부하고([safe-next.ts:4](../../../client/src/lib/safe-next.ts#L4)), proxy와 OAuth 콜백 모두 이를 사용한다([proxy.ts:57](../../../client/src/lib/supabase/proxy.ts#L57), [route.ts:12](../../../client/src/app/auth/callback/route.ts#L12)).

## Important

- 없음. 비로그인 초대 접근의 `next` 보존, 이메일·가입·카카오 로그인 복귀, 로그인 상태의 인증 화면 우회가 구현되어 있다([proxy.ts:57](../../../client/src/lib/supabase/proxy.ts#L57), [LoginForm.tsx:31](../../../client/src/components/auth/login/LoginForm.tsx#L31), [JoinForm.tsx:35](../../../client/src/components/auth/join/JoinForm.tsx#L35), [auth.ts:45](../../../client/src/services/auth.ts#L45)).
- 없음. `accept_invite`는 양방향 PENDING을 ACCEPTED로 갱신하고, ACCEPTED/BLOCKED/본인/무효 코드 및 동시 INSERT의 `already`를 처리한다([20261015092957_friend_invites.sql:80](../../../supabase/migrations/20261015092957_friend_invites.sql#L80)); pgTAP도 각 계약을 검증한다([150_friend_invites.test.sql:36](../../../supabase/tests/database/150_friend_invites.test.sql#L36)).

## Minor

- 없음. 공유 취소(`AbortError`)는 복사·토스트 없이 `cancelled`로 끝나며, 공유 미지원/실패는 복사 후 최종 불가 시 URL을 보여 준다([share.ts:14](../../../client/src/lib/share.ts#L14), [InviteButton.tsx:24](../../../client/src/components/chat/InviteButton.tsx#L24)).
- 없음. 초대 코드는 private 테이블에 있고 읽기 권한을 철회했으며([20261015092957_friend_invites.sql:2](../../../supabase/migrations/20261015092957_friend_invites.sql#L2)), 미리보기 RPC 반환값은 username/nickname/avatar_url로 제한된다([20261015092957_friend_invites.sql:42](../../../supabase/migrations/20261015092957_friend_invites.sql#L42)).

Verdict: merge-ready
