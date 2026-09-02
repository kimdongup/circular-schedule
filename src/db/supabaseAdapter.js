const { createClient } = require('@supabase/supabase-js');

class SupabaseAdapter {
  constructor(options = {}) {
    this.supabaseUrl = (options.supabaseUrl || process.env.SUPABASE_URL || '').trim();
    this.supabaseKey = (options.supabaseKey || process.env.SUPABASE_SECRET_KEY || '').trim();
    this.client = this.supabaseUrl && this.supabaseKey.startsWith('sb_secret_')
      ? createClient(this.supabaseUrl, this.supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        })
      : null;
  }

  get isConfigured() {
    return Boolean(this.client);
  }

  requireClient() {
    if (!this.client) {
      throw new Error('Supabase server configuration is missing or invalid. Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
    }
    return this.client;
  }

  assertResult(error, operation) {
    if (!error) return;
    const details = error.message || error.code || 'Unknown Supabase error';
    throw new Error(`${operation} failed: ${details}`);
  }

  async getApp(appKey) {
    const { data, error } = await this.requireClient()
      .from('apps')
      .select('*')
      .eq('app_key', appKey)
      .maybeSingle();

    this.assertResult(error, 'Get app');
    return data;
  }

  async createApp(appKey, appName, secretKey) {
    const { data, error } = await this.requireClient()
      .from('apps')
      .upsert(
        { app_key: appKey, app_name: appName, secret_key: secretKey },
        { onConflict: 'app_key' }
      )
      .select()
      .single();

    this.assertResult(error, 'Create app');
    return data;
  }

  async listApps() {
    const { data, error } = await this.requireClient()
      .from('apps')
      .select('app_key, app_name, created_at')
      .order('created_at', { ascending: false });

    this.assertResult(error, 'List apps');
    return data || [];
  }

  async deleteApp(appKey) {
    const { data, error } = await this.requireClient()
      .from('apps')
      .delete()
      .eq('app_key', appKey)
      .select('app_key');

    this.assertResult(error, 'Delete app');
    return { deletedCount: (data || []).length };
  }

  async upsertSubscription({ app_key, user_id, endpoint, p256dh, auth, user_agent }) {
    const { data, error } = await this.requireClient()
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
      .single();

    this.assertResult(error, 'Save subscription');
    return data;
  }

  async getSubscriptions(appKey, userId = null) {
    let query = this.requireClient()
      .from('subscriptions')
      .select('*')
      .eq('app_key', appKey);

    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;
    this.assertResult(error, 'List subscriptions');
    return data || [];
  }

  async deleteSubscriptionByEndpoint(endpoint) {
    const { data, error } = await this.requireClient()
      .from('subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .select('id');

    this.assertResult(error, 'Delete subscription');
    return { deletedCount: (data || []).length };
  }

  async deleteSubscriptionById(id) {
    const { data, error } = await this.requireClient()
      .from('subscriptions')
      .delete()
      .eq('id', id)
      .select('id');

    this.assertResult(error, 'Delete subscription');
    return { deletedCount: (data || []).length };
  }

  async getStats() {
    const client = this.requireClient();
    const [appsRes, subscriptionsRes, logsRes, rolesRes] = await Promise.all([
      client.from('apps').select('*', { count: 'exact', head: true }),
      client.from('subscriptions').select('*', { count: 'exact', head: true }),
      client.from('push_logs').select('success_count', { count: 'exact' }),
      client.from('user_roles').select('*', { count: 'exact', head: true })
    ]);

    this.assertResult(appsRes.error, 'Read apps stats');
    this.assertResult(subscriptionsRes.error, 'Read subscription stats');
    this.assertResult(logsRes.error, 'Read push log stats');
    this.assertResult(rolesRes.error, 'Read user role stats');

    const logs = logsRes.data || [];
    return {
      totalApps: appsRes.count || 0,
      totalSubscriptions: subscriptionsRes.count || 0,
      totalLogs: logsRes.count || 0,
      totalSent: logs.reduce((sum, row) => sum + (row.success_count || 0), 0),
      dbType: 'Supabase PostgreSQL',
      dbConnected: true,
      isSupabaseReady: true,
      tableStatus: {
        apps: true,
        subscriptions: true,
        push_logs: true,
        user_roles: true
      },
      dbUrl: this.supabaseUrl
    };
  }

  async createPushLog({ app_key, title, body, url, success_count, fail_count }) {
    const { data, error } = await this.requireClient()
      .from('push_logs')
      .insert({ app_key, title, body, url, success_count, fail_count })
      .select('id')
      .single();

    this.assertResult(error, 'Create push log');
    return data;
  }

  async getPushLogs(appKey = null) {
    let query = this.requireClient()
      .from('push_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(50);

    if (appKey) query = query.eq('app_key', appKey);

    const { data, error } = await query;
    this.assertResult(error, 'List push logs');
    return data || [];
  }

  async isAdmin(userId, email) {
    const envAdmins = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    if (email && envAdmins.includes(email.toLowerCase())) return true;
    if (!userId && !email) return false;

    let query = this.requireClient()
      .from('user_roles')
      .select('role')
      .eq('role', 'admin');

    if (email && userId) {
      query = query.or(`email.eq.${email},user_id.eq.${userId}`);
    } else if (email) {
      query = query.eq('email', email);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.limit(1);
    this.assertResult(error, 'Check admin role');
    return Boolean(data && data.length > 0);
  }

  async grantAdminRole(email, userId = null) {
    const { data, error } = await this.requireClient()
      .from('user_roles')
      .upsert(
        { email, user_id: userId, role: 'admin' },
        { onConflict: 'email' }
      )
      .select()
      .single();

    this.assertResult(error, 'Grant admin role');
    return data;
  }

  async listUserRoles() {
    const { data, error } = await this.requireClient()
      .from('user_roles')
      .select('email, user_id, role, created_at')
      .order('created_at', { ascending: false });

    this.assertResult(error, 'List user roles');
    return data || [];
  }
}

module.exports = SupabaseAdapter;
