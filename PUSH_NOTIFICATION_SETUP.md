# 푸시 알림 설정 가이드

## 개요

이 프로젝트는 두 가지 알림 시스템을 지원합니다:

1. **브라우저 푸시 알림** (Web Push API) - 탭이 닫혀있어도 알림 수신 가능
2. **인앱 알림** (Socket.io 기반) - 현재 탭이 열려있을 때만 표시

## 백엔드 설정

### 1. web-push 라이브러리 설치

```bash
cd server
pnpm add web-push
```

### 2. VAPID 키 생성

```bash
# 방법 1: CLI 사용
npx web-push generate-vapid-keys

# 방법 2: Node.js 스크립트 사용
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

출력 예시:

```
Public Key: BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE
Private Key: I0_d0vnesxbBSUmlDdOKibGo6vEXRO-Vu88QlSlm5j0
```

### 3. 환경 변수 설정

백엔드 `.env` 파일에 다음 변수 추가:

```env
# VAPID 키 (필수)
VAPID_PUBLIC_KEY=BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE
VAPID_PRIVATE_KEY=I0_d0vnesxbBSUmlDdOKibGo6vEXRO-Vu88QlSlm5j0

# VAPID Subject (선택, 기본값: mailto:admin@dongchat.com)
VAPID_SUBJECT=mailto:your-email@example.com
```

### 4. 데이터베이스 마이그레이션

`PushSubscription` 엔티티가 자동으로 생성됩니다 (`synchronize: true`인 경우).

## 프론트엔드 설정

### 1. 환경 변수 설정

프론트엔드 `.env.local` 파일에 다음 변수 추가:

```env
# VAPID 공개 키 (백엔드와 동일한 값)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE
```

### 2. Service Worker 파일 확인

`client/public/service-worker.js` 파일이 존재하는지 확인하세요. (이미 생성됨)

### 3. 푸시 알림 버튼 추가 (선택사항)

원하는 위치에 `PushNotificationButton` 컴포넌트를 추가하세요:

```tsx
import { PushNotificationButton } from "@/components/push-notification-button";

// 사용 예시
<PushNotificationButton />;
```

## 사용 방법

### 사용자 측

1. **푸시 알림 활성화**

   - 푸시 알림 버튼 클릭
   - 브라우저 권한 요청 승인
   - 알림 활성화 완료

2. **인앱 알림**
   - 자동으로 활성화됨
   - 현재 열려있는 채팅방이 아닌 경우에만 표시

### 개발자 측

#### 백엔드에서 푸시 알림 전송

```typescript
// PushService 사용 예시
await pushService.sendNotification(userId, {
  title: "새 메시지",
  body: "안녕하세요!",
  icon: "/icon.png",
  badge: "/badge.png",
  data: {
    roomId: 123,
    url: "/chat/123",
  },
});
```

#### 여러 사용자에게 전송

```typescript
await pushService.sendNotificationToUsers([userId1, userId2], {
  title: "그룹 알림",
  body: "새로운 그룹 메시지가 있습니다.",
});
```

## 동작 방식

### 브라우저 푸시 알림 플로우

1. 사용자가 푸시 알림 활성화 버튼 클릭
2. 브라우저 권한 요청
3. Service Worker 등록
4. 푸시 구독 생성
5. 구독 정보를 서버에 전송 (`POST /push/subscribe`)
6. 서버에 구독 정보 저장
7. 채팅 메시지 수신 시 서버에서 푸시 알림 전송
8. 브라우저가 알림 표시

### 인앱 알림 플로우

1. Socket.io로 메시지 수신
2. 현재 열려있는 채팅방 확인
3. 다른 채팅방이거나 탭이 숨겨진 경우 토스트 알림 표시
4. 알림 클릭 시 해당 채팅방으로 이동

## 문제 해결

### 푸시 알림이 작동하지 않는 경우

1. **VAPID 키 확인**

   - 백엔드와 프론트엔드의 VAPID 공개 키가 일치하는지 확인
   - 환경 변수가 올바르게 설정되었는지 확인

2. **브라우저 권한 확인**

   - 브라우저 설정에서 알림 권한이 허용되었는지 확인
   - HTTPS 연결 필수 (localhost는 예외)

3. **Service Worker 확인**

   - 개발자 도구 > Application > Service Workers에서 등록 상태 확인
   - Service Worker 파일이 올바른 위치에 있는지 확인 (`/public/service-worker.js`)

4. **서버 로그 확인**
   - 푸시 알림 전송 시 에러 로그 확인
   - 구독 정보가 올바르게 저장되었는지 확인

### 인앱 알림이 작동하지 않는 경우

1. **Socket.io 연결 확인**

   - 개발자 도구 > Network > WS에서 WebSocket 연결 확인
   - ChatProvider가 올바르게 설정되었는지 확인

2. **경로 확인**
   - `useInAppNotification` 훅이 채팅 레이아웃에 포함되었는지 확인

## 보안 고려사항

1. **VAPID Private Key 보안**

   - 절대 클라이언트에 노출하지 마세요
   - 환경 변수로 관리하고 Git에 커밋하지 마세요

2. **구독 정보 보안**
   - 푸시 구독은 인증된 사용자만 가능하도록 JWT 가드 사용
   - 사용자별로 자신의 구독만 관리할 수 있도록 제한

## 브라우저 지원

- ✅ Chrome/Edge (Windows, macOS, Android)
- ✅ Firefox (Windows, macOS, Android)
- ✅ Safari (macOS 16+, iOS 16+)
- ❌ Internet Explorer (지원 안 함)

## 참고 자료

- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [web-push 라이브러리 문서](https://github.com/web-push-libs/web-push)
- [MDN: Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
