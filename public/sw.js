/**
 * Circular Schedule PWA Service Worker.
 * Push messages are displayed through the operating system notification UI
 * and mirrored into any currently open app window.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const notification = {
    title: '⏰ 시간표 알림',
    body: '새로운 일정 알림이 도착했습니다.',
    icon: '/icons/notification-icon.png',
    badge: '/icons/notification-badge.png',
    url: '/',
    tag: 'circular-schedule-alert',
    extraData: {}
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notification.title = payload.title || notification.title;
      notification.body = payload.body || notification.body;
      notification.icon = payload.icon || notification.icon;
      notification.badge = payload.badge || notification.badge;
      notification.url = payload.url || notification.url;
      notification.tag = payload.tag || notification.tag;
      notification.extraData = payload.extraData || {};
    } catch (_error) {
      notification.body = event.data.text();
    }
  }

  const showSystemNotification = self.registration.showNotification(notification.title, {
    body: notification.body,
    icon: notification.icon,
    badge: notification.badge,
    vibrate: [200, 100, 200],
    tag: notification.tag,
    renotify: true,
    requireInteraction: true,
    data: {
      url: notification.url,
      extraData: notification.extraData
    },
    actions: [
      { action: 'open', title: '열기' },
      { action: 'close', title: '닫기' }
    ]
  });

  const notifyOpenWindows = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) => Promise.all(windowClients.map((client) => client.postMessage({
      type: 'WEB_PUSH_RECEIVED',
      notification: {
        title: notification.title,
        body: notification.body,
        url: notification.url,
        tag: notification.tag,
        extraData: notification.extraData
      }
    }))));

  event.waitUntil(Promise.all([showSystemNotification, notifyOpenWindows]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const relativeUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );
});
