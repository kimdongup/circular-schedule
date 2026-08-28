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

// 1. Push Event Listener (Background Notification Arrival)
self.addEventListener('push', (event) => {
  console.log('[Pushwing SW] Push event received.');

  let data = {
    title: 'Pushwing Notification',
    body: 'New update received.',
    icon: '/client/icon-192.png',
    badge: '/client/icon-192.png',
    url: '/client/index.html'
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data.title = payload.title || data.title;
      data.body = payload.body || data.body;
      data.icon = payload.icon || data.icon;
      data.badge = payload.badge || data.badge;
      data.url = payload.url || data.url;
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
    data: {
      url: data.url,
      extraData: data.extraData
    },
    actions: [
      { action: 'open', title: '열기 🚀' },
      { action: 'close', title: '닫기 ✕' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
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
