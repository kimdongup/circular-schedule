const webpush = require('web-push');
const db = require('./db');
require('./vapid'); // Ensures VAPID details are initialized

/**
 * Dispatches web push notification to a list of subscriptions
 * @param {Array} subscriptions Array of DB subscription rows
 * @param {Object} payload Payload object { title, body, icon, url, extraData }
 * @returns {Promise<{successCount: number, failCount: number, prunedCount: number}>}
 */
async function sendNotificationToSubscriptions(subscriptions, payload) {
  let successCount = 0;
  let failCount = 0;
  let prunedCount = 0;
  let lastError = null;

  const payloadString = JSON.stringify({
    title: payload.title || 'Pushwing Notification',
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    url: payload.url || '/',
    extraData: payload.extraData || {}
  });

  const sendPromises = subscriptions.map(async (sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };

    try {
      await webpush.sendNotification(pushSubscription, payloadString);
      successCount++;
    } catch (err) {
      failCount++;
      const statusCode = err.statusCode || err.status;
      lastError = `HTTP ${statusCode}: ${err.body || err.message}`;
      // 404 Not Found or 410 Gone indicates subscription has expired or unsubscribed
      if (statusCode === 404 || statusCode === 410) {
        console.log(`[PushService] Pruning expired subscription (HTTP ${statusCode}): ${sub.endpoint}`);
        await db.deleteSubscriptionByEndpoint(sub.endpoint);
        prunedCount++;
      } else {
        console.error(`[PushService] Failed to send push to ${sub.endpoint} (HTTP ${statusCode}):`, err.body || err.message);
      }
    }
  });

  await Promise.all(sendPromises);
  return { successCount, failCount, prunedCount, lastError };
}

module.exports = {
  sendNotificationToSubscriptions
};
