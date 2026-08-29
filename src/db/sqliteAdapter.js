const path = require('path');
const fs = require('fs');

let sqlite3 = null;
try {
  sqlite3 = require('sqlite3').verbose();
} catch (err) {
  console.warn('[SqliteAdapter] Native sqlite3 module failed to load (falling back to JSON/Memory store):', err.message);
}

class SqliteAdapter {
  constructor(options = {}) {
    const dataDir = options.dataDir || path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dataDir = dataDir;
    this.jsonStorePath = path.join(dataDir, 'pushwing_store.json');

    // In-memory fallback store
    this.memoryStore = {
      apps: [{ app_key: 'demo-app-key-2026', app_name: 'Pushwing Demo App', secret_key: 'demo-secret-key-2026', created_at: new Date().toISOString() }],
      subscriptions: [],
      push_logs: [],
      user_roles: [{ id: 1, email: 'kimdongup@gmail.com', role: 'admin', created_at: new Date().toISOString() }]
    };
    this.loadJsonStore();

    if (sqlite3) {
      try {
        const dbPath = path.join(dataDir, options.filename || 'pushwing.db');
        this.db = new sqlite3.Database(dbPath);
        this.initSqlite();
      } catch (err) {
        console.warn('[SqliteAdapter] Error opening SQLite database file:', err.message);
        this.db = null;
      }
    } else {
      this.db = null;
    }
  }

