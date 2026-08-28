document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statApps = document.getElementById('stat-apps');
  const statSubs = document.getElementById('stat-subs');
  const statSent = document.getElementById('stat-sent');
  const statUptime = document.getElementById('stat-uptime');

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

  // 1. Fetch Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/v1/admin/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        statApps.textContent = data.stats.totalApps || 0;
        statSubs.textContent = data.stats.totalSubscriptions || 0;
        statSent.textContent = data.stats.totalSent || 0;
        const uptimeMin = Math.floor((data.stats.uptimeSeconds || 0) / 60);
        statUptime.textContent = `${uptimeMin}분 가동 중 (Subject: ${data.stats.vapidSubject})`;
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }

  // 2. Fetch Apps List
  async function loadApps() {
    try {
      const res = await fetch('/api/v1/apps');
      const data = await res.json();
      if (data.success && data.apps) {
        // Populate Select Dropdowns
        const currentVal1 = adminTargetApp.value;
        const currentVal2 = filterSubApp.value;

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

        // Render Apps Table
        if (data.apps.length === 0) {
          adminAppsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">등록된 앱이 없습니다.</td></tr>';
          return;
        }

        adminAppsTbody.innerHTML = data.apps.map(app => `
          <tr>
            <td><strong>${escapeHtml(app.app_name)}</strong></td>
            <td><code>${escapeHtml(app.app_key)}</code></td>
            <td>${new Date(app.created_at).toLocaleDateString()}</td>
            <td>
              <button class="btn btn-danger btn-sm btn-delete-app" data-key="${escapeHtml(app.app_key)}">삭제</button>
            </td>
          </tr>
        `).join('');

        // Attach delete event handlers
        document.querySelectorAll('.btn-delete-app').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const appKey = e.target.getAttribute('data-key');
            if (confirm(`정말로 AppKey [${appKey}] 및 관련 모든 구독 정보를 삭제하시겠습니까?`)) {
              await deleteApp(appKey);
            }
          });
        });
      }
    } catch (err) {
      console.error('Error fetching apps:', err);
    }
  }

  // Delete App Function
  async function deleteApp(appKey) {
    try {
      const res = await fetch(`/api/v1/apps/${encodeURIComponent(appKey)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(`AppKey [${appKey}] 삭제 완료.`);
        await refreshAll();
      } else {
        alert('삭제 실패: ' + data.error);
      }
    } catch (err) {
      alert('오류 발생: ' + err.message);
    }
  }

  // 3. Create App Key Handler
  btnAdminCreateApp.addEventListener('click', async () => {
    const name = adminAppName.value.trim();
    const key = adminAppKey.value.trim();
    if (!name) return alert('앱 이름을 입력하세요.');

    try {
      const res = await fetch('/api/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_name: name, app_key: key || undefined })
      });
      const data = await res.json();
      if (data.success) {
        alert(`🔑 신규 App Key [${data.app.app_name}] 생성 완료!\nAppKey: ${data.app.app_key}\nSecretKey: ${data.app.secret_key}`);
        adminAppName.value = '';
        adminAppKey.value = '';
        await refreshAll();
      } else {
        alert('생성 실패: ' + data.error);
      }
    } catch (err) {
      alert('오류 발생: ' + err.message);
    }
  });

  // 4. Fetch Subscriptions
  async function loadSubscriptions() {
    const selectedApp = filterSubApp.value || adminTargetApp.value || 'demo-app-key-2026';
    try {
      const res = await fetch(`/api/v1/subscriptions?app_key=${encodeURIComponent(selectedApp)}`);
      const data = await res.json();
      if (data.success && data.subscriptions) {
        if (data.subscriptions.length === 0) {
          adminSubsTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">등록된 구독 정보가 없습니다.</td></tr>';
          return;
        }

        adminSubsTbody.innerHTML = data.subscriptions.map(sub => {
          const endpointSnippet = sub.endpoint ? sub.endpoint.substring(0, 35) + '...' : 'N/A';
          const uaSnippet = sub.user_agent ? (sub.user_agent.includes('Chrome') ? 'Chrome' : (sub.user_agent.includes('Safari') ? 'Safari' : 'Browser')) : 'Browser';
          return `
            <tr>
              <td>#${sub.id}</td>
              <td><code>${escapeHtml(sub.app_key)}</code></td>
              <td><strong>${escapeHtml(sub.user_id)}</strong></td>
              <td><span class="badge">${uaSnippet}</span></td>
              <td title="${escapeHtml(sub.endpoint)}"><code>${escapeHtml(endpointSnippet)}</code></td>
              <td>${new Date(sub.created_at).toLocaleString()}</td>
              <td>
                <button class="btn btn-danger btn-sm btn-delete-sub" data-id="${sub.id}">삭제</button>
              </td>
            </tr>
          `;
        }).join('');

        document.querySelectorAll('.btn-delete-sub').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const subId = e.target.getAttribute('data-id');
            if (confirm(`구독 #${subId}를 삭제하시겠습니까?`)) {
              await deleteSubscription(subId);
            }
          });
        });
      }
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
    }
  }

  async function deleteSubscription(subId) {
    try {
      const res = await fetch(`/api/v1/subscriptions/${subId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await refreshAll();
      }
    } catch (err) {
      alert('구독 삭제 중 오류 발생: ' + err.message);
    }
  }

  // 5. Send Broadcast Push Handler
  btnAdminSendPush.addEventListener('click', async () => {
    btnAdminSendPush.disabled = true;
    try {
      const payload = {
        app_key: adminTargetApp.value,
        user_id: adminTargetUser.value.trim() || undefined,
        title: adminPushTitle.value.trim(),
        body: adminPushBody.value.trim(),
        url: adminPushUrl.value.trim()
      };

      const res = await fetch('/api/v1/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        alert(`🚀 서버 푸시 전송 완료!\n성공: ${data.deliveredCount}건, 실패: ${data.failCount}건, 만료 정제: ${data.prunedCount || 0}건`);
        await refreshAll();
      } else {
        alert('전송 실패: ' + data.error);
      }
    } catch (err) {
      alert('오류 발생: ' + err.message);
    } finally {
      btnAdminSendPush.disabled = false;
    }
  });

  // 6. Fetch Push Logs
  async function loadLogs() {
    const selectedAppKey = filterSubApp.value || adminTargetApp.value;
    try {
      const res = await fetch(`/api/v1/logs?app_key=${encodeURIComponent(selectedAppKey)}`);
      const data = await res.json();
      if (data.success && data.logs) {
        if (data.logs.length === 0) {
          adminLogsTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">발송 기록이 없습니다.</td></tr>';
          return;
        }

        adminLogsTbody.innerHTML = data.logs.map(log => `
          <tr>
            <td>#${log.id}</td>
            <td><code>${escapeHtml(log.app_key)}</code></td>
            <td><strong>${escapeHtml(log.title)}</strong></td>
            <td>${escapeHtml(log.body)}</td>
            <td style="color: var(--success); font-weight: bold;">${log.success_count}</td>
            <td style="color: var(--danger); font-weight: bold;">${log.fail_count}</td>
            <td>${new Date(log.sent_at).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function refreshAll() {
    await loadStats();
    await loadApps();
    await loadSubscriptions();
    await loadLogs();
  }

  filterSubApp.addEventListener('change', async () => {
    await loadSubscriptions();
    await loadLogs();
  });
  btnRefreshSubs.addEventListener('click', refreshAll);

  // Initial Load
  await refreshAll();
});
