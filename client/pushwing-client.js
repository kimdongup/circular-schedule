/**
 * Pushwing Web Push Client SDK (client/pushwing-client.js)
 * Lightweight JavaScript SDK for integrating Pushwing Web Push & PWA notifications.
 */
(function (global) {
  'use strict';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  class PushwingClient {
    constructor(options = {}) {
      this.serverUrl = options.serverUrl || window.location.origin;
      this.appKey = options.appKey || 'demo-app-key-2026';
      this.swPath = options.swPath || '/client/sw.js';
      this.vapidPublicKey = null;
      this.swRegistration = null;
    }

    /**
     * Check if Web Push and Service Worker are supported by current browser
     */
    isSupported() {
      return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
    }

    /**
     * Fetch VAPID Public Key from Pushwing Server
     */
    async getVapidPublicKey() {
      if (this.vapidPublicKey) return this.vapidPublicKey;
      const res = await fetch(`${this.serverUrl}/api/v1/vapid-key`);
      const data = await res.json();
      if (!data.success || !data.vapidPublicKey) {
        throw new Error('Failed to retrieve VAPID Public Key from server');
      }
      this.vapidPublicKey = data.vapidPublicKey;
      return this.vapidPublicKey;
    }

    /**
     * Register Service Worker
     */
    async registerServiceWorker() {
      if (!this.isSupported()) {
        throw new Error('Web Push is not supported in this browser');
      }
      this.swRegistration = await navigator.serviceWorker.register(this.swPath, { scope: '/client/' });
      await navigator.serviceWorker.ready;
      return this.swRegistration;
    }

    /**
     * Request Notification Permission & Subscribe to Web Push
     * @param {string} userId User ID or Device Identifier
     * @returns {Promise<Object>} Subscription object
     */
    async subscribe(userId = 'user-' + Math.random().toString(36).substring(2, 8)) {
      const reg = await this.registerServiceWorker();

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission was denied by user');
      }

      const publicKey = await this.getVapidPublicKey();
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);

      // Always clear stale or key-mismatched subscription to guarantee fresh VAPID sync
      let existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        try {
          await existingSub.unsubscribe();
        } catch (e) {
          console.warn('[PushwingClient] Unsubscribe stale before resubscribe:', e);
        }
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // Save subscription on Pushwing server
      const response = await fetch(`${this.serverUrl}/api/v1/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_key: this.appKey,
          user_id: userId,
          subscription: subscription.toJSON()
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Server error while saving subscription');
      }

      return {
        subscription: subscription.toJSON(),
        userId: userId,
        appKey: this.appKey
      };
    }

    /**
     * Unsubscribe from Push Notifications
     */
    async unsubscribe() {
      if (!this.swRegistration) {
        this.swRegistration = await navigator.serviceWorker.getRegistration(this.swPath);
      }

      if (!this.swRegistration) return false;

      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        // Notify Pushwing server to remove subscription
        await fetch(`${this.serverUrl}/api/v1/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint })
        });

        return true;
      }

      return false;
    }

    /**
     * Get current subscription status
     */
    async getSubscriptionStatus() {
      if (!this.isSupported()) return { supported: false, subscribed: false };

      const permission = Notification.permission;
      const reg = await navigator.serviceWorker.getRegistration(this.swPath);
      const subscription = reg ? await reg.pushManager.getSubscription() : null;

      return {
        supported: true,
        permission: permission,
        subscribed: !!subscription,
        subscription: subscription ? subscription.toJSON() : null
      };
    }
  }

  global.PushwingClient = PushwingClient;
})(typeof window !== 'undefined' ? window : this);
