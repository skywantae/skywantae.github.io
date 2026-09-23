/**
 * KOSTAT ERP Mobile - Pure Web (PWA) Live Updater
 * Checks server version.json and refreshes PWA cache seamlessly.
 * Strictly adheres to enterprise UI standards with zero emojis.
 */

function showToast(msg) {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(msg);
    return;
  }
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
    background: rgba(30, 41, 59, 0.95); color: #fff; padding: 8px 16px;
    border-radius: 20px; font-size: 12px; font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 9999;
    backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const lClean = latest.replace(/^v/, '');
  const cClean = current.replace(/^v/, '');
  const lParts = lClean.split('.').map(n => parseInt(n, 10) || 0);
  const cParts = cClean.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function applyWebUpdate() {
  showToast('최신 버전을 반영하기 위해 새로고침합니다...');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.update().catch(() => {});
      }
    }
  } catch (e) {
    console.warn('Cache clearing error:', e);
  }
  setTimeout(() => {
    window.location.reload(true);
  }, 300);
}

async function checkForAppUpdates(isManualCheck = false) {
  const statusMsgEl = document.getElementById('updateStatusMsg');
  const currentVerEl = document.getElementById('currentAppVersion');
  const currentVer = currentVerEl ? currentVerEl.textContent.trim().replace(/^v/, '') : '1.0.173';

  if (statusMsgEl) {
    statusMsgEl.innerHTML = '<span style="color:#60a5fa;font-size:12px;">최신 버전을 확인하는 중...</span>';
  }

  try {
    const res = await fetch(`version.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const serverVer = (data.version || '').replace(/^v/, '');
    const serverDataDate = data.data_date || '';

    if (isNewerVersion(serverVer, currentVer)) {
      if (statusMsgEl) {
        statusMsgEl.innerHTML = `
          <div style="margin-top:8px;padding:12px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:10px;">
            <div style="font-weight:700;color:#34d399;font-size:13px;">새 버전 (v${serverVer}) 업데이트 가능</div>
            <p style="font-size:11px;color:#cbd5e1;margin:6px 0 10px 0;line-height:1.4;">
              최신 웹 기능 및 출하 데이터가 배포되었습니다. (데이터 기준: ${escapeHtml(serverDataDate)})
            </p>
            <button onclick="applyWebUpdate()" class="action-btn-sm primary" style="width:100%;font-size:12px;padding:8px;text-align:center;">
              지금 새로고침하여 즉시 반영
            </button>
          </div>
        `;
      }
      showUpdateNotification(serverVer, serverDataDate);
      return;
    }

    if (statusMsgEl) {
      statusMsgEl.innerHTML = `
        <div style="margin-top:6px;padding:10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;">
          <div style="color:#34d399;font-weight:600;font-size:12px;">현재 최신 버전(v${currentVer})을 사용 중입니다.</div>
          ${serverDataDate ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px;">데이터 기준일자: ${escapeHtml(serverDataDate)}</div>` : ''}
          <div style="margin-top:8px;">
            <button onclick="applyWebUpdate()" class="action-btn-sm secondary" style="font-size:11px;padding:5px 12px;">
              캐시 초기화 및 새로고침
            </button>
          </div>
        </div>
      `;
    }
    if (isManualCheck) {
      showToast('현재 최신 버전을 사용 중입니다.');
    }
  } catch (err) {
    if (statusMsgEl) {
      statusMsgEl.innerHTML = `
        <div style="margin-top:6px;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;">
          <span style="color:#cbd5e1;font-size:12px;">현재 버전(v${currentVer}) 정상 작동 중</span>
        </div>
      `;
    }
    if (isManualCheck) {
      showToast('오프라인 상태이거나 서버에 연결할 수 없습니다.');
    }
  }
}

function showUpdateNotification(newVersion, dataDate) {
  const existing = document.getElementById('updateNotiBanner');
  if (existing) existing.remove();

  const noti = document.createElement('div');
  noti.id = 'updateNotiBanner';
  noti.style.cssText = `
    position: fixed; bottom: 80px; left: 16px; right: 16px;
    background: linear-gradient(135deg, #1e293b, #0f172a);
    border: 1px solid rgba(59, 130, 246, 0.4);
    border-radius: 12px; padding: 12px 16px; color: #fff;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 150;
    display: flex; align-items: center; justify-content: space-between;
    animation: slideUp 0.3s ease-out;
  `;
  noti.innerHTML = `
    <div>
      <strong style="color:#60a5fa;font-size:13px;">새 버전 v${newVersion} 배포 완료</strong>
      <p style="font-size:11px;color:#94a3b8;margin:2px 0 0 0;">최신 데이터가 배포되었습니다. 새로고침 시 즉시 반영됩니다.</p>
    </div>
    <div style="display:flex;gap:6px;">
      <button onclick="applyWebUpdate()" style="background:#3b82f6;color:#fff;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer;">새로고침</button>
      <button onclick="this.parentElement.parentElement.remove()" style="background:transparent;border:none;color:#94a3b8;font-size:16px;cursor:pointer;">&times;</button>
    </div>
  `;
  document.body.appendChild(noti);
}

window.applyWebUpdate = applyWebUpdate;
window.checkForAppUpdates = checkForAppUpdates;

document.addEventListener('DOMContentLoaded', () => {
  const btnCheck = document.getElementById('btnCheckAppUpdate');
  if (btnCheck) {
    btnCheck.addEventListener('click', () => checkForAppUpdates(true));
  }
  setTimeout(() => checkForAppUpdates(false), 3000);
});
