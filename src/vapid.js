const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const vapidKeysPath = path.join(__dirname, '../data/vapid_keys.json');

function initVapidKeys() {
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@pushwing.org';

  if (!publicKey || !privateKey) {
    if (fs.existsSync(vapidKeysPath)) {
      try {
        const raw = fs.readFileSync(vapidKeysPath, 'utf8');
        const keys = JSON.parse(raw);
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
      } catch (err) {
        console.error('[VAPID] Error reading vapid_keys.json:', err.message);
      }
    }
  }

  if (!publicKey || !privateKey) {
    console.log('[VAPID] No VAPID keys found. Generating new key pair...');
    const vapidKeys = webpush.generateVAPIDKeys();
    publicKey = vapidKeys.publicKey;
    privateKey = vapidKeys.privateKey;

    const dataDir = path.dirname(vapidKeysPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(vapidKeysPath, JSON.stringify({ publicKey, privateKey }, null, 2));
    console.log('[VAPID] Generated and saved new VAPID keys to data/vapid_keys.json');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, privateKey, subject };
}

const keys = initVapidKeys();

module.exports = {
  publicKey: keys.publicKey,
  // Note: privateKey is kept internal to web-push setup and NOT exported for client endpoints
  subject: keys.subject
};
