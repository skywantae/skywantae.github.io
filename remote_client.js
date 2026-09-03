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

    // Load saved URL for default
    const savedUrl = localStorage.getItem('kostat_remote_last_url') || '';
    const urlEl = document.getElementById('rdUrlInput');
    if (urlEl && savedUrl) urlEl.value = savedUrl;

    // Zero-Touch Auto-Discovery: Check for online siege-mode laptop and auto-connect
    fetchAutoDiscoveryAndConnect();
  }

  async function fetchAutoDiscoveryAndConnect() {
    if (State.isConnected) return;
    updateStatus(false, '한국 노트북 탐색 중...');
    let info = null;

    // 1. Real-time GitHub API (zero cache, instant)
    try {
      const apiEndpoint = `https://api.github.com/repos/skywantae/skywantae.github.io/contents/remote_host.json?t=${Date.now()}`;
      const apiRes = await fetch(apiEndpoint, { cache: 'no-store' });
      if (apiRes.ok) {
        const ghJson = await apiRes.json();
        if (ghJson && ghJson.content) {
          const rawStr = decodeURIComponent(escape(atob(ghJson.content.replace(/\s/g, ''))));
          info = JSON.parse(rawStr);
        }
      }
    } catch (e) {
      console.log('[Auto-Discovery] API fetch failed, trying raw fallback:', e);
    }

    // 2. Raw endpoint fallback
    if (!info) {
      try {
        const rawEndpoint = `https://raw.githubusercontent.com/skywantae/skywantae.github.io/main/remote_host.json?t=${Date.now()}`;
        const rawRes = await fetch(rawEndpoint, { cache: 'no-store' });
        if (rawRes.ok) {
          info = await rawRes.json();
        }
      } catch (e) {
        console.log('[Auto-Discovery] Raw fallback failed:', e);
      }
    }

    if (info) {
      let targetDevId = null;

      // Multi-device parsing
      if (info.devices && typeof info.devices === 'object') {
        Object.entries(info.devices).forEach(([devId, devInfo]) => {
          let dev = State.deviceList.find(d => d.id === devId);
          const devName = devInfo.name || `💻 ${devId}`;
          if (dev) {
            dev.name = devName;
            dev.url = devInfo.active_url;
            dev.pin = devInfo.pin || '8805';
            dev.status = devInfo.status || 'online';
          } else {
            State.deviceList.push({
              id: devId,
              name: devName,
              url: devInfo.active_url,
              pin: devInfo.pin || '8805',
              status: devInfo.status || 'online'
            });
          }
          if (devInfo.status === 'online' && !targetDevId) {
            targetDevId = devId;
          }
        });
      }

      // Root single-device support
      if (info.status === 'online' && info.active_url) {
        let defaultDev = State.deviceList.find(d => d.id === 'dev_default');
        const defaultName = info.device_name || '💻 내 노트북 (시즈모드 1)';
        if (defaultDev) {
          defaultDev.name = defaultName;
          defaultDev.url = info.active_url;
          defaultDev.pin = info.pin || '8805';
        } else {
          State.deviceList.unshift({
            id: 'dev_default',
            name: defaultName,
            url: info.active_url,
            pin: info.pin || '8805'
          });
        }
        if (!targetDevId) targetDevId = 'dev_default';
      }

      saveDevices();

      if (targetDevId) {
        console.log('[Auto-Discovery] Auto connecting to:', targetDevId);
        State.pin = State.deviceList.find(d => d.id === targetDevId)?.pin || '8805';
        const pinEl = document.getElementById('rdPinInput');
        if (pinEl) pinEl.value = State.pin;
        const urlEl = document.getElementById('rdUrlInput');
        if (urlEl) urlEl.value = State.deviceList.find(d => d.id === targetDevId)?.url || '';

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
        updateStatus(false, '접속 실패');
        if (State.container) State.container.classList.remove('connected');
        if (authError) {
          authError.textContent = '노트북에 연결할 수 없습니다. Cloudflare URL 또는 로컬 주소를 확인하세요.';
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

        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          clearTimeout(State.touchHoldTimer);
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

      if (State.touchHoldTimer) {
        clearTimeout(State.touchHoldTimer);
        const elapsed = Date.now() - State.touchStartTime;
        if (elapsed < 300) {
          if (State.mode === 'touch') {
            const coords = getNormalizedCoords(State.touchStartX, State.touchStartY);
            if (coords) {
              sendCommand({ type: 'mouse_move', x: coords.x, y: coords.y });
              sendCommand({ type: 'mouse_click', button: 'left' });
            }
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

    // Virtual Keyboard Drawer
    const kbdDrawer = document.getElementById('rdKeyboardDrawer');
    const btnKbdToggle = document.getElementById('rdBtnKbdToggle');
    const btnCloseKbd = document.getElementById('rdBtnCloseKbd');
    const btnSendText = document.getElementById('rdBtnSendText');
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
    if (btnSendText && quickInput) {
      btnSendText.addEventListener('click', () => {
        const txt = quickInput.value;
        if (txt) {
          sendCommand({ type: 'type_text', text: txt });
          quickInput.value = '';
        }
      });
      quickInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const txt = quickInput.value;
          if (txt) {
            sendCommand({ type: 'type_text', text: txt });
            quickInput.value = '';
          }
        }
      });
    }

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
