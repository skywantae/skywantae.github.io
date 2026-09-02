/**
 * KOSTAT ERP Mobile - Zero-Touch Auto Updater for PWA
 * 사용자가 번거롭게 새로고침할 필요 없이 신규 배포 시 0.1초 만에 자동 갱신
 */

const APP_CURRENT_VERSION = "v1.0.121";

async function autoCheckAndApplyUpdate() {
  try {
    const timestamp = Date.now();
    const res = await fetch(`version.json?t=${timestamp}`, { cache: 'no-store' });
    if (!res.ok) return;

    const data = await res.json();
    const remoteVer = (data.version || '').trim();

    if (remoteVer && remoteVer !== APP_CURRENT_VERSION) {
      console.log(`[Auto-Updater] 신규 버전 감지: ${APP_CURRENT_VERSION} -> ${remoteVer}`);
      
      // 1. 모든 Service Worker 캐시 즉시 비우기
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }

      // 2. 활성 Service Worker 갱신 트리거
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update();
        }
      }

      // 3. 사용자 개입 없이 즉시 자동 무소음 리로드 (단 1회만 루프 방지)
      const lastReloadKey = 'kostat_last_auto_reload_ver';
      if (sessionStorage.getItem(lastReloadKey) !== remoteVer) {
        sessionStorage.setItem(lastReloadKey, remoteVer);
        window.location.reload();
      }
    }
  } catch (err) {
    console.warn('[Auto-Updater] 자동 업데이트 체크 중 오류:', err);
  }
}

// 앱 시작 시 및 30초 주기로 자동 업데이트 백그라운드 체크
autoCheckAndApplyUpdate();
setInterval(autoCheckAndApplyUpdate, 30000);

// 수동 업데이트 확인 버튼 핸들러
async function checkForAppUpdates(isManual = false) {
  const statusMsgEl = document.getElementById('updateStatusMsg');
  if (statusMsgEl) {
    statusMsgEl.innerHTML = '<span style="color:#60a5fa;">최신 버전을 확인하는 중...</span>';
  }

  try {
    const timestamp = Date.now();
    const res = await fetch(`version.json?t=${timestamp}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const remoteVer = (data.version || '').trim();

      if (remoteVer && remoteVer !== APP_CURRENT_VERSION) {
        if (statusMsgEl) {
          statusMsgEl.innerHTML = `<span style="color:#34d399;">새 버전(${remoteVer})이 적용되었습니다. 갱신 중...</span>`;
        }
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map(k => caches.delete(k)));
        }
        setTimeout(() => window.location.reload(), 300);
        return;
      }
    }
  } catch (e) {}

  if (statusMsgEl) {
    statusMsgEl.innerHTML = `<span style="color:#34d399;">현재 최신 버전(${APP_CURRENT_VERSION})을 사용 중입니다.</span>`;
  }
}

function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const lParts = latest.split('.').map(n => parseInt(n, 10) || 0);
  const cParts = current.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function showUpdateNotification(newVersion, downloadUrl, filename) {
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
      <strong style="color:#60a5fa;font-size:13px;">🚀 새 버전 v${newVersion} 출시</strong>
      <p style="font-size:11px;color:#94a3b8;margin:2px 0 0 0;">새로운 기능 및 출하 데이터가 업데이트되었습니다.</p>
    </div>
    <div style="display:flex;gap:6px;">
      <button onclick="downloadApkInApp('${downloadUrl}', '${filename}')" style="background:#3b82f6;color:#fff;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer;">즉시 다운로드</button>
      <button onclick="this.parentElement.parentElement.remove()" style="background:transparent;border:none;color:#94a3b8;font-size:16px;cursor:pointer;">&times;</button>
    </div>
  `;
  document.body.appendChild(noti);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 이벤트 바인딩
document.addEventListener('DOMContentLoaded', () => {
  const btnCheck = document.getElementById('btnCheckAppUpdate');
  if (btnCheck) {
    btnCheck.addEventListener('click', () => checkForAppUpdates(true));
  }
  // 앱 실행 3초 후 조용히 백그라운드 확인
  setTimeout(() => checkForAppUpdates(false), 3000);
});
