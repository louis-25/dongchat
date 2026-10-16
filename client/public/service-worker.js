// Service Worker for Push Notifications
const CACHE_NAME = 'dongchat-v1';

// Install event - 캐시 초기화
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

// Activate event - 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim();
});

// Push event - 푸시 알림 수신
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);

  let notificationData = {
    title: '새 메시지',
    body: '알 수 없는 메시지',
    icon: '/icons/icon-192.png',
    data: {},
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: data.badge,
        data: data.data || notificationData.data,
      };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    requireInteraction: false,
    tag: `chat-${notificationData.data.roomId || 'default'}`,
    renotify: true, // 같은 방 알림이 남아 있어도 새 메시지마다 다시 울린다(없으면 조용히 내용만 바뀜)
    vibrate: [200, 100, 200],
  };

  // 같은 tag 알림을 '교체'하면 안드로이드가 팝업(헤드업)을 생략할 수 있다 → 기존 것을 닫고 새로 올린다.
  event.waitUntil(
    self.registration
      .getNotifications({ tag: notificationOptions.tag })
      .then((old) => old.forEach((n) => n.close()))
      .then(() => self.registration.showNotification(notificationData.title, notificationOptions))
  );
});

// Notification click event - 알림 클릭 시 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/chat/rooms';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열린 앱 창이 있으면 그 창을 알림의 방으로 이동시키고 포커스(이동이 막히면 포커스만), 없으면 새 창
      const target = new URL(url, self.location.origin).href;
      const client = clientList.find((c) => c.url === target) || clientList[0];
      if (!client) return clients.openWindow ? clients.openWindow(target) : undefined;
      const go = client.url === target ? Promise.resolve(client) : client.navigate(target).catch(() => client);
      return go.then((c) => (c || client).focus());
    })
  );
});

// Message event - 클라이언트와 통신
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

