/**
 * Standards-based Web Push client for the Circular Schedule PWA.
 * Uses the browser Push API, Service Worker API, and application VAPID key.
 */
(function (global) {
  'use strict';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = global.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function keysMatch(subscription, expectedKey) {
    const currentKey = subscription.options && subscription.options.applicationServerKey;
    if (!currentKey) return true;

    const currentBytes = new Uint8Array(currentKey);
    if (currentBytes.length !== expectedKey.length) return false;
    return currentBytes.every((byte, index) => byte === expectedKey[index]);
  }

  class WebPushClient {
    constructor(options = {}) {
      this.serverUrl = options.serverUrl || global.location.origin;
      this.appKey = options.appKey || '';
      this.swPath = options.swPath || '/sw.js';
      this.scope = options.scope || '/';
      this.accessTokenProvider = options.accessTokenProvider || null;
      this.vapidPublicKey = null;
      this.swRegistration = null;
    }

    isSupported() {
      return 'serviceWorker' in navigator && 'PushManager' in global && 'Notification' in global;
    }

    async getVapidPublicKey() {
      if (this.vapidPublicKey) return this.vapidPublicKey;

      const response = await fetch(`${this.serverUrl}/api/v1/vapid-key`);
      const data = await response.json();
      if (!response.ok || !data.success || !data.vapidPublicKey) {
        throw new Error(data.error || 'VAPID 공개키를 가져오지 못했습니다.');
      }

      this.vapidPublicKey = data.vapidPublicKey;
      return this.vapidPublicKey;
    }

    async registerServiceWorker() {
      if (!('serviceWorker' in navigator)) {
        throw new Error('이 브라우저는 Service Worker를 지원하지 않습니다.');
      }

      this.swRegistration = await navigator.serviceWorker.register(this.swPath, { scope: this.scope });
      await navigator.serviceWorker.ready;
      return this.swRegistration;
    }

    async requestPermission() {
      if (!('Notification' in global)) {
        throw new Error('이 브라우저는 시스템 알림을 지원하지 않습니다.');
      }

      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;

      if (permission !== 'granted') {
        throw new Error('기기 알림 권한이 허용되지 않았습니다.');
      }
      return permission;
    }

    async getAuthHeaders() {
      if (!this.accessTokenProvider) {
        throw new Error('푸시 알림을 설정하려면 로그인해 주세요.');
      }

      const accessToken = await this.accessTokenProvider();
      if (!accessToken) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      }

      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      };
    }

    async subscribe() {
      if (!this.isSupported()) {
        throw new Error('이 브라우저는 Web Push를 지원하지 않습니다.');
      }

      const registration = await this.registerServiceWorker();
      await this.requestPermission();

      const publicKey = await this.getVapidPublicKey();
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      let createdSubscription = false;

      if (subscription && !keysMatch(subscription, applicationServerKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        createdSubscription = true;
      }

      const response = await fetch(`${this.serverUrl}/api/v1/subscribe`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
        body: JSON.stringify({
          app_key: this.appKey,
          subscription: subscription.toJSON()
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        if (createdSubscription) {
          await subscription.unsubscribe().catch(() => false);
        }
        throw new Error(result.error || '푸시 구독을 서버에 저장하지 못했습니다.');
      }

      return {
        subscription: subscription.toJSON(),
        appKey: this.appKey
      };
    }

    async unsubscribe() {
      const registration = this.swRegistration
        || await navigator.serviceWorker.getRegistration(this.scope);
      if (!registration) return false;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return false;

      const authHeaders = await this.getAuthHeaders();
      const endpoint = subscription.endpoint;
      const removed = await subscription.unsubscribe();
      if (!removed) return false;

      const response = await fetch(`${this.serverUrl}/api/v1/unsubscribe`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ endpoint })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || '브라우저 구독은 해제했지만 서버 정리에 실패했습니다.');
      }
      return true;
    }

    async getSubscriptionStatus() {
      if (!this.isSupported()) return { supported: false, subscribed: false };

      const registration = await navigator.serviceWorker.getRegistration(this.scope);
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;
      let serverRegistered = false;

      if (subscription && this.appKey) {
        try {
          const response = await fetch(`${this.serverUrl}/api/v1/subscription-status`, {
            method: 'POST',
            headers: await this.getAuthHeaders(),
            body: JSON.stringify({
              app_key: this.appKey,
              endpoint: subscription.endpoint
            })
          });
          const result = await response.json();
          serverRegistered = Boolean(response.ok && result.success && result.registered);
        } catch (_error) {
          serverRegistered = false;
        }
      }

      return {
        supported: true,
        permission: Notification.permission,
        subscribed: Boolean(subscription),
        serverRegistered,
        subscription: subscription ? subscription.toJSON() : null
      };
    }

    async showSystemNotification(title, options = {}) {
      if (!this.isSupported()) {
        throw new Error('이 브라우저는 시스템 Web Push 알림을 지원하지 않습니다.');
      }

      const registration = await this.registerServiceWorker();
      await this.requestPermission();
      await registration.showNotification(title, {
        body: options.body || '',
        icon: options.icon || '/icons/notification-icon.png',
        badge: options.badge || '/icons/notification-badge.png',
        tag: options.tag || 'circular-schedule-system-test',
        data: { url: options.url || '/' },
        requireInteraction: Boolean(options.requireInteraction)
      });
    }
  }

  global.WebPushClient = WebPushClient;
})(typeof window !== 'undefined' ? window : this);
