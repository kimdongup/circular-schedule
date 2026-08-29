/* ====================================================================
 * Pushwing Web Push Service Worker (client/sw.js)
 * --------------------------------------------------------------------
 * CRITICAL INVARIANT:
 * Pure Web Service Worker API only.
 * ABSOLUTELY NO DOM (window, document) references allowed in this file.
 * Handles background push event receiving and notification clicks.
 * ==================================================================== */

// Service Worker Install
self.addEventListener('install', (event) => {
  console.log('[Pushwing SW] Service Worker installing...');
  self.skipWaiting();
});

// Service Worker Activate
self.addEventListener('activate', (event) => {
  console.log('[Pushwing SW] Service Worker activated.');
  event.waitUntil(self.clients.claim());
});

const DEFAULT_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%233b82f6'/><text x='50' y='65' font-size='45' text-anchor='middle' fill='white'>⏰</text></svg>";

// 1. Push Event Listener (Background Notification Arrival)
self.addEventListener('push', (event) => {
  console.log('[Pushwing SW] Push event received.');

  let data = {
    title: '⏰ Pushwing 알림',
    body: '새로운 웹 푸시가 도착했습니다.',
    icon: DEFAULT_ICON,
    badge: DEFAULT_ICON,
    url: '/client/index.html'
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data.title = payload.title || data.title;
      data.body = payload.body || data.body;
      data.icon = payload.icon || DEFAULT_ICON;
      data.badge = payload.badge || DEFAULT_ICON;
      data.url = payload.url || '/client/index.html';
      data.extraData = payload.extraData || {};
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    tag: 'pushwing-alert-' + Date.now(),
    renotify: true,
    data: {
      url: data.url,
      extraData: data.extraData
    },
    actions: [
      { action: 'open', title: '열기 🚀' },
      { action: 'close', title: '닫기 ✕' }
    ]
  };

  const showPromise = self.registration.showNotification(data.title, notificationOptions);

  const broadcastPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_NOTIFICATION_RECEIVED',
        title: data.title,
        body: data.body,
        url: data.url
      });
    });
  });

  event.waitUntil(Promise.all([showPromise, broadcastPromise]));
});

// 2. Notification Click Listener
self.addEventListener('notificationclick', (event) => {
  console.log('[Pushwing SW] Notification clicked:', event.notification.title);
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/client/index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a tab with target URL is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
