const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class SqliteAdapter {
  constructor(options = {}) {
    const dataDir = options.dataDir || path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, options.filename || 'pushwing.db');
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS apps (
          app_key TEXT PRIMARY KEY,
          app_name TEXT NOT NULL,
          secret_key TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
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

      this.db.run(`
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

      this.db.run(`
        CREATE TABLE IF NOT EXISTS user_roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Seed default app
      this.db.get('SELECT COUNT(*) as count FROM apps', (err, row) => {
        if (!err && row && row.count === 0) {
          const defaultAppKey = 'demo-app-key-2026';
          const defaultSecret = 'demo-secret-key-2026';
          this.db.run(
            'INSERT INTO apps (app_key, app_name, secret_key) VALUES (?, ?, ?)',
            [defaultAppKey, 'Pushwing Demo App', defaultSecret]
          );
        }
      });
    });
  }

  getApp(appKey) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM apps WHERE app_key = ?', [appKey], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  createApp(appKey, appName, secretKey) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO apps (app_key, app_name, secret_key) VALUES (?, ?, ?)',
        [appKey, appName, secretKey],
        (err) => {
          if (err) reject(err);
          else resolve({ app_key: appKey, app_name: appName, secret_key: secretKey });
        }
      );
    });
  }

  listApps() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT app_key, app_name, created_at FROM apps ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  deleteApp(appKey) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM apps WHERE app_key = ?', [appKey], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  }

  upsertSubscription({ app_key, user_id, endpoint, p256dh, auth, user_agent }) {
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
      this.db.run(query, [app_key, user_id, endpoint, p256dh, auth, user_agent], function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID || this.changes });
      });
    });
  }

  getSubscriptions(appKey, userId = null) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM subscriptions WHERE app_key = ?';
      const params = [appKey];
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  deleteSubscriptionByEndpoint(endpoint) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM subscriptions WHERE endpoint = ?', [endpoint], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  }

  deleteSubscriptionById(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM subscriptions WHERE id = ?', [id], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  }

  getStats() {
    return new Promise((resolve, reject) => {
      const stats = {};
      this.db.get('SELECT COUNT(*) as count FROM apps', [], (err, row) => {
        if (err) return reject(err);
        stats.totalApps = row ? row.count : 0;
        this.db.get('SELECT COUNT(*) as count FROM subscriptions', [], (err, row) => {
          if (err) return reject(err);
          stats.totalSubscriptions = row ? row.count : 0;
          this.db.get('SELECT COUNT(*) as count, SUM(success_count) as totalSent FROM push_logs', [], (err, row) => {
            if (err) return reject(err);
            stats.totalLogs = row ? row.count : 0;
            stats.totalSent = (row && row.totalSent) || 0;
            resolve(stats);
          });
        });
      });
    });
  }

  createPushLog({ app_key, title, body, url, success_count, fail_count }) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO push_logs (app_key, title, body, url, success_count, fail_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      this.db.run(query, [app_key, title, body, url, success_count, fail_count], function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  getPushLogs(appKey = null) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM push_logs';
      const params = [];
      if (appKey) {
        query += ' WHERE app_key = ?';
        params.push(appKey);
      }
      query += ' ORDER BY sent_at DESC LIMIT 50';
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  isAdmin(userId, email) {
    return new Promise((resolve) => {
      const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (email && adminEmails.includes(email.toLowerCase())) {
        return resolve(true);
      }
      if (!email && !userId) return resolve(false);

      this.db.get(
        'SELECT role FROM user_roles WHERE email = ? OR user_id = ?',
        [email || '', userId || ''],
        (err, row) => {
          if (!err && row && row.role === 'admin') {
            resolve(true);
          } else {
            // Default first user or if no admin configured at all
            resolve(adminEmails.length === 0 && !email);
          }
        }
      );
    });
  }

  grantAdminRole(email, userId = null) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO user_roles (email, user_id, role)
        VALUES (?, ?, 'admin')
        ON CONFLICT(email) DO UPDATE SET role = 'admin', user_id = coalesce(excluded.user_id, user_roles.user_id)
      `;
      this.db.run(query, [email, userId], function (err) {
        if (err) reject(err);
        else resolve({ success: true, email });
      });
    });
  }

  listUserRoles() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT email, user_id, role, created_at FROM user_roles ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

module.exports = SqliteAdapter;
