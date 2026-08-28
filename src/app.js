const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const vapid = require('./vapid');
const { sendNotificationToSubscriptions } = require('./pushService');

const app = express();

app.use(cors());
app.use(express.json());

// Serve Client PWA files and Admin Console files
app.use('/client', express.static(path.join(__dirname, '../client')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/server-admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// Admin Stats API
app.get('/api/v1/admin/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({
      success: true,
      stats: {
        ...stats,
        vapidPublicKey: vapid.publicKey,
        vapidSubject: vapid.subject,
        uptimeSeconds: Math.floor(process.uptime())
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete App
app.delete('/api/v1/apps/:app_key', async (req, res) => {
  try {
    const { app_key } = req.params;
    const result = await db.deleteApp(app_key);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Subscription by ID
app.delete('/api/v1/subscriptions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.deleteSubscriptionById(id);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Get VAPID Public Key
app.get('/api/v1/vapid-key', (req, res) => {
  res.json({
    success: true,
    vapidPublicKey: vapid.publicKey
  });
});

// 2. List Apps
app.get('/api/v1/apps', async (req, res) => {
  try {
    const apps = await db.listApps();
    res.json({ success: true, apps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Create App
app.post('/api/v1/apps', async (req, res) => {
  try {
    const { app_name, app_key, secret_key } = req.body;
    if (!app_name) {
      return res.status(400).json({ success: false, error: 'app_name is required' });
    }
    const finalAppKey = app_key || `app-${Date.now()}`;
    const finalSecretKey = secret_key || `sec-${Math.random().toString(36).substring(2, 10)}`;

    const newApp = await db.createApp(finalAppKey, app_name, finalSecretKey);
    res.json({ success: true, app: newApp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Register / Update Subscription
app.post('/api/v1/subscribe', async (req, res) => {
  try {
    const { app_key, user_id, subscription } = req.body;
    if (!app_key || !subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: 'app_key and valid subscription object (endpoint, keys: {p256dh, auth}) are required'
      });
    }

    const app = await db.getApp(app_key);
    if (!app) {
      return res.status(404).json({ success: false, error: `App key '${app_key}' not found` });
    }

    const userAgent = req.headers['user-agent'] || '';
    const userId = user_id || 'anonymous';

    await db.upsertSubscription({
      app_key,
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent
    });

    res.json({
      success: true,
      message: 'Subscription saved successfully',
      app_key,
      user_id: userId
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Unsubscribe
app.post('/api/v1/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'endpoint is required' });
    }
    const result = await db.deleteSubscriptionByEndpoint(endpoint);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Push Dispatch Endpoint
app.post('/api/v1/push', async (req, res) => {
  try {
    const { app_key, secret_key, user_id, title, body, url, icon, badge, extraData } = req.body;

    if (!app_key || !title || !body) {
      return res.status(400).json({
        success: false,
        error: 'app_key, title, and body are required fields'
      });
    }

    const app = await db.getApp(app_key);
    if (!app) {
      return res.status(404).json({ success: false, error: `App key '${app_key}' not found` });
    }

    // Optional secret key check for secure API usage
    if (secret_key && app.secret_key !== secret_key) {
      return res.status(401).json({ success: false, error: 'Invalid secret_key for this app' });
    }

    const subscriptions = await db.getSubscriptions(app_key, user_id || null);
    if (!subscriptions || subscriptions.length === 0) {
      return res.json({
        success: true,
        message: 'No active subscriptions found for target',
        deliveredCount: 0
      });
    }

    const result = await sendNotificationToSubscriptions(subscriptions, {
      title,
      body,
      url,
      icon,
      badge,
      extraData
    });

    await db.createPushLog({
      app_key,
      title,
      body,
      url,
      success_count: result.successCount,
      fail_count: result.failCount
    });

    res.json({
      success: true,
      deliveredCount: result.successCount,
      failCount: result.failCount,
      prunedCount: result.prunedCount,
      totalTargeted: subscriptions.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Subscriptions List
app.get('/api/v1/subscriptions', async (req, res) => {
  try {
    const { app_key, user_id } = req.query;
    if (!app_key) {
      return res.status(400).json({ success: false, error: 'app_key query parameter is required' });
    }
    const subscriptions = await db.getSubscriptions(app_key, user_id || null);
    res.json({ success: true, count: subscriptions.length, subscriptions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Get Push Logs
app.get('/api/v1/logs', async (req, res) => {
  try {
    const { app_key } = req.query;
    const logs = await db.getPushLogs(app_key || null);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
