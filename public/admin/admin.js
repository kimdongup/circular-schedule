document.addEventListener('DOMContentLoaded', async () => {
  let supabase = null;
  let currentSession = null;

  // UI Elements - Auth Gate
  const adminAuthGate = document.getElementById('admin-auth-gate');
  const adminDashboard = document.getElementById('admin-dashboard');
  const adminUserInfo = document.getElementById('admin-user-info');
  const btnAdminLogout = document.getElementById('btn-admin-logout');
  const adminAuthEmail = document.getElementById('admin-auth-email');
  const adminAuthPass = document.getElementById('admin-auth-pass');
  const btnDoAdminLogin = document.getElementById('btn-do-admin-login');

  // UI Elements - Dashboard
  const statApps = document.getElementById('stat-apps');
  const statSubs = document.getElementById('stat-subs');
  const statSent = document.getElementById('stat-sent');
  const statUptime = document.getElementById('stat-uptime');
  const statDbType = document.getElementById('stat-db-type');

  const adminAppName = document.getElementById('admin-app-name');
  const adminAppKey = document.getElementById('admin-app-key');
  const btnAdminCreateApp = document.getElementById('btn-admin-create-app');
  const adminAppsTbody = document.getElementById('admin-apps-tbody');

  const adminTargetApp = document.getElementById('admin-target-app');
  const adminTargetUser = document.getElementById('admin-target-user');
  const adminPushTitle = document.getElementById('admin-push-title');
  const adminPushBody = document.getElementById('admin-push-body');
  const adminPushUrl = document.getElementById('admin-push-url');
  const btnAdminSendPush = document.getElementById('btn-admin-send-push');

  const filterSubApp = document.getElementById('filter-sub-app');
  const btnRefreshSubs = document.getElementById('btn-refresh-subs');
  const adminSubsTbody = document.getElementById('admin-subs-tbody');
  const adminLogsTbody = document.getElementById('admin-logs-tbody');

  const inputGrantEmail = document.getElementById('input-grant-email');
  const btnGrantAdmin = document.getElementById('btn-grant-admin');
  const adminRolesTbody = document.getElementById('admin-roles-tbody');

  // 1. Helper: Authorized Fetch Wrapper
  async function fetchWithAuth(url, options = {}) {
    const headers = options.headers || {};
    if (currentSession && currentSession.access_token) {
      headers['Authorization'] = `Bearer ${currentSession.access_token}`;
    }
    return fetch(url, { ...options, headers });
  }

  // 2. Initialize Supabase & Check Admin Status
  async function initAuth() {
    try {
      const configRes = await fetch('/api/config');
      const { supabaseUrl, supabaseAnonKey } = await configRes.json();

      if (supabaseUrl && supabaseAnonKey) {
        // Dynamically load Supabase SDK if not loaded
        if (!window.supabase) {
          const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
          window.supabase = mod;
        }
        supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await verifyAndSetSession(session);
        } else {
          showAuthGate(true);
        }

        supabase.auth.onAuthStateChange(async (event, session) => {
          if (session) {
            await verifyAndSetSession(session);
          } else {
            currentSession = null;
            showAuthGate(true);
          }
        });
      } else {
        showAuthGate(true, null, 'Supabase 연결 정보가 없습니다. Vercel 환경 변수를 확인해 주세요.');
      }
    } catch (err) {
      console.error('Init Auth error:', err);
      showAuthGate(true);
    }
  }

  async function verifyAndSetSession(session) {
    currentSession = session;
    try {
      const res = await fetchWithAuth('/api/v1/auth/check-admin');
      const data = await res.json();
      if (data.success && data.isAdmin) {
        showAuthGate(false, session.user.email);
        await loadAllDashboardData();
      } else {
        showAuthGate(true, null, '⚠️ 이 계정은 관리자 권한(Admin Role)이 없습니다. 관리자 계정으로 로그인해 주세요.');
      }
    } catch (err) {
      showAuthGate(true, null, '인증 확인 중 오류가 발생했습니다: ' + err.message);
    }
  }

  function showAuthGate(show, email = null, alertMsg = null) {
    if (show) {
      adminAuthGate.style.display = 'block';
      adminDashboard.style.display = 'none';
      btnAdminLogout.style.display = 'none';
      adminUserInfo.textContent = '🔒 로그인 필요';
      if (alertMsg) alert(alertMsg);
    } else {
      adminAuthGate.style.display = 'none';
      adminDashboard.style.display = 'block';
      btnAdminLogout.style.display = 'inline-block';
      adminUserInfo.textContent = `👤 관리자: ${email || 'Admin'}`;
    }
  }

  // 3. Login Button Event
  btnDoAdminLogin.addEventListener('click', async () => {
    const email = adminAuthEmail.value.trim();
    const password = adminAuthPass.value.trim();
    if (!email || !password) {
      alert('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    btnDoAdminLogin.disabled = true;
    btnDoAdminLogin.textContent = '로그인 중...';

    try {
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          alert('로그인 실패: ' + error.message);
        } else {
          await verifyAndSetSession(data.session);
        }
      } else {
        alert('Supabase 연결 정보가 없습니다.');
      }
    } catch (err) {
      alert('로그인 처리 중 오류: ' + err.message);
    } finally {
      btnDoAdminLogin.disabled = false;
      btnDoAdminLogin.textContent = '🔑 관리자로 로그인';
    }
  });

  // Logout Button Event
  btnAdminLogout.addEventListener('click', async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    currentSession = null;
    showAuthGate(true);
  });

  // 4. Load All Dashboard Data
  async function loadAllDashboardData() {
    await Promise.all([
      loadStats(),
      loadApps(),
      loadSubscriptions(),
      loadLogs(),
      loadUserRoles()
    ]);
  }

  // 5. Fetch Stats
  async function loadStats() {
    try {
      const res = await fetchWithAuth('/api/v1/admin/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        statApps.textContent = data.stats.totalApps || 0;
        statSubs.textContent = data.stats.totalSubscriptions || 0;
        statSent.textContent = data.stats.totalSent || 0;
        statUptime.textContent = data.stats.vapidConfigured ? '🟢 VAPID 설정됨' : '🟡 VAPID 미설정';

        if (statDbType) {
          if (data.stats.isSupabaseReady) {
            statDbType.innerHTML = '<span style="color:var(--success);">🟢 Supabase DB</span>';
          } else {
            statDbType.innerHTML = '<span style="color:var(--danger);">🔴 Supabase 연결 오류</span>';
          }
        }
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }

  // 6. Fetch Apps List
  async function loadApps(selectAppKey = null) {
    try {
      const res = await fetchWithAuth('/api/v1/apps');
      const data = await res.json();
      if (data.success && data.apps) {
        const currentVal1 = selectAppKey || adminTargetApp.value;
        const currentVal2 = selectAppKey || filterSubApp.value;

        adminTargetApp.innerHTML = '';
        filterSubApp.innerHTML = '<option value="">전체 App Key</option>';

        data.apps.forEach(app => {
          const opt1 = document.createElement('option');
          opt1.value = app.app_key;
          opt1.textContent = `${app.app_name} (${app.app_key})`;
          adminTargetApp.appendChild(opt1);

          const opt2 = document.createElement('option');
          opt2.value = app.app_key;
          opt2.textContent = `${app.app_name} (${app.app_key})`;
          filterSubApp.appendChild(opt2);
        });

        if (currentVal1) adminTargetApp.value = currentVal1;
        if (currentVal2) filterSubApp.value = currentVal2;

        adminAppsTbody.innerHTML = '';
        if (data.apps.length === 0) {
          adminAppsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">등록된 앱이 없습니다.</td></tr>';
          return;
        }

        data.apps.forEach(app => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${app.app_name}</strong></td>
            <td><code>${app.app_key}</code></td>
            <td style="color: var(--text-muted); font-size: 0.8rem;">${new Date(app.created_at).toLocaleString()}</td>
            <td>
              <button class="btn btn-danger btn-sm btn-del-app" data-key="${app.app_key}">삭제</button>
            </td>
          `;
          adminAppsTbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-del-app').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const key = e.target.dataset.key;
            if (!confirm(`'${key}' 앱과 관련된 모든 구독 및 데이터를 삭제하시겠습니까?`)) return;
            const delRes = await fetchWithAuth(`/api/v1/apps/${key}`, { method: 'DELETE' });
            const delData = await delRes.json();
            if (delData.success) {
              alert('삭제되었습니다.');
              loadAllDashboardData();
            } else {
              alert('삭제 실패: ' + delData.error);
            }
          });
        });
      }
    } catch (err) {
      console.error('Error fetching apps:', err);
    }
  }

  // 7. Create App Key
  btnAdminCreateApp.addEventListener('click', async () => {
    const appName = adminAppName.value.trim();
    const appKey = adminAppKey.value.trim();

    if (!appName) {
      alert('앱 이름을 입력하세요.');
      return;
    }

    try {
      const res = await fetchWithAuth('/api/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_name: appName, app_key: appKey || null })
      });
      const data = await res.json();
      if (data.success && data.app) {
        alert(`🎉 신규 App Key 발급 완료!\n\nApp Key: ${data.app.app_key}\nSecret Key: ${data.app.secret_key}`);
        adminAppName.value = '';
        adminAppKey.value = '';
        await loadApps(data.app.app_key);
        await Promise.all([loadStats(), loadSubscriptions(), loadLogs()]);
      } else {
        alert('발급 실패: ' + data.error);
      }
    } catch (err) {
      alert('오류 발생: ' + err.message);
    }
  });

  // 8. Push Broadcaster
  btnAdminSendPush.addEventListener('click', async () => {
    const appKey = adminTargetApp.value;
    const userId = adminTargetUser.value.trim();
    const title = adminPushTitle.value.trim();
    const body = adminPushBody.value.trim();
    const url = adminPushUrl.value.trim();

    if (!appKey || !title || !body) {
      alert('타겟 앱, 제목, 메시지 본문은 필수 입력 사항입니다.');
      return;
    }

    btnAdminSendPush.disabled = true;
    btnAdminSendPush.textContent = '🚀 발송 중...';

    try {
      const res = await fetchWithAuth('/api/v1/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_key: appKey,
          user_id: userId || null,
          title,
          body,
          url: url || '/'
        })
      });

      const data = await res.json();
      if (data.success) {
        alert(`📢 푸시 발송 완료!\n\n총 대상자: ${data.totalTargeted || 0}명\n성공: ${data.deliveredCount || 0}건\n실패: ${data.failCount || 0}건\n정리된 만료 구독: ${data.prunedCount || 0}건`);
        loadStats();
        loadLogs();
        loadSubscriptions();
      } else {
        alert('발송 실패: ' + data.error);
      }
    } catch (err) {
      alert('발송 통신 오류: ' + err.message);
    } finally {
      btnAdminSendPush.disabled = false;
      btnAdminSendPush.textContent = '🚀 서버 푸시 전송 실행';
    }
  });

  // 9. Load Subscriptions
  async function loadSubscriptions() {
    const selectedApp = filterSubApp.value;
    let url = '/api/v1/subscriptions';
    if (selectedApp) {
      url += `?app_key=${encodeURIComponent(selectedApp)}`;
    } else if (adminTargetApp.value) {
      url += `?app_key=${encodeURIComponent(adminTargetApp.value)}`;
    } else {
      adminSubsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">조회할 App Key를 선택하세요.</td></tr>';
      return;
    }

    try {
      const res = await fetchWithAuth(url);
      const data = await res.json();
      adminSubsTbody.innerHTML = '';

      if (data.success && data.subscriptions && data.subscriptions.length > 0) {
        data.subscriptions.forEach(sub => {
          const tr = document.createElement('tr');
          const shortEndpoint = sub.endpoint.substring(0, 30) + '...';
          tr.innerHTML = `
            <td>${sub.id}</td>
            <td><code>${sub.app_key}</code></td>
            <td><strong>${sub.user_id}</strong></td>
            <td style="font-size:0.75rem; color: var(--text-muted);">${sub.user_agent ? sub.user_agent.substring(0, 45) + '...' : '-'}</td>
            <td><code title="${sub.endpoint}">${shortEndpoint}</code></td>
            <td style="font-size:0.8rem; color: var(--text-muted);">${new Date(sub.created_at).toLocaleString()}</td>
            <td>
              <button class="btn btn-danger btn-sm btn-del-sub" data-id="${sub.id}">해제</button>
            </td>
          `;
          adminSubsTbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-del-sub').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (!confirm(`구독 ID #${id}을 삭제하시겠습니까?`)) return;
            const delRes = await fetchWithAuth(`/api/v1/subscriptions/${id}`, { method: 'DELETE' });
            const delData = await delRes.json();
            if (delData.success) {
              loadSubscriptions();
              loadStats();
            }
          });
        });
      } else {
        adminSubsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">활성 구독자가 없습니다.</td></tr>';
      }
    } catch (err) {
      console.error('Error fetching subs:', err);
    }
  }

  filterSubApp.addEventListener('change', loadSubscriptions);
  btnRefreshSubs.addEventListener('click', loadSubscriptions);

  // 10. Load Push Logs
  async function loadLogs() {
    try {
      const res = await fetchWithAuth('/api/v1/logs');
      const data = await res.json();
      adminLogsTbody.innerHTML = '';

      if (data.success && data.logs && data.logs.length > 0) {
        data.logs.forEach(log => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>#${log.id}</td>
            <td><code>${log.app_key}</code></td>
            <td><strong>${log.title}</strong></td>
            <td style="font-size:0.8rem;">${log.body}</td>
            <td style="color:var(--success); font-weight:bold;">${log.success_count}</td>
            <td style="color:var(--danger);">${log.fail_count}</td>
            <td style="font-size:0.8rem; color: var(--text-muted);">${new Date(log.sent_at).toLocaleString()}</td>
          `;
          adminLogsTbody.appendChild(tr);
        });
      } else {
        adminLogsTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">발송 기록이 없습니다.</td></tr>';
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  }

  // 11. Load Admin Roles & Grant Admin
  async function loadUserRoles() {
    try {
      const res = await fetchWithAuth('/api/v1/admin/users');
      const data = await res.json();
      adminRolesTbody.innerHTML = '';

      if (data.success && data.users && data.users.length > 0) {
        data.users.forEach(u => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${u.email}</strong></td>
            <td style="font-size:0.8rem; color: var(--text-muted);">${u.user_id || '-'}</td>
            <td><span class="badge" style="background:#10b98120; color:var(--success); border-color:var(--success);">${u.role}</span></td>
            <td style="font-size:0.8rem; color: var(--text-muted);">${u.created_at ? new Date(u.created_at).toLocaleString() : '-'}</td>
          `;
          adminRolesTbody.appendChild(tr);
        });
      } else {
        adminRolesTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">지정된 관리자 계정이 없습니다.</td></tr>';
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  }

  btnGrantAdmin.addEventListener('click', async () => {
    const email = inputGrantEmail.value.trim();
    if (!email) {
      alert('관리자로 지정할 계정 이메일을 입력하세요.');
      return;
    }

    try {
      const res = await fetchWithAuth('/api/v1/admin/grant-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || '관리자 권한이 부여되었습니다.');
        inputGrantEmail.value = '';
        loadUserRoles();
      } else {
        alert('권한 부여 실패: ' + data.error);
      }
    } catch (err) {
      alert('권한 부여 통신 오류: ' + err.message);
    }
  });

  // Start initialization
  await initAuth();
});
