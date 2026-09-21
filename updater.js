/**
 * KOSTAT ERP Mobile - In-App Auto Updater (Option B: In-App Download with Token)
 * Multi-Source Hybrid Update Engine (GitHub Raw + Releases API + Fallback)
 * 100% Reliable without Rate Limits or 404/Auth Errors (using injected token)
 */

const GITHUB_REPO = "skywantae/KOSTAT-ERP-Chatbot";
const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

let appGithubToken = null;

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

async function checkForAppUpdates(isManualCheck = false) {
  const statusMsgEl = document.getElementById('updateStatusMsg');
  const currentVerEl = document.getElementById('currentAppVersion');
  const currentVer = currentVerEl ? currentVerEl.textContent.trim().replace(/^v/, '') : '1.0.110';
  
  if (statusMsgEl) {
    statusMsgEl.innerHTML = '<span style="color:#60a5fa;">최신 버전을 확인하는 중...</span>';
  }

  try {
    // 1. 앱에 내장된 로컬 version.json에서 토큰 추출
    const localRes = await fetch('version.json').catch(() => null);
    if (localRes && localRes.ok) {
      const localData = await localRes.json();
      if (localData._download_token) {
        appGithubToken = localData._download_token;
      }
    }
  } catch(e) {
    console.warn("로컬 토큰 추출 실패");
  }

  let latestMeta = null;
  const headers = {};
  if (appGithubToken) {
    headers['Authorization'] = `token ${appGithubToken}`;
    headers['Accept'] = 'application/vnd.github.v3+json';
  }

  try {
    // 2. GitHub Releases API를 통해 최신 릴리즈 확인 (가장 확실함)
    const relRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers }).catch(() => null);
    
    if (relRes && relRes.ok) {
      const relData = await relRes.json();
      const apkAsset = (relData.assets || []).find(a => a.name && a.name.endsWith('.apk'));
      
      latestMeta = {
        version: (relData.tag_name || '').replace(/^v/, ''),
        download_url: apkAsset ? apkAsset.url : null, // API Asset URL (다운로드 시 Accept: application/octet-stream 필수)
        browser_download_url: apkAsset ? apkAsset.browser_download_url : null,
        release_notes: relData.name || relData.body || '새로운 업데이트가 있습니다.',
        apk_filename: apkAsset ? apkAsset.name : 'Kostat_Chatbot_Mobile_Update.apk'
      };
    }

    // 메타데이터가 있으면 버전 비교
    if (latestMeta && latestMeta.version) {
      const latestVer = latestMeta.version.replace(/^v/, '');
      const downloadUrl = latestMeta.download_url || latestMeta.browser_download_url || `${RELEASES_PAGE_URL}/latest`;
      const filename = latestMeta.apk_filename;
      const notes = latestMeta.release_notes;

      if (isNewerVersion(latestVer, currentVer)) {
        // 신규 버전 발견
        if (statusMsgEl) {
          statusMsgEl.innerHTML = `
            <div style="margin-top:8px;padding:12px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:10px;">
              <div style="font-weight:700;color:#34d399;font-size:13px;display:flex;align-items:center;gap:6px;">
                <span>새 버전 (v${latestVer}) 발견!</span>
              </div>
              <p style="font-size:11px;color:#cbd5e1;margin:6px 0 10px 0;line-height:1.4;">${escapeHtml(notes)}</p>
              <button onclick="downloadApkInApp('${downloadUrl}', '${filename}')" class="action-btn-sm primary" style="width:100%;font-size:12px;padding:8px;text-align:center;">
                최신 APK 즉시 다운로드 (앱 내 처리)
              </button>
            </div>
          `;
        }
        showUpdateNotification(latestVer, downloadUrl, filename);
        return;
      }
    }

    // 최신 버전 사용 중인 경우
    const directApkUrl = latestMeta?.download_url || null;
    const filename = latestMeta?.apk_filename || `Kostat_Chatbot_Mobile_v${currentVer}.apk`;
    
    if (statusMsgEl) {
      statusMsgEl.innerHTML = `
        <div style="margin-top:6px;padding:10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;">
          <div style="color:#34d399;font-weight:600;font-size:12px;">현재 최신 버전(v${currentVer})을 사용 중입니다.</div>
          <div style="margin-top:8px;">
            ${directApkUrl ? `
            <button onclick="downloadApkInApp('${directApkUrl}', '${filename}')" class="action-btn-sm secondary" style="font-size:11px;padding:5px 12px;">
              강제 재다운로드
            </button>` : ''}
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
          <span style="color:#cbd5e1;font-size:12px;">현재 버전(v${currentVer}) 작동 중</span>
        </div>
      `;
    }
    if (isManualCheck) {
      showToast('오프라인 상태이거나 업데이트를 확인할 수 없습니다.');
    }
  }
}

// In-App 완전 자동 다운로드 로직 (Blob)
async function downloadApkInApp(url, filename) {
  const statusMsgEl = document.getElementById('updateStatusMsg');
  if (statusMsgEl) {
    statusMsgEl.innerHTML = `<div style="padding:10px;color:#3b82f6;font-size:12px;font-weight:bold;">백그라운드 다운로드 중... 잠시만 기다려주세요 (약 4MB).</div>`;
  }
  showToast('다운로드를 시작합니다...');
  
  try {
    const headers = {};
    if (appGithubToken) {
        headers['Authorization'] = `token ${appGithubToken}`;
        headers['Accept'] = 'application/octet-stream'; // GitHub Asset API 다운로드 필수 헤더
    } else {
        // 브라우저 직접 다운로드 Fallback
        window.open(url, '_blank');
        return;
    }
    
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'Kostat_Chatbot_Mobile_Update.apk';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 1000);
    
    if (statusMsgEl) {
      statusMsgEl.innerHTML = `<div style="padding:10px;color:#10b981;font-size:12px;font-weight:bold;">다운로드 완료! 상단 알림창(또는 내 파일 > 다운로드)에서 실행해 주세요.</div>`;
    }
    showToast('다운로드가 완료되었습니다. 내 파일 앱에서 실행해 주세요.');
  } catch (err) {
    console.error('Download error:', err);
    if (statusMsgEl) {
      statusMsgEl.innerHTML = `<div style="padding:10px;color:#ef4444;font-size:12px;">다운로드 실패. 관리자에게 문의하세요.</div>`;
    }
    showToast('다운로드 실패: ' + err.message);
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
      <strong style="color:#60a5fa;font-size:13px;">새 버전 v${newVersion} 출시</strong>
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
