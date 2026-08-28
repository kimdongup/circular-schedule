const { createClient } = require('@supabase/supabase-js');

class SupabaseAdapter {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL;
    this.supabaseKey = options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

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
    try {
      // Check if demo app exists, if not create it
      const { data } = await this.client.from('apps').select('app_key').eq('app_key', 'demo-app-key-2026').maybeSingle();
      if (!data) {
        await this.client.from('apps').insert({
          app_key: 'demo-app-key-2026',
          app_name: 'Pushwing Demo App',
          secret_key: 'demo-secret-key-2026'
        });
      }
    } catch (e) {
      console.warn('[SupabaseAdapter] Init check:', e.message);
    }
  }

  async getApp(appKey) {
    const { data, error } = await this.client
      .from('apps')
      .select('*')
      .eq('app_key', appKey)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async createApp(appKey, appName, secretKey) {
    const { data, error } = await this.client
      .from('apps')
      .insert({
        app_key: appKey,
        app_name: appName,
        secret_key: secretKey
      })
      .select()
      .single();

    if (error) throw error;
    return data || { app_key: appKey, app_name: appName, secret_key: secretKey };
  }

  async listApps() {
    const { data, error } = await this.client
      .from('apps')
      .select('app_key, app_name, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async deleteApp(appKey) {
    const { error } = await this.client
      .from('apps')
      .delete()
      .eq('app_key', appKey);

    if (error) throw error;
    return { deletedCount: 1 };
  }

  async upsertSubscription({ app_key, user_id, endpoint, p256dh, auth, user_agent }) {
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

    if (error) throw error;
    return { id: data ? data.id : 1 };
  }

  async getSubscriptions(appKey, userId = null) {
    let query = this.client
      .from('subscriptions')
      .select('*')
      .eq('app_key', appKey);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async deleteSubscriptionByEndpoint(endpoint) {
    const { error } = await this.client
      .from('subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) throw error;
    return { deletedCount: 1 };
  }

  async deleteSubscriptionById(id) {
    const { error } = await this.client
      .from('subscriptions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { deletedCount: 1 };
  }

  async getStats() {
    const [appsRes, subsRes, logsRes] = await Promise.all([
      this.client.from('apps').select('*', { count: 'exact', head: true }),
      this.client.from('subscriptions').select('*', { count: 'exact', head: true }),
      this.client.from('push_logs').select('success_count')
    ]);

    const totalApps = appsRes.count || 0;
    const totalSubscriptions = subsRes.count || 0;
    const logs = logsRes.data || [];
    const totalLogs = logs.length;
    const totalSent = logs.reduce((sum, row) => sum + (row.success_count || 0), 0);

    return {
      totalApps,
      totalSubscriptions,
      totalLogs,
      totalSent
    };
  }

  async createPushLog({ app_key, title, body, url, success_count, fail_count }) {
    const { data, error } = await this.client
      .from('push_logs')
      .insert({
        app_key,
        title,
        body,
        url,
        success_count,
        fail_count
      })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return { id: data ? data.id : 1 };
  }

  async getPushLogs(appKey = null) {
    let query = this.client
      .from('push_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(50);

    if (appKey) {
      query = query.eq('app_key', appKey);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async isAdmin(userId, email) {
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (email && adminEmails.includes(email.toLowerCase())) {
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
    } catch (e) {
      console.warn('[SupabaseAdapter] isAdmin check error:', e.message);
    }

    return false;
  }

  async grantAdminRole(email, userId = null) {
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

    if (error) throw error;
    return data;
  }

  async listUserRoles() {
    const { data, error } = await this.client
      .from('user_roles')
      .select('email, user_id, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

module.exports = SupabaseAdapter;
