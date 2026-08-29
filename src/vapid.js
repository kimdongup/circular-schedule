const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const vapidKeysPath = path.join(__dirname, '../data/vapid_keys.json');

const DEFAULT_PUBLIC_KEY = 'BOdvdN24aV4d7J8gXkZ-ZdlEa89ns5ZL5XfM1C1eDKJw0sfqAfQzruBoL7vwfNJK81fBUwqNr49H97vyLmE3-rE';
const DEFAULT_PRIVATE_KEY = 'Aq6yCMI1BVJuU_p4N0hyz2Y3xm9CojY2rgNcH5TxeGU';

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
    publicKey = DEFAULT_PUBLIC_KEY;
    privateKey = DEFAULT_PRIVATE_KEY;

    const dataDir = path.dirname(vapidKeysPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    try {
      fs.writeFileSync(vapidKeysPath, JSON.stringify({ publicKey, privateKey }, null, 2));
    } catch (e) {}
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
