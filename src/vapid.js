const webpush = require('web-push');
require('dotenv').config();

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const isConfigured = Boolean(publicKey && privateKey);

if (isConfigured) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn('[VAPID] Push notifications are disabled until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are configured.');
}

module.exports = {
  publicKey,
  subject,
  isConfigured
};
