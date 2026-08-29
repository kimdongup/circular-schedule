const express = require('express');
const cors = require('cors');
const path = require('path');
const { customAlphabet } = require('nanoid');
require('dotenv').config();

const db = require('./src/db');
const vapid = require('./src/vapid');
const { sendNotificationToSubscriptions } = require('./src/pushService');

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ==========================================
// 정적 파일 서빙 (Static File Serving)
// ==========================================
// 1. Pushwing 클라이언트 PWA (/client)
app.use('/client', express.static(path.join(__dirname, 'client')));

// 2. Pushwing 서버 관리자 콘솔 (/admin)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 3. 원형 시간표 웹 앱 (/ 및 /public)
app.use(express.static(path.join(__dirname, 'public')));

// Pushwing 관리자 콘솔 페이지
app.get('/server-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// ==========================================
// 🛡️ 관리자 롤 (Admin Role) 인증 및 검증 로직
// ==========================================
const { createClient } = require('@supabase/supabase-js');

async function verifyAdminUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.query.token || req.headers['x-access-token']);

  if (!token) {
    return { isAdmin: false, error: '로그인 토큰이 제공되지 않았습니다.' };
  }

  if (process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    try {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      const supabaseAuth = createClient(process.env.SUPABASE_URL, key, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
      if (error || !user) {
        return { isAdmin: false, error: '유효하지 않거나 만료된 로그인 세션입니다.' };
      }

      const isAdmin = await db.isAdmin(user.id, user.email);
      return { isAdmin, user };
    } catch (err) {
      return { isAdmin: false, error: err.message };
    }
  }

  return { isAdmin: true, user: { email: 'local-admin' } };
}

async function requireAdminAuth(req, res, next) {
  // 1. 머신-투-머신 REST API 시크릿 키 검증 통과 허용
  if (req.body && req.body.secret_key && req.body.app_key) {
    try {
      const app = await db.getApp(req.body.app_key);
      if (app && app.secret_key === req.body.secret_key) {
        return next();
      }
    } catch (e) {}
  }

  // 2. 관리자 사용자 세션 토큰 검증
  const { isAdmin, user, error } = await verifyAdminUser(req);
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: error || '접근이 거부되었습니다: 관리자(Admin) 권한이 필요합니다.'
    });
  }

  req.adminUser = user;
  next();
}

// 0. 관리자 권한 확인 API (클라이언트 UI에서 관리자 버튼 표시 여부 판단)
app.get('/api/v1/auth/check-admin', async (req, res) => {
  const { isAdmin, user, error } = await verifyAdminUser(req);
  res.json({
    success: true,
    isAdmin: Boolean(isAdmin),
    user: user ? { id: user.id, email: user.email } : null,
    error: isAdmin ? null : (error || '관리자 권한이 없습니다.')
  });
});

// 관리자 롤 부여 API (기존 관리자만 타인에게 부여 가능)
app.post('/api/v1/admin/grant-role', requireAdminAuth, async (req, res) => {
  try {
    const { email, user_id } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'email is required' });
    }
    const result = await db.grantAdminRole(email, user_id);
    res.json({ success: true, message: `${email} 님에게 관리자 롤을 부여했습니다.`, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 🔔 Pushwing Web Push (PWA) REST API v1
// ==========================================

// 1. VAPID 공개키 조회 (공개)
app.get('/api/v1/vapid-key', (req, res) => {
  res.json({
    success: true,
    vapidPublicKey: vapid.publicKey
  });
});

// 2. 관리자 통계 조회 (관리자 전용)
app.get('/api/v1/admin/stats', requireAdminAuth, async (req, res) => {
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

// 2-1. DB 연결 진단 API (관리자 전용)
app.get('/api/v1/admin/db-health', requireAdminAuth, async (req, res) => {
  try {
    const stats = await db.getStats();
    const apps = await db.listApps();
    res.json({
      success: true,
      status: 'healthy',
      dbType: stats.dbType,
      dbConnected: stats.dbConnected,
      isSupabaseReady: stats.isSupabaseReady,
      tableStatus: stats.tableStatus,
      totalApps: apps.length,
      supabaseUrl: stats.dbUrl || null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. 앱(테넌트) 목록 조회
app.get('/api/v1/apps', async (req, res) => {
  try {
    const apps = await db.listApps();
    res.json({ success: true, apps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. 신규 앱(테넌트) 생성 (관리자 전용)
app.post('/api/v1/apps', requireAdminAuth, async (req, res) => {
  try {
    const { app_name, app_key, secret_key } = req.body;
    if (!app_name) {
      return res.status(400).json({ success: false, error: 'app_name is required' });
    }
    const cleanKey = (app_key || app_name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    const finalAppKey = cleanKey || `app-${Date.now()}`;
    const finalSecretKey = secret_key || `sec-${Math.random().toString(36).substring(2, 10)}`;

    const newApp = await db.createApp(finalAppKey, app_name, finalSecretKey);
    res.json({ success: true, app: newApp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. 앱 삭제 (관리자 전용)
app.delete('/api/v1/apps/:app_key', requireAdminAuth, async (req, res) => {
  try {
    const { app_key } = req.params;
    const result = await db.deleteApp(app_key);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. 웹 푸시 구독(Subscription) 등록 / 갱신
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

// 7. 구독 해제
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

// 8. 푸시 알림 발송 (Push Dispatcher)
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

    // If secret_key not provided, verify admin session
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
      url: url || '/',
      icon: icon || '/favicon.ico',
      badge: badge || '/favicon.ico',
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

// 9. 구독자 목록 조회 (관리자 전용)
app.get('/api/v1/subscriptions', requireAdminAuth, async (req, res) => {
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

// 10. 특정 구독 삭제 (관리자 전용)
app.delete('/api/v1/subscriptions/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.deleteSubscriptionById(id);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. 푸시 발송 로그 조회 (관리자 전용)
app.get('/api/v1/logs', requireAdminAuth, async (req, res) => {
  try {
    const { app_key } = req.query;
    const logs = await db.getPushLogs(app_key || null);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. 관리자 유저 목록 조회 (관리자 전용)
app.get('/api/v1/admin/users', requireAdminAuth, async (req, res) => {
  try {
    const users = await db.listUserRoles();
    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 📅 원형 시간표 웹 앱 API & 라우트
// ==========================================

// 헬스 체크
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Supabase 환경 변수 제공
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

// 시간표 고유 ID 발급
app.get('/api/generate-id', (req, res) => {
  res.json({ id: nanoid() });
});

// 공유 링크 라우트
app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SPA Fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/client/') || req.path.startsWith('/admin/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 서버 시작
// ==========================================
app.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`🚀 Combined Render Service running on http://${HOST}:${PORT}`);
  console.log(`📅 Circular Schedule: http://${HOST}:${PORT}`);
  console.log(`🔔 Pushwing Server Admin: http://${HOST}:${PORT}/server-admin`);
  console.log(`📱 Pushwing PWA Client: http://${HOST}:${PORT}/client/index.html`);
  console.log(`🔑 VAPID Public Key: ${vapid.publicKey}`);
  console.log('====================================================');
});