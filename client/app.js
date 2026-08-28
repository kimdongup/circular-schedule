document.addEventListener('DOMContentLoaded', async () => {
  const client = new PushwingClient({
    serverUrl: window.location.origin,
    swPath: '/client/sw.js'
  });

  // UI Element Selectors
  const statSupport = document.getElementById('stat-support');
  const statPermission = document.getElementById('stat-permission');
  const statSubscribed = document.getElementById('stat-subscribed');

  const inputAppKey = document.getElementById('input-app-key');
  const inputUserId = document.getElementById('input-user-id');
  const btnToggleSubscribe = document.getElementById('btn-toggle-subscribe');
  const codeSubscription = document.getElementById('code-subscription');

  const pushTargetApp = document.getElementById('push-target-app');
  const pushTargetUser = document.getElementById('push-target-user');
  const pushTitle = document.getElementById('push-title');
  const pushBody = document.getElementById('push-body');
  const pushUrl = document.getElementById('push-url');
  const btnSendPush = document.getElementById('btn-send-push');

  const newAppName = document.getElementById('new-app-name');
  const newAppKey = document.getElementById('new-app-key');
  const btnCreateApp = document.getElementById('btn-create-app');
  const logsTableBody = document.getElementById('logs-table-body');

  // 1. Initial Browser & PWA Support Check
  const isSupported = client.isSupported();
  statSupport.textContent = isSupported ? '🟢 지원됨 (W3C Push API)' : '🔴 미지원 브라우저';
  statSupport.style.color = isSupported ? 'var(--success)' : 'var(--danger)';

  if (!isSupported) {
    btnToggleSubscribe.disabled = true;
    btnToggleSubscribe.textContent = '❌ 웹 푸시 미지원 브라우저';
    return;
  }

  // 2. Load Apps list from server
  async function loadApps() {
    try {
      const res = await fetch('/api/v1/apps');
      const data = await res.json();
      if (data.success && data.apps) {
        inputAppKey.innerHTML = '';
        pushTargetApp.innerHTML = '';
        data.apps.forEach(app => {
          const opt1 = document.createElement('option');
          opt1.value = app.app_key;
          opt1.textContent = `${app.app_name} (${app.app_key})`;

          const opt2 = document.createElement('option');
          opt2.value = app.app_key;
          opt2.textContent = `${app.app_name} (${app.app_key})`;

          inputAppKey.appendChild(opt1);
          pushTargetApp.appendChild(opt2);
        });
      }
    } catch (err) {
      console.error('Failed to load apps:', err);
    }
  }

  // 3. Load Push Logs
  async function loadLogs() {
    const selectedAppKey = pushTargetApp.value || 'demo-app-key-2026';
    try {
      const res = await fetch(`/api/v1/logs?app_key=${encodeURIComponent(selectedAppKey)}`);
      const data = await res.json();
      if (data.success && data.logs) {
        if (data.logs.length === 0) {
          logsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">발송 로그가 없습니다.</td></tr>';
          return;
        }
        logsTableBody.innerHTML = data.logs.map(log => `
          <tr>
            <td><strong>${escapeHtml(log.title)}</strong></td>
            <td>${escapeHtml(log.body)}</td>
            <td style="color: var(--success); font-weight: bold;">${log.success_count}</td>
            <td style="color: var(--danger); font-weight: bold;">${log.fail_count}</td>
            <td>${new Date(log.sent_at).toLocaleTimeString()}</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 4. Update UI Status
  async function updateStatus() {
    const status = await client.getSubscriptionStatus();
    statPermission.textContent = status.permission === 'granted' ? '🟢 허용됨' : (status.permission === 'denied' ? '🔴 거부됨' : '🟡 미요청');
    statPermission.style.color = status.permission === 'granted' ? 'var(--success)' : (status.permission === 'denied' ? 'var(--danger)' : 'var(--primary)');

    if (status.subscribed) {
      statSubscribed.textContent = '🔔 구독 중 (알림 켜짐)';
      statSubscribed.style.color = 'var(--success)';
      btnToggleSubscribe.textContent = '🔕 푸시 알림 구독 해제';
      btnToggleSubscribe.className = 'btn btn-danger';
      codeSubscription.textContent = JSON.stringify(status.subscription, null, 2);
    } else {
      statSubscribed.textContent = '🔕 미구독';
      statSubscribed.style.color = 'var(--text-muted)';
      btnToggleSubscribe.textContent = '🔔 웹 푸시 알림 수신 동의 (구독)';
      btnToggleSubscribe.className = 'btn btn-primary';
      codeSubscription.textContent = '구독 정보 없음';
    }
  }

  // 5. Subscription Button Click Listener
  btnToggleSubscribe.addEventListener('click', async () => {
    btnToggleSubscribe.disabled = true;
    try {
      const status = await client.getSubscriptionStatus();
      client.appKey = inputAppKey.value;

      if (status.subscribed) {
        await client.unsubscribe();
        alert('🔕 푸시 알림 구독이 해제되었습니다.');
      } else {
        const userId = inputUserId.value.trim() || 'user-' + Math.random().toString(36).substring(2, 8);
        await client.subscribe(userId);
        alert('🔔 웹 푸시 알림 구독이 등록되었습니다!');
      }
    } catch (err) {
      alert('오류 발생: ' + err.message);
    } finally {
      btnToggleSubscribe.disabled = false;
      await updateStatus();
    }
  });

  // 6. Send Push Button Listener
  btnSendPush.addEventListener('click', async () => {
    btnSendPush.disabled = true;
    try {
      const payload = {
        app_key: pushTargetApp.value,
        user_id: pushTargetUser.value.trim() || undefined,
        title: pushTitle.value.trim(),
        body: pushBody.value.trim(),
        url: pushUrl.value.trim()
      };

      const res = await fetch('/api/v1/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        alert(`🚀 푸시 발송 완료!\n성공: ${data.deliveredCount}건, 실패: ${data.failCount}건, 만료 정제: ${data.prunedCount || 0}건`);
        await loadLogs();
      } else {
        alert('푸시 발송 실패: ' + data.error);
      }
    } catch (err) {
      alert('통신 오류: ' + err.message);
    } finally {
      btnSendPush.disabled = false;
    }
  });

  // 7. Create App Listener
  btnCreateApp.addEventListener('click', async () => {
    const name = newAppName.value.trim();
    const key = newAppKey.value.trim();
    if (!name) return alert('앱 이름을 입력해주세요.');

    try {
      const res = await fetch('/api/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_name: name, app_key: key || undefined })
      });
      const data = await res.json();
      if (data.success) {
        alert(`🔑 신규 앱 [${data.app.app_name}]이 생성되었습니다! AppKey: ${data.app.app_key}`);
        newAppName.value = '';
        newAppKey.value = '';
        await loadApps();
      } else {
        alert('앱 생성 실패: ' + data.error);
      }
    } catch (err) {
      alert('오류 발생: ' + err.message);
    }
  });

  pushTargetApp.addEventListener('change', loadLogs);

  // Initialize UI
  await loadApps();
  await updateStatus();
  await loadLogs();
});
