const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pushwing.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Apps / Tenants Table
  db.run(`
    CREATE TABLE IF NOT EXISTS apps (
      app_key TEXT PRIMARY KEY,
      app_name TEXT NOT NULL,
      secret_key TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Subscriptions Table
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (app_key) REFERENCES apps (app_key) ON DELETE CASCADE
    )
  `);

  // Push Dispatch Logs Table
  db.run(`
    CREATE TABLE IF NOT EXISTS push_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      url TEXT,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create default app key if none exists
  db.get('SELECT COUNT(*) as count FROM apps', (err, row) => {
    if (!err && row.count === 0) {
      const defaultAppKey = 'demo-app-key-2026';
      const defaultSecret = 'demo-secret-key-2026';
      db.run(
        'INSERT INTO apps (app_key, app_name, secret_key) VALUES (?, ?, ?)',
        [defaultAppKey, 'Pushwing Demo App', defaultSecret],
        () => {
          console.log(`[DB] Created default app key: ${defaultAppKey}`);
        }
      );
    }
  });
});

module.exports = {
  db,

  // App Helper Functions
  getApp: (appKey) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM apps WHERE app_key = ?', [appKey], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  createApp: (appKey, appName, secretKey) => {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO apps (app_key, app_name, secret_key) VALUES (?, ?, ?)',
        [appKey, appName, secretKey],
        function (err) {
          if (err) reject(err);
          else resolve({ app_key: appKey, app_name: appName, secret_key: secretKey });
        }
      );
    });
  },

  listApps: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT app_key, app_name, created_at FROM apps ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Subscription Helper Functions
  upsertSubscription: ({ app_key, user_id, endpoint, p256dh, auth, user_agent }) => {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO subscriptions (app_key, user_id, endpoint, p256dh, auth, user_agent, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(endpoint) DO UPDATE SET
          app_key = excluded.app_key,
          user_id = excluded.user_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          user_agent = excluded.user_agent,
          updated_at = CURRENT_TIMESTAMP
      `;
      db.run(query, [app_key, user_id, endpoint, p256dh, auth, user_agent], function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID || this.changes });
      });
    });
  },

  getSubscriptions: (appKey, userId = null) => {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM subscriptions WHERE app_key = ?';
      const params = [appKey];
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  deleteSubscriptionByEndpoint: (endpoint) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM subscriptions WHERE endpoint = ?', [endpoint], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  },

  deleteApp: (appKey) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM apps WHERE app_key = ?', [appKey], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  },

  deleteSubscriptionById: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM subscriptions WHERE id = ?', [id], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  },

  getStats: () => {
    return new Promise((resolve, reject) => {
      const stats = {};
      db.get('SELECT COUNT(*) as count FROM apps', [], (err, row) => {
        if (err) return reject(err);
        stats.totalApps = row.count;
        db.get('SELECT COUNT(*) as count FROM subscriptions', [], (err, row) => {
          if (err) return reject(err);
          stats.totalSubscriptions = row.count;
          db.get('SELECT COUNT(*) as count, SUM(success_count) as totalSent FROM push_logs', [], (err, row) => {
            if (err) return reject(err);
            stats.totalLogs = row.count;
            stats.totalSent = row.totalSent || 0;
            resolve(stats);
          });
        });
      });
    });
  },

  // Push Log Helpers
  createPushLog: ({ app_key, title, body, url, success_count, fail_count }) => {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO push_logs (app_key, title, body, url, success_count, fail_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.run(query, [app_key, title, body, url, success_count, fail_count], function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  },

  getPushLogs: (appKey = null) => {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM push_logs';
      const params = [];
      if (appKey) {
        query += ' WHERE app_key = ?';
        params.push(appKey);
      }
      query += ' ORDER BY sent_at DESC LIMIT 50';
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

