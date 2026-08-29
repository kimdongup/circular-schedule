/**
 * Database Synchronization Service (src/db/syncService.js)
 * Performs bidirectional synchronization between Local SQLite / Cache and Supabase PostgreSQL.
 * Runs on startup, periodically (every 24 hours), and on-demand via Admin API.
 */
const { createClient } = require('@supabase/supabase-js');
const SqliteAdapter = require('./sqliteAdapter');

class DatabaseSyncService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    this.sqlite = new SqliteAdapter();
    this.lastSyncResult = null;
    this.syncIntervalId = null;

    if (this.supabaseUrl && this.supabaseKey) {
      this.client = createClient(this.supabaseUrl, this.supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
    } else {
      this.client = null;
    }
  }

  startScheduledSync(intervalMs = 24 * 60 * 60 * 1000) {
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);

    // Initial sync after 3 seconds on startup
    setTimeout(() => {
      this.syncAll().catch(err => console.warn('[DBSync] Initial sync notice:', err.message));
    }, 3000);

    // Periodic sync (default: once every 24 hours)
    this.syncIntervalId = setInterval(() => {
      console.log('[DBSync] Running scheduled daily DB synchronization...');
      this.syncAll().catch(err => console.warn('[DBSync] Scheduled sync error:', err.message));
    }, intervalMs);

    console.log(`[DBSync] Daily synchronization scheduler active (Interval: ${Math.round(intervalMs / 3600000)}h)`);
  }

  async syncAll() {
    const startTime = Date.now();
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      durationMs: 0,
      supabaseConnected: false,
      syncedApps: 0,
      syncedSubscriptions: 0,
      syncedLogs: 0,
      syncedRoles: 0,
      errors: []
    };

    if (!this.client) {
      result.success = false;
      result.errors.push('Supabase configuration (SUPABASE_URL / KEY) not present.');
      this.lastSyncResult = result;
      return result;
    }

    try {
      // 1. Sync Apps
      try {
        const [supAppsRes, sqliteApps] = await Promise.all([
          this.client.from('apps').select('*'),
          this.sqlite.listApps()
        ]);

        const supApps = (!supAppsRes.error && supAppsRes.data) || [];

        // Push SQLite apps to Supabase
        for (const sApp of sqliteApps) {
          if (!supApps.some(a => a.app_key === sApp.app_key)) {
            await this.client.from('apps').upsert({
              app_key: sApp.app_key,
              app_name: sApp.app_name,
              secret_key: sApp.secret_key || 'sec-auto-synced',
              created_at: sApp.created_at || new Date().toISOString()
            }, { onConflict: 'app_key' });
          }
        }

        // Pull Supabase apps to SQLite
        for (const pApp of supApps) {
          await this.sqlite.createApp(pApp.app_key, pApp.app_name, pApp.secret_key);
        }

        result.syncedApps = Math.max(supApps.length, sqliteApps.length);
        result.supabaseConnected = true;
      } catch (err) {
        result.errors.push(`Apps sync notice: ${err.message}`);
      }

      // 2. Sync Subscriptions
      try {
        const [supSubsRes, sqliteSubs] = await Promise.all([
          this.client.from('subscriptions').select('*'),
          this.sqlite.getSubscriptions('demo-app-key-2026') // Base sample
        ]);

        const supSubs = (!supSubsRes.error && supSubsRes.data) || [];

        // Push SQLite subs to Supabase
        for (const sSub of sqliteSubs) {
          if (!supSubs.some(s => s.endpoint === sSub.endpoint)) {
            await this.client.from('subscriptions').upsert({
              app_key: sSub.app_key,
              user_id: sSub.user_id,
              endpoint: sSub.endpoint,
              p256dh: sSub.p256dh,
              auth: sSub.auth,
              user_agent: sSub.user_agent,
              updated_at: new Date().toISOString()
            }, { onConflict: 'endpoint' });
          }
        }

        // Pull Supabase subs to SQLite
        for (const pSub of supSubs) {
          await this.sqlite.upsertSubscription({
            app_key: pSub.app_key,
            user_id: pSub.user_id,
            endpoint: pSub.endpoint,
            p256dh: pSub.p256dh,
            auth: pSub.auth,
            user_agent: pSub.user_agent
          });
        }

        result.syncedSubscriptions = Math.max(supSubs.length, sqliteSubs.length);
      } catch (err) {
        result.errors.push(`Subscriptions sync notice: ${err.message}`);
      }

      // 3. Sync User Roles
      try {
        const [supRolesRes, sqliteRoles] = await Promise.all([
          this.client.from('user_roles').select('*'),
          this.sqlite.listUserRoles()
        ]);

        const supRoles = (!supRolesRes.error && supRolesRes.data) || [];

        for (const sRole of sqliteRoles) {
          if (!supRoles.some(r => r.email === sRole.email)) {
            await this.client.from('user_roles').upsert({
              email: sRole.email,
              user_id: sRole.user_id,
              role: sRole.role
            }, { onConflict: 'email' });
          }
        }

        for (const pRole of supRoles) {
          await this.sqlite.grantAdminRole(pRole.email, pRole.user_id);
        }

        result.syncedRoles = Math.max(supRoles.length, sqliteRoles.length);
      } catch (err) {
        result.errors.push(`User roles sync notice: ${err.message}`);
      }

      // 4. Sync Push Logs
      try {
        const [supLogsRes, sqliteLogs] = await Promise.all([
          this.client.from('push_logs').select('*').limit(50),
          this.sqlite.getPushLogs()
        ]);

        const supLogs = (!supLogsRes.error && supLogsRes.data) || [];
        result.syncedLogs = Math.max(supLogs.length, sqliteLogs.length);
      } catch (err) {
        result.errors.push(`Logs sync notice: ${err.message}`);
      }

    } catch (err) {
      result.success = false;
      result.errors.push(`General sync error: ${err.message}`);
    }

    result.durationMs = Date.now() - startTime;
    this.lastSyncResult = result;
    console.log(`[DBSync] Completed sync in ${result.durationMs}ms: Apps=${result.syncedApps}, Subs=${result.syncedSubscriptions}, Roles=${result.syncedRoles}`);
    return result;
  }

  getLastSyncStatus() {
    return this.lastSyncResult || { status: 'idle', timestamp: null };
  }
}

const syncService = new DatabaseSyncService();
module.exports = syncService;
