/**
 * KOSTAT Embedded Web Remote Desktop Client Module
 * Supports ultra-low latency canvas streaming, multi-device management, and touch/trackpad gestures.
 */

window.RemoteClient = (function() {
  const State = {
    ws: null,
    canvas: null,
    ctx: null,
    container: null,
    virtualCursor: null,
    
    mode: 'touch', // 'touch' or 'trackpad'
    isConnected: false,
    pin: '8805',
    deviceList: [],
    currentDeviceId: 'local',
    
    framesReceived: 0,
    lastFpsUpdate: Date.now(),
    fps: 0,
    
    cursorX: 0.5,
    cursorY: 0.5,
    
    touchStartX: 0,
    touchStartY: 0,
    touchStartTime: 0,
    touchHoldTimer: null,
    isTwoFinger: false,
    lastTwoFingerX: 0,
    lastTwoFingerY: 0,
    fitMode: localStorage.getItem('kostat_rd_ratio_mode') || 'fit',
    zoomScale: 1.0,
    panX: 0,
    panY: 0,
    pinchStartDist: 0,
    pinchStartScale: 1.0,
    isPinching: false,
    initialized: false
  };

  function setZoom(scale, resetPan = false) {
    State.zoomScale = Math.max(1.0, Math.min(4.0, parseFloat(scale.toFixed(2))));
    if (State.zoomScale <= 1.0 || resetPan) {
      State.panX = 0;
      State.panY = 0;
    }
    applyZoom();
  }

  function zoomIn() {
    setZoom(State.zoomScale + 0.25);
  }

  function zoomOut() {
    setZoom(State.zoomScale - 0.25);
  }

  function zoomReset() {
    setZoom(1.0, true);
  }

  function applyZoom() {
    const canvas = State.canvas || document.getElementById('rdCanvas');
    if (!canvas) return;
    if (State.zoomScale <= 1.0) {
      State.zoomScale = 1.0;
      State.panX = 0;
      State.panY = 0;
      canvas.style.transform = '';
    } else {
      canvas.style.transform = `scale(${State.zoomScale}) translate(${State.panX}px, ${State.panY}px)`;
    }
    const txt = `${Math.round(State.zoomScale * 100)}%`;
    const resetBtn = document.getElementById('rdBtnZoomReset');
    if (resetBtn) resetBtn.textContent = txt;
    const floatTxt = document.getElementById('rdFloatZoomLevel');
    if (floatTxt) floatTxt.textContent = txt;
    updateVirtualCursor();
  }

  function applyRatioMode(mode) {
    State.fitMode = mode;
    const canvas = State.canvas || document.getElementById('rdCanvas');
    if (canvas) {
      canvas.classList.remove('fit-mode', 'fill-mode', 'cover-mode');
      canvas.classList.add(`${mode}-mode`);
    }
    const ratioSelect = document.getElementById('rdRatioSelect');
    if (ratioSelect) ratioSelect.value = mode;
    updateVirtualCursor();
  }

  function init() {
    if (State.initialized) return;
    State.canvas = document.getElementById('rdCanvas');
    if (!State.canvas) return;
    State.ctx = State.canvas.getContext('2d');
    State.container = document.getElementById('rdViewportContainer');
    State.virtualCursor = document.getElementById('rdVirtualCursor');

    loadDevices();
    bindUI();
    bindInputs();
    State.initialized = true;

    // Load saved PIN
    const savedPin = localStorage.getItem('kostat_remote_pin') || '8805';
    if (savedPin) State.pin = savedPin;
    const pinEl = document.getElementById('rdPinInput');
    if (pinEl) pinEl.value = State.pin;

    // Apply saved aspect ratio mode
    applyRatioMode(State.fitMode);

    // [Cache Purge] Purge legacy edmonton / dead tunnel URLs from localStorage
    if (localStorage.getItem('kostat_remote_cache_ver') !== 'v1.0.143') {
      localStorage.removeItem('kostat_remote_last_url');
      localStorage.removeItem('kostat_remote_devices');
      localStorage.setItem('kostat_remote_cache_ver', 'v1.0.143');
      State.deviceList = [];
    }

    // Load saved URL for default
    const savedUrl = localStorage.getItem('kostat_remote_last_url') || '';
    const urlEl = document.getElementById('rdUrlInput');
    if (urlEl && savedUrl) urlEl.value = savedUrl;

    // Zero-Touch Auto-Discovery: Check for online siege-mode laptop and auto-connect
    fetchAutoDiscoveryAndConnect();
  }

  let autoRecoveryTimer = null;
  let autoRecoveryAttempts = 0;

  async function fetchAutoDiscoveryAndConnect(forceRefresh = false) {
    if (State.isConnected) return;
    updateStatus(false, '한국 노트북 탐색 중...');
    let info = null;
    const cacheBuster = `_t=${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 1. Real-time GitHub API (zero cache, instant)
    try {
      const apiEndpoint = `https://api.github.com/repos/skywantae/skywantae.github.io/contents/remote_host.json?${cacheBuster}`;
      const apiRes = await fetch(apiEndpoint, { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      if (apiRes.ok) {
        const ghJson = await apiRes.json();
        if (ghJson && ghJson.content) {
          const rawStr = decodeURIComponent(escape(atob(ghJson.content.replace(/\s/g, ''))));
          info = JSON.parse(rawStr);
          console.log('[Auto-Discovery] Success via GitHub API (0-cache)');
        }
      }
    } catch (e) {
      console.log('[Auto-Discovery] API fetch failed, trying live pages fallback:', e);
    }

    // 2. GitHub Pages direct origin (instant zero-cache)
    if (!info) {
      try {
        const pagesEndpoint = `https://skywantae.github.io/remote_host.json?${cacheBuster}`;
        const pagesRes = await fetch(pagesEndpoint, { 
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
        });
        if (pagesRes.ok) {
          info = await pagesRes.json();
          console.log('[Auto-Discovery] Success via GitHub Pages origin');
        }
      } catch (e) {
        console.log('[Auto-Discovery] Pages origin fetch failed, trying raw fallback:', e);
      }
    }

    // 3. Raw endpoint fallback
    if (!info) {
      try {
        const rawEndpoint = `https://raw.githubusercontent.com/skywantae/skywantae.github.io/main/remote_host.json?${cacheBuster}`;
        const rawRes = await fetch(rawEndpoint, { 
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
        });
        if (rawRes.ok) {
          info = await rawRes.json();
          console.log('[Auto-Discovery] Success via Raw fallback');
        }
      } catch (e) {
        console.log('[Auto-Discovery] Raw fallback failed:', e);
      }
    }

    if (info) {
      // Rebuild clean deviceList from remote_host.json (purge dead devices completely)
      State.deviceList = [];
      let targetDevId = null;

      // Multi-device parsing (sorted by freshest updated_at)
      if (info.devices && typeof info.devices === 'object') {
        const entries = Object.entries(info.devices).sort((a, b) => {
          const timeA = a[1].updated_at || '';
          const timeB = b[1].updated_at || '';
          return timeB.localeCompare(timeA); // Descending (freshest first)
        });

        entries.forEach(([devId, devInfo]) => {
          const devName = devInfo.name || `💻 ${devId}`;
          State.deviceList.push({
            id: devId,
            name: devName,
            url: devInfo.active_url,
            pin: devInfo.pin || '8805',
            status: devInfo.status || 'online',
            updated_at: devInfo.updated_at
          });

          if (devInfo.status === 'online' && !targetDevId) {
            targetDevId = devId;
          }
        });
      }

      // Root single-device support fallback
      if (info.status === 'online' && info.active_url && State.deviceList.length === 0) {
        const defaultName = info.device_name || '💻 내 노트북 (시즈모드 1)';
        State.deviceList.push({
          id: 'dev_default',
          name: defaultName,
          url: info.active_url,
          pin: info.pin || '8805',
          status: 'online'
        });
        targetDevId = 'dev_default';
      }

      saveDevices();

      if (targetDevId) {
        const targetDev = State.deviceList.find(d => d.id === targetDevId);
        console.log('[Auto-Discovery] Connecting to freshest online device:', targetDevId, targetDev?.url);
        State.pin = targetDev?.pin || '8805';
        const pinEl = document.getElementById('rdPinInput');
        if (pinEl) pinEl.value = State.pin;
        const urlEl = document.getElementById('rdUrlInput');
        if (urlEl) urlEl.value = targetDev?.url || '';

        updateStatus(false, '자동 직통 연결 중...');
        connectToDevice(targetDevId);
        return;
      }
    }

    updateStatus(false, '연결 대기');
  }

  function loadDevices() {
    const saved = localStorage.getItem('kostat_remote_devices');
    if (saved) {
      try { State.deviceList = JSON.parse(saved); } catch (e) { State.deviceList = []; }
    }
    if (State.deviceList.length === 0) {
      State.deviceList = [
        { id: 'dev_default', name: '💻 내 노트북 (기본)', url: localStorage.getItem('kostat_remote_last_url') || '', pin: '8805' }
      ];
    }
    renderDeviceSelect();
  }

  function saveDevices() {
    localStorage.setItem('kostat_remote_devices', JSON.stringify(State.deviceList));
    renderDeviceSelect();
  }

  let deviceSelectListenerBound = false;
  function renderDeviceSelect() {
    const select = document.getElementById('rdDeviceSelect');
    if (!select) return;
    select.innerHTML = '';
    State.deviceList.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name + (d.status === 'online' ? ' [● 온라인]' : '');
      if (d.id === State.currentDeviceId) opt.selected = true;
      select.appendChild(opt);
    });

    if (!deviceSelectListenerBound) {
      select.addEventListener('change', () => {
        const selectedId = select.value;
        if (selectedId && selectedId !== State.currentDeviceId) {
          disconnect();
          connectToDevice(selectedId);
        }
      });
      deviceSelectListenerBound = true;
    }
  }

  function connectToDevice(deviceId) {
    State.currentDeviceId = deviceId;
    const dev = State.deviceList.find(d => d.id === deviceId);
    if (!dev) return;

    if (dev.pin) {
      State.pin = dev.pin;
      const pinEl = document.getElementById('rdPinInput');
      if (pinEl) pinEl.value = dev.pin;
    }

    const urlEl = document.getElementById('rdUrlInput');
    if (urlEl && dev.url) {
      urlEl.value = dev.url;
    }

    let targetUrl = (dev.url || '').trim();
    if (!targetUrl) {
      // Prompt user to enter URL
      document.getElementById('rdAuthOverlay').style.display = 'flex';
      updateStatus(false, '접속 주소를 입력하세요');
      return;
    }

    // Convert http/https to ws/wss
    const base = targetUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
    const wsUrl = `${base}/ws/stream?pin=${encodeURIComponent(State.pin)}`;
    initWebSocket(wsUrl);
  }

  function initWebSocket(url) {
    if (State.ws) {
      try { State.ws.close(); } catch (e) {}
    }

    updateStatus(false, '연결 중...');
    const authOverlay = document.getElementById('rdAuthOverlay');
    const authError = document.getElementById('rdAuthError');
    if (authOverlay) authOverlay.style.display = 'flex';
    if (authError) authError.textContent = '';

    try {
      State.ws = new WebSocket(url);
      State.ws.binaryType = 'blob';

      State.ws.onopen = () => {
        State.isConnected = true;
        autoRecoveryAttempts = 0;
        updateStatus(true, '원격 연결됨');
        if (authOverlay) authOverlay.style.display = 'none';
        if (State.container) State.container.classList.add('connected');
        localStorage.setItem('kostat_remote_pin', State.pin);

        // Save URL
        const cur = State.deviceList.find(d => d.id === State.currentDeviceId);
        const urlInput = document.getElementById('rdUrlInput');
        if (cur && urlInput && urlInput.value.trim()) {
          cur.url = urlInput.value.trim();
          cur.pin = State.pin;
          localStorage.setItem('kostat_remote_last_url', cur.url);
          saveDevices();
        }
      };

      State.ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          const blob = event.data;
          try {
            const imgBitmap = await createImageBitmap(blob);
            if (State.canvas.width !== imgBitmap.width || State.canvas.height !== imgBitmap.height) {
              State.canvas.width = imgBitmap.width;
              State.canvas.height = imgBitmap.height;
            }
            State.ctx.drawImage(imgBitmap, 0, 0);
            imgBitmap.close();

            State.framesReceived++;
            const now = Date.now();
            if (now - State.lastFpsUpdate >= 1000) {
              State.fps = State.framesReceived;
              State.framesReceived = 0;
              State.lastFpsUpdate = now;
              updateStatus(true, `연결됨 (${State.fps} FPS)`);
            }
          } catch (err) {
            const img = new Image();
            img.onload = () => {
              State.canvas.width = img.width;
              State.canvas.height = img.height;
              State.ctx.drawImage(img, 0, 0);
              URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(blob);
          }
        }
      };

      State.ws.onclose = (event) => {
        State.isConnected = false;
        updateStatus(false, '연결 종료');
        if (authOverlay) authOverlay.style.display = 'flex';
        if (State.container) State.container.classList.remove('connected');
        if (event.code === 4001 && authError) {
          authError.textContent = '보안 PIN 코드가 올바르지 않습니다.';
        }
      };

      State.ws.onerror = () => {
        State.isConnected = false;
        if (State.container) State.container.classList.remove('connected');
        
        // Auto-Healing: Try re-discovering fresh tunnel URL
        if (autoRecoveryAttempts < 3) {
          autoRecoveryAttempts++;
          updateStatus(false, `접속 재시도 (${autoRecoveryAttempts}/3)...`);
          if (authError) {
            authError.textContent = `노트북 새 주소 자동 탐색 중... (${autoRecoveryAttempts}/3)`;
          }
          clearTimeout(autoRecoveryTimer);
          autoRecoveryTimer = setTimeout(() => {
            fetchAutoDiscoveryAndConnect(true);
          }, 3000);
        } else {
          updateStatus(false, '접속 실패');
          if (authError) {
            authError.textContent = '노트북에 연결할 수 없습니다. 터널 주소를 확인하거나 잠시 후 다시 시도하세요.';
          }
        }
      };
    } catch (err) {
      if (authError) authError.textContent = err.message;
    }
  }

  function disconnect() {
    if (State.ws) {
      try { State.ws.close(); } catch (e) {}
      State.ws = null;
    }
    State.isConnected = false;
    if (State.container) State.container.classList.remove('connected');
    updateStatus(false, '대기 중');
  }

  function sendCommand(obj) {
    if (State.ws && State.ws.readyState === WebSocket.OPEN) {
      State.ws.send(JSON.stringify(obj));
    }
  }

  function updateStatus(isOnline, text) {
    const dot = document.getElementById('rdStatusDot');
    const txt = document.getElementById('rdStatusText');
    if (dot) dot.className = isOnline ? 'dot online' : 'dot offline';
    if (txt) txt.textContent = text;
  }

  function getImageRenderRect() {
    if (!State.canvas) return null;
    const rect = State.canvas.getBoundingClientRect();
    const videoW = State.canvas.width || 1920;
    const videoH = State.canvas.height || 1080;
    const boxW = rect.width;
    const boxH = rect.height;

    if (State.fitMode === 'fill' || State.canvas.classList.contains('fill-mode')) {
      return { left: rect.left, top: rect.top, width: boxW, height: boxH };
    }

    const videoRatio = videoW / videoH;
    const boxRatio = boxW / boxH;
    let renderW, renderH, offsetX, offsetY;

    if (State.fitMode === 'cover' || State.canvas.classList.contains('cover-mode')) {
      if (boxRatio > videoRatio) {
        renderW = boxW;
        renderH = boxW / videoRatio;
        offsetX = 0;
        offsetY = (boxH - renderH) / 2;
      } else {
        renderH = boxH;
        renderW = boxH * videoRatio;
        offsetX = (boxW - renderW) / 2;
        offsetY = 0;
      }
    } else {
      // 'fit' (contain)
      if (boxRatio > videoRatio) {
        renderH = boxH;
        renderW = boxH * videoRatio;
        offsetX = (boxW - renderW) / 2;
        offsetY = 0;
      } else {
        renderW = boxW;
        renderH = boxW / videoRatio;
        offsetX = 0;
        offsetY = (boxH - renderH) / 2;
      }
    }

    return {
      left: rect.left + offsetX,
      top: rect.top + offsetY,
      width: renderW,
      height: renderH
    };
  }

  function getNormalizedCoords(clientX, clientY) {
    const r = getImageRenderRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    if (clientX < r.left || clientX > r.left + r.width || clientY < r.top || clientY > r.top + r.height) {
      return null;
    }
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function updateVirtualCursor() {
    // Hidden per user request: only real Windows cursor is visible
  }

  function showTouchIndicator(x, y) {
    // Disabled per user request: only real Windows cursor is visible
  }

  function hideTouchIndicator() {
    // Disabled per user request
  }

  function bindInputs() {
    const container = State.container;
    if (!container) return;

    container.addEventListener('touchstart', (e) => {
      if (!State.isConnected) return;
      if (e.touches.length === 1) {
        State.isTwoFinger = false;
        State.hasMoved = false;
        const t = e.touches[0];
        State.touchStartX = t.clientX;
        State.touchStartY = t.clientY;
        State.touchStartTime = Date.now();

        if (State.mode === 'touch') {
          const coords = getNormalizedCoords(t.clientX, t.clientY);
          if (coords) {
            sendCommand({ type: 'mouse_move', x: coords.x, y: coords.y });
            clearTimeout(State.touchHoldTimer);
            State.touchHoldTimer = setTimeout(() => {
              if (navigator.vibrate) navigator.vibrate(60);
              sendCommand({ type: 'mouse_click', button: 'right' });
              State.touchHoldTimer = null;
            }, 500);
          }
        }
      } else if (e.touches.length === 2) {
        State.isTwoFinger = true;
        clearTimeout(State.touchHoldTimer);
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        State.pinchStartDist = Math.hypot(dx, dy);
        State.pinchStartScale = State.zoomScale;
        State.isPinching = false;
        State.lastTwoFingerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        State.lastTwoFingerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
      if (!State.isConnected) return;
      e.preventDefault();

      if (e.touches.length === 1 && !State.isTwoFinger) {
        const t = e.touches[0];
        const dx = t.clientX - State.touchStartX;
        const dy = t.clientY - State.touchStartY;

        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          clearTimeout(State.touchHoldTimer);
          State.hasMoved = true;
        }

        if (State.mode === 'touch') {
          const coords = getNormalizedCoords(t.clientX, t.clientY);
          if (coords) {
            sendCommand({ type: 'mouse_move', x: coords.x, y: coords.y });
          }
        } else if (State.mode === 'trackpad') {
          const speed = 0.0012;
          State.cursorX = Math.max(0, Math.min(1, State.cursorX + dx * speed));
          State.cursorY = Math.max(0, Math.min(1, State.cursorY + dy * speed));
          sendCommand({ type: 'mouse_move', x: State.cursorX, y: State.cursorY });
          State.touchStartX = t.clientX;
          State.touchStartY = t.clientY;
        }
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        const distDiff = Math.abs(currentDist - State.pinchStartDist);

        if (distDiff > 14 || State.isPinching) {
          State.isPinching = true;
          const newScale = State.pinchStartScale * (currentDist / State.pinchStartDist);
          setZoom(newScale);
        } else {
          // Two finger scroll or pan when zoomed
          const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const currentX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const deltaY = currentY - State.lastTwoFingerY;
          const deltaX = currentX - State.lastTwoFingerX;

          if (State.zoomScale > 1.05) {
            State.panX += deltaX / State.zoomScale;
            State.panY += deltaY / State.zoomScale;
            applyZoom();
          } else if (Math.abs(deltaY) > 8) {
            sendCommand({ type: 'mouse_wheel', delta: deltaY > 0 ? 120 : -120 });
          }
          State.lastTwoFingerY = currentY;
          State.lastTwoFingerX = currentX;
        }
      }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
      if (!State.isConnected) return;
      if (e.touches.length < 2) {
        State.isPinching = false;
      }
      setTimeout(hideTouchIndicator, 200);

      clearTimeout(State.touchHoldTimer);
      const elapsed = Date.now() - State.touchStartTime;

      if (!State.isTwoFinger && !State.hasMoved && elapsed < 350) {
        if (State.mode === 'touch') {
          const coords = getNormalizedCoords(State.touchStartX, State.touchStartY);
          if (coords) {
            sendCommand({ type: 'mouse_move', x: coords.x, y: coords.y });
            sendCommand({ type: 'mouse_click', button: 'left' });
          }
        } else if (State.mode === 'trackpad') {
          // [사용자 요청] 트랙패드 모드에서 더블 클릭(더블 탭) 시 마우스 왼쪽 버튼 클릭
          const now = Date.now();
          const timeSinceLastTap = now - (State.lastTrackpadTapTime || 0);
          const tapDist = Math.hypot(
            (State.touchStartX || 0) - (State.lastTrackpadTapX || 0),
            (State.touchStartY || 0) - (State.lastTrackpadTapY || 0)
          );

          if (timeSinceLastTap > 30 && timeSinceLastTap < 450 && tapDist < 50) {
            // 더블 탭(더블 클릭) 감지 성공!
            if (navigator.vibrate) navigator.vibrate(40);
            sendCommand({ type: 'mouse_click', button: 'left' });
            State.lastTrackpadTapTime = 0; // 리셋
          } else {
            // 1차 탭 기록
            State.lastTrackpadTapTime = now;
            State.lastTrackpadTapX = State.touchStartX;
            State.lastTrackpadTapY = State.touchStartY;
          }
        }
      }
    });

    // PC Mouse events
    State.canvas.addEventListener('mousemove', (e) => {
      if (!State.isConnected) return;
      const coords = getNormalizedCoords(e.clientX, e.clientY);
      if (coords) sendCommand({ type: 'mouse_move', x: coords.x, y: coords.y });
    });

    State.canvas.addEventListener('mousedown', (e) => {
      if (!State.isConnected) return;
      e.preventDefault();
      const btn = e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left');
      sendCommand({ type: 'mouse_down', button: btn });
    });

    State.canvas.addEventListener('mouseup', (e) => {
      if (!State.isConnected) return;
      e.preventDefault();
      const btn = e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left');
      sendCommand({ type: 'mouse_up', button: btn });
    });

    State.canvas.addEventListener('wheel', (e) => {
      if (!State.isConnected) return;
      e.preventDefault();
      sendCommand({ type: 'mouse_wheel', delta: e.deltaY < 0 ? 120 : -120 });
    }, { passive: false });

    State.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function bindUI() {
    const btnTouch = document.getElementById('rdBtnTouch');
    const btnTrackpad = document.getElementById('rdBtnTrackpad');
    const trackpadBar = document.getElementById('rdTrackpadBar');

    if (btnTouch && btnTrackpad && trackpadBar) {
      btnTouch.addEventListener('click', () => {
        State.mode = 'touch';
        btnTouch.classList.add('active');
        btnTrackpad.classList.remove('active');
        trackpadBar.classList.remove('active');
        if (State.virtualCursor) State.virtualCursor.style.display = 'none';
      });

      btnTrackpad.addEventListener('click', () => {
        State.mode = 'trackpad';
        btnTrackpad.classList.add('active');
        btnTouch.classList.remove('active');
        trackpadBar.classList.add('active');
        if (State.virtualCursor) {
          State.virtualCursor.style.display = 'block';
          updateVirtualCursor();
        }
      });
    }

    // Trackpad Bar
    const bLeft = document.getElementById('rdTrackpadLeft');
    const bRight = document.getElementById('rdTrackpadRight');
    const bWheelUp = document.getElementById('rdTrackpadWheelUp');
    const bWheelDown = document.getElementById('rdTrackpadWheelDown');

    if (bLeft) bLeft.addEventListener('click', () => sendCommand({ type: 'mouse_click', button: 'left' }));
    if (bRight) bRight.addEventListener('click', () => sendCommand({ type: 'mouse_click', button: 'right' }));
    if (bWheelUp) bWheelUp.addEventListener('click', () => sendCommand({ type: 'mouse_wheel', delta: 120 }));
    if (bWheelDown) bWheelDown.addEventListener('click', () => sendCommand({ type: 'mouse_wheel', delta: -120 }));

    // PIN Connect
    const btnConnect = document.getElementById('rdBtnConnect');
    if (btnConnect) {
      btnConnect.addEventListener('click', () => {
        const pinVal = document.getElementById('rdPinInput').value.trim();
        const urlVal = document.getElementById('rdUrlInput').value.trim();
        State.pin = pinVal || '8805';

        const cur = State.deviceList.find(d => d.id === State.currentDeviceId);
        if (cur) {
          cur.url = urlVal;
          cur.pin = State.pin;
          saveDevices();
        }
        connectToDevice(State.currentDeviceId);
      });
    }

    // Device Select
    const devSelect = document.getElementById('rdDeviceSelect');
    if (devSelect) {
      devSelect.addEventListener('change', (e) => {
        connectToDevice(e.target.value);
      });
    }

    // Add Device Modal
    const addDevModal = document.getElementById('rdDeviceModal');
    const btnAddDev = document.getElementById('rdBtnAddDevice');
    const btnCloseDev = document.getElementById('rdBtnCloseDeviceModal');
    const btnSaveDev = document.getElementById('rdBtnSaveDevice');

    if (btnAddDev && addDevModal) {
      btnAddDev.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addDevModal.classList.add('show');
        addDevModal.classList.add('active');
      });
    }
    if (btnCloseDev && addDevModal) {
      btnCloseDev.addEventListener('click', () => {
        addDevModal.classList.remove('show');
        addDevModal.classList.remove('active');
      });
    }
    if (addDevModal) {
      addDevModal.addEventListener('click', (e) => {
        if (e.target === addDevModal) {
          addDevModal.classList.remove('show');
          addDevModal.classList.remove('active');
        }
      });
    }
    if (btnSaveDev && addDevModal) {
      btnSaveDev.addEventListener('click', () => {
        const name = document.getElementById('rdNewDevName').value.trim();
        const url = document.getElementById('rdNewDevUrl').value.trim();
        const pin = document.getElementById('rdNewDevPin').value.trim() || '8805';
        if (!name) return alert('노트북 이름을 입력하세요.');

        const newId = 'dev_' + Date.now();
        State.deviceList.push({ id: newId, name: `💻 ${name}`, url, pin });
        saveDevices();
        addDevModal.classList.remove('show');
        addDevModal.classList.remove('active');
        connectToDevice(newId);
      });
    }

    // Virtual Keyboard Drawer & Real-Time Typing Engine
    const kbdDrawer = document.getElementById('rdKeyboardDrawer');
    const btnKbdToggle = document.getElementById('rdBtnKbdToggle');
    const btnCloseKbd = document.getElementById('rdBtnCloseKbd');
    const btnSendText = document.getElementById('rdBtnSendText');
    const btnClearKbd = document.getElementById('rdBtnClearKbd');
    const quickInput = document.getElementById('rdQuickTextInput');

    if (btnKbdToggle && kbdDrawer) {
      btnKbdToggle.addEventListener('click', () => {
        kbdDrawer.classList.toggle('active');
        if (kbdDrawer.classList.contains('active') && quickInput) {
          quickInput.focus();
        }
      });
    }
    if (btnCloseKbd && kbdDrawer) {
      btnCloseKbd.addEventListener('click', () => kbdDrawer.classList.remove('active'));
    }

    if (btnClearKbd && quickInput) {
      btnClearKbd.addEventListener('click', () => {
        quickInput.value = '';
        quickInput.focus();
      });
    }

    if (quickInput) {
      let isComposing = false;
      let lastVal = '';

      // [실시간 타이핑 1] 한글 IME 조합 처리
      quickInput.addEventListener('compositionstart', () => {
        isComposing = true;
      });

      quickInput.addEventListener('compositionend', (e) => {
        isComposing = false;
        if (!State.isConnected) return;
        // 조합이 완료된 한글 글자를 즉시 원격으로 타이핑!
        if (e.data) {
          sendCommand({ type: 'type_text', text: e.data });
        }
        quickInput.value = '';
        lastVal = '';
      });

      // [실시간 타이핑 2] 영문, 숫자, 특수기호, 붙여넣기 실시간 전송
      quickInput.addEventListener('input', (e) => {
        if (!State.isConnected) return;
        if (isComposing) return; // 한글 조합 중에는 compositionend에서 완료 시 전송

        const currentVal = quickInput.value;
        if (currentVal.length > lastVal.length) {
          // 새로 타이핑된 글자 추출
          const added = currentVal.slice(lastVal.length);
          sendCommand({ type: 'type_text', text: added });
        } else if (currentVal.length < lastVal.length) {
          // 글자가 지워진 경우 (백스페이스)
          const diff = lastVal.length - currentVal.length;
          for (let i = 0; i < diff; i++) {
            sendCommand({ type: 'key_down', key: 'backspace' });
            setTimeout(() => sendCommand({ type: 'key_up', key: 'backspace' }), 15);
          }
        }

        if (currentVal.length > 25) {
          quickInput.value = '';
          lastVal = '';
        } else {
          lastVal = currentVal;
        }
      });

      // [실시간 타이핑 3] 특수 제어키 (Enter, Backspace, Tab, Esc) 즉시 직통 전송
      quickInput.addEventListener('keydown', (e) => {
        if (!State.isConnected) return;

        if (e.key === 'Enter') {
          e.preventDefault();
          sendCommand({ type: 'key_down', key: 'enter' });
          setTimeout(() => sendCommand({ type: 'key_up', key: 'enter' }), 20);
          quickInput.value = '';
          lastVal = '';
        } else if (e.key === 'Backspace' && quickInput.value === '') {
          // 입력창이 비어있는 상태에서 백스페이스를 누르면 노트북의 직전 글자 삭제
          e.preventDefault();
          sendCommand({ type: 'key_down', key: 'backspace' });
          setTimeout(() => sendCommand({ type: 'key_up', key: 'backspace' }), 15);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          sendCommand({ type: 'key_down', key: 'tab' });
          setTimeout(() => sendCommand({ type: 'key_up', key: 'tab' }), 20);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          sendCommand({ type: 'key_down', key: 'escape' });
          setTimeout(() => sendCommand({ type: 'key_up', key: 'escape' }), 20);
        }
      });

      // 수동 전송 버튼 (긴 문단이나 복사본 일괄 전송용)
      if (btnSendText) {
        btnSendText.addEventListener('click', () => {
          const txt = quickInput.value;
          if (txt) {
            sendCommand({ type: 'type_text', text: txt });
            quickInput.value = '';
            lastVal = '';
          }
        });
      }
    }

    // [실시간 타이핑 4] PC/외부 물리 키보드 다이렉트 패스스루
    window.addEventListener('keydown', (e) => {
      if (!State.isConnected) return;
      // 일반 입력 필드나 모달에 포커스 중일 때는 패스스루 제외
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        const map = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };
        sendCommand({ type: 'key_down', key: map[key] });
        setTimeout(() => sendCommand({ type: 'key_up', key: map[key] }), 25);
      } else if (['enter', 'backspace', 'tab', 'escape'].includes(key)) {
        e.preventDefault();
        sendCommand({ type: 'key_down', key });
        setTimeout(() => sendCommand({ type: 'key_up', key }), 25);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        sendCommand({ type: 'type_text', text: e.key });
      }
    });

    // Key chips
    document.querySelectorAll('.rd-key-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        const combo = btn.getAttribute('data-combo');
        if (combo) {
          sendCommand({ type: 'combo', keys: combo.split(',') });
        } else if (key) {
          sendCommand({ type: 'key_down', key });
          setTimeout(() => sendCommand({ type: 'key_up', key }), 50);
        }
      });
    });

    // Zoom Controls
    const btnZoomIn = document.getElementById('rdBtnZoomIn');
    const btnZoomOut = document.getElementById('rdBtnZoomOut');
    const btnZoomReset = document.getElementById('rdBtnZoomReset');
    const btnFloatZoomIn = document.getElementById('rdBtnFloatZoomIn');
    const btnFloatZoomOut = document.getElementById('rdBtnFloatZoomOut');
    const btnFloatZoomReset = document.getElementById('rdBtnFloatZoomReset');

    if (btnZoomIn) btnZoomIn.addEventListener('click', () => zoomIn());
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => zoomOut());
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => zoomReset());
    if (btnFloatZoomIn) btnFloatZoomIn.addEventListener('click', () => zoomIn());
    if (btnFloatZoomOut) btnFloatZoomOut.addEventListener('click', () => zoomOut());
    if (btnFloatZoomReset) btnFloatZoomReset.addEventListener('click', () => zoomReset());

    // Settings Modal
    const settingsModal = document.getElementById('rdSettingsModal');
    const btnSettings = document.getElementById('rdBtnSettings');
    const btnCloseSettings = document.getElementById('rdBtnCloseSettings');
    const btnSaveSettings = document.getElementById('rdBtnSaveSettings');

    if (btnSettings && settingsModal) {
      btnSettings.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        settingsModal.classList.add('show');
        settingsModal.classList.add('active');
      });
    }
    if (btnCloseSettings && settingsModal) {
      btnCloseSettings.addEventListener('click', () => {
        settingsModal.classList.remove('show');
        settingsModal.classList.remove('active');
      });
    }
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
          settingsModal.classList.remove('show');
          settingsModal.classList.remove('active');
        }
      });
    }
    if (btnSaveSettings && settingsModal) {
      btnSaveSettings.addEventListener('click', () => {
        const quality = document.getElementById('rdSettingQuality').value;
        const fps = document.getElementById('rdSettingFps').value;
        const scale = document.getElementById('rdSettingScale').value;
        sendCommand({
          type: 'settings',
          quality: parseInt(quality, 10),
          fps: parseInt(fps, 10),
          scale: parseFloat(scale)
        });
        settingsModal.classList.remove('show');
        settingsModal.classList.remove('active');
      });
    }

    // Aspect Ratio & Fit Mode Selector
    const ratioSelect = document.getElementById('rdRatioSelect');
    if (ratioSelect) {
      ratioSelect.value = State.fitMode;
      ratioSelect.addEventListener('change', (e) => {
        applyRatioMode(e.target.value);
        localStorage.setItem('kostat_rd_ratio_mode', e.target.value);
      });
    }

    // Native Mobile Fullscreen
    const btnFullscreen = document.getElementById('rdBtnFullscreen');
    const btnFloatExit = document.getElementById('rdBtnFloatExitFs');
    const btnFloatToggleBar = document.getElementById('rdBtnFloatToggleBar');

    function enterFullscreen() {
      const viewer = document.getElementById('viewRemoteDesktop');
      const docEl = document.documentElement;
      if (viewer) viewer.classList.add('fullscreen-mode');

      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    }

    function exitFullscreen() {
      const viewer = document.getElementById('viewRemoteDesktop');
      if (viewer) {
        viewer.classList.remove('fullscreen-mode');
        viewer.classList.remove('toolbar-collapsed');
      }
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    }

    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        const viewer = document.getElementById('viewRemoteDesktop');
        if (viewer && viewer.classList.contains('fullscreen-mode')) {
          exitFullscreen();
        } else {
          enterFullscreen();
        }
      });
    }

    if (btnFloatExit) {
      btnFloatExit.addEventListener('click', exitFullscreen);
    }

    if (btnFloatToggleBar) {
      btnFloatToggleBar.addEventListener('click', () => {
        const viewer = document.getElementById('viewRemoteDesktop');
        if (viewer) viewer.classList.toggle('toolbar-collapsed');
      });
    }

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        const viewer = document.getElementById('viewRemoteDesktop');
        if (viewer) {
          viewer.classList.remove('fullscreen-mode');
          viewer.classList.remove('toolbar-collapsed');
        }
      }
    });

    document.addEventListener('webkitfullscreenchange', () => {
      if (!document.webkitFullscreenElement) {
        const viewer = document.getElementById('viewRemoteDesktop');
        if (viewer) {
          viewer.classList.remove('fullscreen-mode');
          viewer.classList.remove('toolbar-collapsed');
        }
      }
    });
  }

  return {
    init: init,
    connect: connectToDevice,
    disconnect: disconnect,
    autoConnect: fetchAutoDiscoveryAndConnect
  };
})();
