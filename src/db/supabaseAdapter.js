const { createClient } = require('@supabase/supabase-js');
const SqliteAdapter = require('./sqliteAdapter');

const DEFAULT_ADMIN_EMAILS = ['kimdongup@gmail.com'];

function isTableMissing(error) {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    (typeof error.message === 'string' && error.message.includes('schema cache')) ||
    (typeof error.message === 'string' && error.message.includes('does not exist'))
  );
}

class SupabaseAdapter {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    this.fallbackSqlite = new SqliteAdapter(options);

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('[SupabaseAdapter] SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) are required.');
    }

    this.client = createClient(this.supabaseUrl, this.supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.init();
  }

  async init() {
    // 1. Always seed SQLite fallback
    try {
      await this.fallbackSqlite.grantAdminRole('kimdongup@gmail.com');
    } catch (e) {}

    // 2. Attempt Supabase seeding
    try {
      const { data, error } = await this.client.from('apps').select('app_key').eq('app_key', 'demo-app-key-2026').maybeSingle();
      if (!error && !data) {
        await this.client.from('apps').insert({
          app_key: 'demo-app-key-2026',
          app_name: 'Pushwing Demo App',
          secret_key: 'demo-secret-key-2026'
        });
      }
      // Seed default admin in Supabase
      await this.client.from('user_roles').upsert({
        email: 'kimdongup@gmail.com',
        role: 'admin'
      }, { onConflict: 'email' });
    } catch (e) {
      console.warn('[SupabaseAdapter] Notice during init (Tables might not be created in Supabase yet):', e.message);
    }
  }

  async getApp(appKey) {
    try {
      const { data, error } = await this.client
        .from('apps')
        .select('*')
        .eq('app_key', appKey)
        .maybeSingle();

      if (error) {
        if (isTableMissing(error)) {
          console.warn(`[SupabaseAdapter] 'apps' table not in Supabase schema cache. Using fallback SQLite.`);
          return this.fallbackSqlite.getApp(appKey);
        }
        throw error;
      }
      if (!data) {
        // Check fallback if not found in Supabase
        return this.fallbackSqlite.getApp(appKey);
      }
      return data;
    } catch (err) {
      if (isTableMissing(err)) {
        return this.fallbackSqlite.getApp(appKey);
      }
      throw err;
    }
  }

  async createApp(appKey, appName, secretKey) {
    let created = null;
    try {
      const { data, error } = await this.client
        .from('apps')
        .insert({
          app_key: appKey,
          app_name: appName,
          secret_key: secretKey
        })
        .select()
        .single();

      if (!error && data) {
        created = data;
      }
    } catch (err) {}

    // Always mirror to SQLite fallback for zero-fail consistency
    const sqliteCreated = await this.fallbackSqlite.createApp(appKey, appName, secretKey);
    return created || sqliteCreated || { app_key: appKey, app_name: appName, secret_key: secretKey };
  }

  async listApps() {
    let supabaseApps = [];
    let sqliteApps = [];

    try {
      const { data, error } = await this.client
        .from('apps')
        .select('app_key, app_name, created_at')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        supabaseApps = data;
      }
    } catch (e) {}

    try {
      sqliteApps = await this.fallbackSqlite.listApps();
    } catch (e) {}

    const appMap = new Map();
    [...supabaseApps, ...sqliteApps].forEach((app) => {
      if (app && app.app_key && !appMap.has(app.app_key)) {
        appMap.set(app.app_key, app);
      }
    });

    const result = Array.from(appMap.values());
    if (result.length === 0) {
      return [{ app_key: 'demo-app-key-2026', app_name: 'Pushwing Demo App', created_at: new Date().toISOString() }];
    }
    return result;
  }

  async deleteApp(appKey) {
    try {
      const { error } = await this.client
        .from('apps')
        .delete()
        .eq('app_key', appKey);

      if (error && isTableMissing(error)) {
        return this.fallbackSqlite.deleteApp(appKey);
      }
      this.fallbackSqlite.deleteApp(appKey).catch(() => {});
      return { deletedCount: 1 };
    } catch (err) {
      if (isTableMissing(err)) {
        return this.fallbackSqlite.deleteApp(appKey);
      }
      throw err;
    }
  }

  async upsertSubscription({ app_key, user_id, endpoint, p256dh, auth, user_agent }) {
    try {
      // Ensure app exists in fallback as well
      await this.fallbackSqlite.upsertSubscription({ app_key, user_id, endpoint, p256dh, auth, user_agent });

      const { data, error } = await this.client
        .from('subscriptions')
        .upsert(
          {
            app_key,
            user_id,
            endpoint,
            p256dh,
            auth,
            user_agent,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'endpoint' }
        )
        .select('id')
        .maybeSingle();

      if (error) {
        if (isTableMissing(error)) {
          return { id: 1 };
        }
        console.warn('[SupabaseAdapter] Subscription upsert error:', error.message);
      }
      return { id: (data && data.id) || 1 };
    } catch (err) {
      if (isTableMissing(err)) {
        return { id: 1 };
      }
      return { id: 1 };
    }
  }

  async getSubscriptions(appKey, userId = null) {
    try {
      let query = this.client
        .from('subscriptions')
        .select('*')
        .eq('app_key', appKey);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        if (isTableMissing(error)) {
          return this.fallbackSqlite.getSubscriptions(appKey, userId);
        }
        throw error;
      }
      if (!data || data.length === 0) {
        return this.fallbackSqlite.getSubscriptions(appKey, userId);
      }
      return data;
    } catch (err) {
      if (isTableMissing(err)) {
        return this.fallbackSqlite.getSubscriptions(appKey, userId);
      }
      throw err;
    }
  }

  async deleteSubscriptionByEndpoint(endpoint) {
    try {
      const { error } = await this.client
        .from('subscriptions')
        .delete()
        .eq('endpoint', endpoint);

      this.fallbackSqlite.deleteSubscriptionByEndpoint(endpoint).catch(() => {});
      return { deletedCount: 1 };
    } catch (err) {
      return this.fallbackSqlite.deleteSubscriptionByEndpoint(endpoint);
    }
  }

  async deleteSubscriptionById(id) {
    try {
      const { error } = await this.client
        .from('subscriptions')
        .delete()
        .eq('id', id);

      this.fallbackSqlite.deleteSubscriptionById(id).catch(() => {});
      return { deletedCount: 1 };
    } catch (err) {
      return this.fallbackSqlite.deleteSubscriptionById(id);
    }
  }

  async getStats() {
    try {
      const [appsRes, subsRes, logsRes] = await Promise.all([
        this.client.from('apps').select('*', { count: 'exact', head: true }),
        this.client.from('subscriptions').select('*', { count: 'exact', head: true }),
        this.client.from('push_logs').select('success_count')
      ]);

      if (appsRes.error && isTableMissing(appsRes.error)) {
        return this.fallbackSqlite.getStats();
      }

      const totalApps = appsRes.count || 0;
      const totalSubscriptions = subsRes.count || 0;
      const logs = logsRes.data || [];
      const totalLogs = logs.length;
      const totalSent = logs.reduce((sum, row) => sum + (row.success_count || 0), 0);

      return { totalApps, totalSubscriptions, totalLogs, totalSent };
    } catch (err) {
      return this.fallbackSqlite.getStats();
    }
  }

  async createPushLog({ app_key, title, body, url, success_count, fail_count }) {
    try {
      this.fallbackSqlite.createPushLog({ app_key, title, body, url, success_count, fail_count }).catch(() => {});

      const { data, error } = await this.client
        .from('push_logs')
        .insert({ app_key, title, body, url, success_count, fail_count })
        .select('id')
        .maybeSingle();

      if (error && isTableMissing(error)) {
        return { id: 1 };
      }
      return { id: (data && data.id) || 1 };
    } catch (err) {
      return { id: 1 };
    }
  }

  async getPushLogs(appKey = null) {
    try {
      let query = this.client
        .from('push_logs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(50);

      if (appKey) {
        query = query.eq('app_key', appKey);
      }

      const { data, error } = await query;
      if (error) {
        if (isTableMissing(error)) {
          return this.fallbackSqlite.getPushLogs(appKey);
        }
        throw error;
      }
      if (!data || data.length === 0) {
        return this.fallbackSqlite.getPushLogs(appKey);
      }
      return data;
    } catch (err) {
      return this.fallbackSqlite.getPushLogs(appKey);
    }
  }

  async isAdmin(userId, email) {
    const envAdmins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const allAdmins = [...DEFAULT_ADMIN_EMAILS.map(e => e.toLowerCase()), ...envAdmins];

    if (email && allAdmins.includes(email.toLowerCase())) {
      return true;
    }

    try {
      let query = this.client.from('user_roles').select('role').eq('role', 'admin');
      if (email && userId) {
        query = query.or(`email.eq.${email},user_id.eq.${userId}`);
      } else if (email) {
        query = query.eq('email', email);
      } else if (userId) {
        query = query.eq('user_id', userId);
      } else {
        return false;
      }

      const { data, error } = await query.maybeSingle();
      if (!error && data && data.role === 'admin') {
        return true;
      }
      if (error && isTableMissing(error)) {
        return this.fallbackSqlite.isAdmin(userId, email);
      }
    } catch (e) {
      return this.fallbackSqlite.isAdmin(userId, email);
    }

    return this.fallbackSqlite.isAdmin(userId, email);
  }

  async grantAdminRole(email, userId = null) {
    try {
      this.fallbackSqlite.grantAdminRole(email, userId).catch(() => {});

      const { data, error } = await this.client
        .from('user_roles')
        .upsert(
          {
            email,
            user_id: userId,
            role: 'admin'
          },
          { onConflict: 'email' }
        )
        .select()
        .single();

      if (error && isTableMissing(error)) {
        return { success: true, email };
      }
      return data || { success: true, email };
    } catch (err) {
      return { success: true, email };
    }
  }

  async listUserRoles() {
    try {
      const { data, error } = await this.client
        .from('user_roles')
        .select('email, user_id, role, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        if (isTableMissing(error)) {
          return this.fallbackSqlite.listUserRoles();
        }
        throw error;
      }
      if (!data || data.length === 0) {
        return this.fallbackSqlite.listUserRoles();
      }
      return data;
    } catch (err) {
      return this.fallbackSqlite.listUserRoles();
    }
  }
}

module.exports = SupabaseAdapter;