  loadJsonStore() {
    if (fs.existsSync(this.jsonStorePath)) {
      try {
        const raw = fs.readFileSync(this.jsonStorePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.memoryStore = { ...this.memoryStore, ...parsed };
      } catch (e) {}
    }
  }

  saveJsonStore() {
    try {
      fs.writeFileSync(this.jsonStorePath, JSON.stringify(this.memoryStore, null, 2));
    } catch (e) {}
  }

  initSqlite() {
    if (!this.db) return;
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

      this.db.run(`
        INSERT OR IGNORE INTO apps (app_key, app_name, secret_key)
        VALUES ('demo-app-key-2026', 'Pushwing Demo App', 'demo-secret-key-2026')
      `);

      this.db.run(`
        INSERT OR IGNORE INTO user_roles (email, role)
        VALUES ('kimdongup@gmail.com', 'admin')
      `);
    });
  }

  getApp(appKey) {
    if (!this.db) {
      const app = this.memoryStore.apps.find(a => a.app_key === appKey);
      return Promise.resolve(app || null);
    }
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM apps WHERE app_key = ?', [appKey], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  createApp(appKey, appName, secretKey) {
    if (!this.db) {
      const existingIdx = this.memoryStore.apps.findIndex(a => a.app_key === appKey);
      const appObj = { app_key: appKey, app_name: appName, secret_key: secretKey, created_at: new Date().toISOString() };
      if (existingIdx >= 0) {
        this.memoryStore.apps[existingIdx] = appObj;
      } else {
        this.memoryStore.apps.push(appObj);
      }
      this.saveJsonStore();
      return Promise.resolve(appObj);
    }
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO apps (app_key, app_name, secret_key)
        VALUES (?, ?, ?)
        ON CONFLICT(app_key) DO UPDATE SET app_name = excluded.app_name, secret_key = excluded.secret_key
      `;
      this.db.run(query, [appKey, appName, secretKey], function (err) {
        if (err) reject(err);
        else resolve({ app_key: appKey, app_name: appName, secret_key: secretKey });
      });
    });
  }

  listApps() {
    if (!this.db) {
      return Promise.resolve(this.memoryStore.apps || []);
    }
    return new Promise((resolve, reject) => {
      this.db.all('SELECT app_key, app_name, created_at FROM apps ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  deleteApp(appKey) {
    if (!this.db) {
      this.memoryStore.apps = this.memoryStore.apps.filter(a => a.app_key !== appKey);
      this.memoryStore.subscriptions = this.memoryStore.subscriptions.filter(s => s.app_key !== appKey);
      this.saveJsonStore();
      return Promise.resolve({ deletedCount: 1 });
    }
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM apps WHERE app_key = ?', [appKey], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  }

  upsertSubscription({ app_key, user_id, endpoint, p256dh, auth, user_agent }) {
    if (!this.db) {
      const existingIdx = this.memoryStore.subscriptions.findIndex(s => s.endpoint === endpoint);
      const subObj = {
        id: existingIdx >= 0 ? this.memoryStore.subscriptions[existingIdx].id : Date.now(),
        app_key,
        user_id,
        endpoint,
        p256dh,
        auth,
        user_agent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        this.memoryStore.subscriptions[existingIdx] = subObj;
      } else {
        this.memoryStore.subscriptions.push(subObj);
      }
      this.saveJsonStore();
      return Promise.resolve({ id: subObj.id });
    }
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO subscriptions (app_key, user_id, endpoint, p256dh, auth, user_agent)
        VALUES (?, ?, ?, ?, ?, ?)
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
        else resolve({ id: this.lastID });
      });
    });
  }

  getSubscriptions(appKey, userId = null) {
    if (!this.db) {
      let subs = this.memoryStore.subscriptions.filter(s => s.app_key === appKey);
      if (userId) {
        subs = subs.filter(s => s.user_id === userId);
      }
      return Promise.resolve(subs);
    }
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
    if (!this.db) {
      const before = this.memoryStore.subscriptions.length;
      this.memoryStore.subscriptions = this.memoryStore.subscriptions.filter(s => s.endpoint !== endpoint);
      this.saveJsonStore();
      return Promise.resolve({ deletedCount: before - this.memoryStore.subscriptions.length });
    }
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM subscriptions WHERE endpoint = ?', [endpoint], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  }

  deleteSubscriptionById(id) {
    if (!this.db) {
      const before = this.memoryStore.subscriptions.length;
      this.memoryStore.subscriptions = this.memoryStore.subscriptions.filter(s => String(s.id) !== String(id));
      this.saveJsonStore();
      return Promise.resolve({ deletedCount: before - this.memoryStore.subscriptions.length });
    }
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM subscriptions WHERE id = ?', [id], function (err) {
        if (err) reject(err);
        else resolve({ deletedCount: this.changes });
      });
    });
  }

  getStats() {
    if (!this.db) {
      const totalApps = this.memoryStore.apps.length;
      const totalSubscriptions = this.memoryStore.subscriptions.length;
      const totalLogs = this.memoryStore.push_logs.length;
      const totalSent = this.memoryStore.push_logs.reduce((sum, r) => sum + (r.success_count || 0), 0);
      return Promise.resolve({
        totalApps,
        totalSubscriptions,
        totalLogs,
        totalSent,
        dbType: 'In-Memory / JSON Store',
        dbConnected: true,
        isSupabaseReady: false
      });
    }
    return new Promise((resolve, reject) => {
      const stats = {
        dbType: 'Local SQLite (pushwing.db)',
        dbConnected: true,
        isSupabaseReady: false
      };
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
    if (!this.db) {
      const logObj = {
        id: Date.now(),
        app_key,
        title,
        body,
        url,
        success_count: success_count || 0,
        fail_count: fail_count || 0,
        sent_at: new Date().toISOString()
      };
      this.memoryStore.push_logs.unshift(logObj);
      this.saveJsonStore();
      return Promise.resolve({ id: logObj.id });
    }
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
    if (!this.db) {
      let logs = this.memoryStore.push_logs;
      if (appKey) logs = logs.filter(l => l.app_key === appKey);
      return Promise.resolve(logs.slice(0, 50));
    }
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
    const defaultAdmins = ['kimdongup@gmail.com'];
    const envAdmins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const allAdmins = [...defaultAdmins, ...envAdmins];

    if (email && allAdmins.includes(email.toLowerCase())) {
      return Promise.resolve(true);
    }
    if (!email && !userId) return Promise.resolve(false);

    if (!this.db) {
      const match = this.memoryStore.user_roles.find(
        u => (email && u.email === email) || (userId && u.user_id === userId)
      );
      return Promise.resolve(Boolean(match && match.role === 'admin'));
    }

    return new Promise((resolve) => {
      this.db.get(
        'SELECT role FROM user_roles WHERE email = ? OR user_id = ?',
        [email || '', userId || ''],
        (err, row) => {
          if (!err && row && row.role === 'admin') {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      );
    });
  }

  grantAdminRole(email, userId = null) {
    if (!this.db) {
      const existing = this.memoryStore.user_roles.find(u => u.email === email);
      if (existing) {
        existing.role = 'admin';
        if (userId) existing.user_id = userId;
      } else {
        this.memoryStore.user_roles.push({
          id: Date.now(),
          email,
          user_id: userId,
          role: 'admin',
          created_at: new Date().toISOString()
        });
      }
      this.saveJsonStore();
      return Promise.resolve({ success: true, email });
    }
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
    if (!this.db) {
      return Promise.resolve(this.memoryStore.user_roles || []);
    }
    return new Promise((resolve, reject) => {
      this.db.all('SELECT email, user_id, role, created_at FROM user_roles ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

module.exports = SqliteAdapter;
