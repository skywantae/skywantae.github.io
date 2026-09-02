/**
 * KOSTAT ERP Mobile App - Standalone Offline-Ready & Real-Time Sync Engine
 * Galaxy Z Fold 8 Optimized for Overseas Business Trips
 * (Supports 100% Offline Local DB + Real-Time Live Cloud OTA Sync)
 */

const AppState = {
  // 내장 로컬 데이터베이스
  skyworksData: [],
  shipPlanData: [],
  quotationsData: [],
  knowledgeData: [],
  
  // 상태
  dbReady: false,
  isSyncing: false,
  lastSyncTime: null,
  activeTab: 'chat',
  selectedQuotNo: null
};

// --- DOM 엘리먼트 ---
const DOM = {
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  chatContainer: document.getElementById('chatContainer'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  panelChat: document.getElementById('panelChat'),
  panelViewer: document.getElementById('panelViewer'),
  bottomNavBar: document.getElementById('bottomNavBar'),
  
  // Skyworks
  skyworksTable: document.getElementById('skyworksTable'),
  skyworksTbody: document.getElementById('skyworksTbody'),
  skyworksCount: document.getElementById('skyworksCount'),
  skyworksSearchInput: document.getElementById('skyworksSearchInput'),
  skyworksYearSelect: document.getElementById('skyworksYearSelect'),
  btnSkyworksReload: document.getElementById('btnSkyworksReload'),

  // Ship Plan
  shipPlanTable: document.getElementById('shipPlanTable'),
  shipPlanTbody: document.getElementById('shipPlanTbody'),
  shipPlanPartInput: document.getElementById('shipPlanPartInput'),
  btnSearchShipPlan: document.getElementById('btnSearchShipPlan'),

  // Quotations
  quotHistoryCount: document.getElementById('quotHistoryCount'),
  quotationSearchInput: document.getElementById('quotationSearchInput'),
  btnSearchQuotations: document.getElementById('btnSearchQuotations'),
  btnReloadQuotHistory: document.getElementById('btnReloadQuotHistory'),
  quotationsTable: document.getElementById('quotationsTable'),
  quotationsTbody: document.getElementById('quotationsTbody'),
  quotDetailModal: document.getElementById('quotDetailModal'),
  modalQuotTitle: document.getElementById('modalQuotTitle'),
  modalQuotBody: document.getElementById('modalQuotBody'),
  btnCloseQuotModal: document.getElementById('btnCloseQuotModal'),
  btnModalClose: document.getElementById('btnModalClose'),
  btnModalPrintQuot: document.getElementById('btnModalPrintQuot'),
  btnModalCopyQuotText: document.getElementById('btnModalCopyQuotText'),

  // Settings & Refresh
  btnSettings: document.getElementById('btnSettings'),
  btnRefresh: document.getElementById('btnRefresh'),
  settingsModal: document.getElementById('settingsModal'),
  btnCloseSettingsModal: document.getElementById('btnCloseSettingsModal'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  currentAppVersion: document.getElementById('currentAppVersion')
};

// --- IndexedDB 스토리지 헬퍼 (영구 고속 캐시) ---
const IDB = {
  dbName: 'KostatMobileDB',
  version: 1,
  db: null,

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tables')) {
          db.createObjectStore('tables');
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = () => resolve(null);
    });
  },

  async get(key) {
    try {
      const db = await this.open();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('tables', 'readonly');
        const store = tx.objectStore('tables');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  async set(key, val) {
    try {
      const db = await this.open();
      if (!db) return;
      const tx = db.transaction('tables', 'readwrite');
      tx.objectStore('tables').put(val, key);
    } catch (e) {
      console.warn('IDB save error:', e);
    }
  }
};

// --- 초기화 ---
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await loadInitialDatabases();
  
  // 환영 메시지 시간
  const now = new Date();
  const welcomeTime = document.getElementById('welcomeTime');
  if (welcomeTime) {
    welcomeTime.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  // 앱 시작 2초 후 실시간 백그라운드 클라우드 동기화 시도
  setTimeout(() => {
    syncLiveDatabases(false);
  }, 2000);
});

// --- 1. 초기 데이터베이스 로드 (Zero-Latency 번들 우선 + 캐시 병합) ---
async function loadInitialDatabases() {
  updateStatus(false, '데이터 로딩 중...');
  try {
    // 1. 번들된 전역 JS 객체 우선 바인딩 (Zero Latency, 100% 보장)
    if (window.KOSTAT_SKYWORKS_DATA && window.KOSTAT_SKYWORKS_DATA.length > 0) {
      AppState.skyworksData = window.KOSTAT_SKYWORKS_DATA;
    }
    if (window.KOSTAT_SHIPPLAN_DATA && window.KOSTAT_SHIPPLAN_DATA.length > 0) {
      AppState.shipPlanData = window.KOSTAT_SHIPPLAN_DATA;
    }
    if (window.KOSTAT_QUOTATIONS_DATA && window.KOSTAT_QUOTATIONS_DATA.length > 0) {
      AppState.quotationsData = window.KOSTAT_QUOTATIONS_DATA;
    }
    if (window.KOSTAT_KNOWLEDGE_DATA && window.KOSTAT_KNOWLEDGE_DATA.length > 0) {
      AppState.knowledgeData = window.KOSTAT_KNOWLEDGE_DATA;
    }
    // 3. IndexedDB의 더 최신 캐시가 있다면 갱신
    const cachedSky = await IDB.get('skyworks');
    if (cachedSky && cachedSky.length >= AppState.skyworksData.length) AppState.skyworksData = cachedSky;
    
    const cachedShip = await IDB.get('shipplan');
    if (cachedShip && cachedShip.length >= AppState.shipPlanData.length) AppState.shipPlanData = cachedShip;
    
    const cachedQuot = await IDB.get('quotations');
    if (cachedQuot && cachedQuot.length >= AppState.quotationsData.length) AppState.quotationsData = cachedQuot;

    AppState.dbReady = true;
    const total = AppState.skyworksData.length + AppState.shipPlanData.length + AppState.quotationsData.length;
    updateStatus(true, `✈️ 내장 DB 준비됨 (${total.toLocaleString()}건)`);
    
    // UI 초기 렌더링
    renderSkyworksTable(AppState.skyworksData);
    initSkyworksYears();
    renderQuotHistory();

    console.log(`[DB Ready] Skyworks: ${AppState.skyworksData.length}, ShipPlan: ${AppState.shipPlanData.length}, Quotations: ${AppState.quotationsData.length}`);
  } catch (err) {
    console.error('DB Load Error:', err);
    updateStatus(true, '내장 DB 준비 완료');
  }
}

// --- 2. 실시간 클라우드 / GitHub OTA 데이터 동기화 ---
async function syncLiveDatabases(isManual = false) {
  if (AppState.isSyncing) return;
  AppState.isSyncing = true;

  if (isManual) {
    showToast('🔄 최신 데이터베이스 동기화 확인 중...');
    updateStatus(false, '동기화 확인 중...');
  }

  const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/skywantae/KOSTAT-ERP-Chatbot/main/mobile_app/src/data';
  const timestamp = Date.now();

  try {
    const fetchPromises = [
      fetch(`${GITHUB_RAW_BASE}/skyworks_data.json?t=${timestamp}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${GITHUB_RAW_BASE}/shipplan_data.json?t=${timestamp}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${GITHUB_RAW_BASE}/quotations_data.json?t=${timestamp}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${GITHUB_RAW_BASE}/knowledge_data.json?t=${timestamp}`).then(r => r.ok ? r.json() : null).catch(() => null)
    ];

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([null, null, null, null]), 6000));
    const [liveSky, liveShip, liveQuot, liveKnow] = await Promise.race([Promise.all(fetchPromises), timeoutPromise]);

    let updated = false;

    if (liveSky && Array.isArray(liveSky) && liveSky.length > 0) {
      if (liveSky.length !== AppState.skyworksData.length) {
        AppState.skyworksData = liveSky;
        await IDB.set('skyworks', liveSky);
        updated = true;
      }
    }

    if (liveShip && Array.isArray(liveShip) && liveShip.length > 0) {
      if (liveShip.length !== AppState.shipPlanData.length) {
        AppState.shipPlanData = liveShip;
        await IDB.set('shipplan', liveShip);
        updated = true;
      }
    }

    if (liveQuot && Array.isArray(liveQuot) && liveQuot.length > 0) {
      if (liveQuot.length !== AppState.quotationsData.length) {
        AppState.quotationsData = liveQuot;
        await IDB.set('quotations', liveQuot);
        updated = true;
      }
    }

    if (liveKnow && Array.isArray(liveKnow) && liveKnow.length > 0) {
      AppState.knowledgeData = liveKnow;
      await IDB.set('knowledge', liveKnow);
    }

    AppState.lastSyncTime = new Date();
    const totalCount = AppState.skyworksData.length + AppState.shipPlanData.length + AppState.quotationsData.length;

    if (updated) {
      renderSkyworksTable(AppState.skyworksData);
      initSkyworksYears();
      renderQuotHistory();
      updateStatus(true, `⚡ 실시간 최신화 완료 (${totalCount.toLocaleString()}건)`);
      showToast(`🎉 최신 데이터(${totalCount.toLocaleString()}건)가 실시간 반영되었습니다!`);
    } else {
      updateStatus(true, `✈️ 최신 데이터 작동 중 (${totalCount.toLocaleString()}건)`);
      if (isManual) {
        showToast('✅ 이미 최신 데이터베이스 상태입니다.');
      }
    }
  } catch (e) {
    const totalCount = AppState.skyworksData.length + AppState.shipPlanData.length + AppState.quotationsData.length;
    updateStatus(true, `✈️ 내장 데이터 작동 중 (${totalCount.toLocaleString()}건)`);
    if (isManual) {
      showToast('오프라인 상태입니다. (내장 DB 정상 작동)');
    }
  } finally {
    AppState.isSyncing = false;
  }
}

function updateStatus(isOnline, text) {
  DOM.statusDot.className = isOnline ? 'status-dot online' : 'status-dot';
  DOM.statusText.textContent = text;
}

// --- UI 이벤트 바인딩 ---
function initUI() {
  // 챗봇 입력
  DOM.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = DOM.chatInput.value.trim();
    if (!msg) return;
    DOM.chatInput.value = '';
    handleLocalChatCommand(msg);
  });

  // 퀵 액션 칩
  document.querySelectorAll('.quick-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd.endsWith(' ')) {
        DOM.chatInput.value = cmd;
        DOM.chatInput.focus();
      } else {
        handleLocalChatCommand(cmd);
      }
    });
  });

  // 하단 탭 바 (커버 화면 모드)
  document.querySelectorAll('.nav-tab-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.getAttribute('data-tab');
      switchMobileTab(tab);
    });
  });

  // 우측 뷰어 상단 탭
  document.querySelectorAll('.viewer-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      switchViewerCard(targetId);
    });
  });

  // Skyworks 필터
  DOM.skyworksSearchInput.addEventListener('input', debounce(filterSkyworksTable, 200));
  DOM.skyworksYearSelect.addEventListener('change', filterSkyworksTable);
  DOM.btnSkyworksReload.addEventListener('click', () => {
    DOM.skyworksSearchInput.value = '';
    DOM.skyworksYearSelect.value = '';
    renderSkyworksTable(AppState.skyworksData);
    syncLiveDatabases(true);
  });

  // 출하계획 검색
  DOM.btnSearchShipPlan.addEventListener('click', () => {
    const pn = DOM.shipPlanPartInput.value.trim();
    if (pn) searchShipPlanLocal(pn);
  });
  DOM.shipPlanPartInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const pn = DOM.shipPlanPartInput.value.trim();
      if (pn) searchShipPlanLocal(pn);
    }
  });

  // 견적서 검색 & 필터
  if (DOM.btnSearchQuotations) {
    DOM.btnSearchQuotations.addEventListener('click', filterQuotationsTable);
  }
  if (DOM.quotationSearchInput) {
    DOM.quotationSearchInput.addEventListener('input', debounce(filterQuotationsTable, 200));
    DOM.quotationSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterQuotationsTable();
    });
  }

  // 견적서 모달 이벤트
  DOM.btnCloseQuotModal.addEventListener('click', () => DOM.quotDetailModal.classList.remove('show'));
  DOM.btnModalClose.addEventListener('click', () => DOM.quotDetailModal.classList.remove('show'));
  DOM.btnReloadQuotHistory.addEventListener('click', () => {
    if (DOM.quotationSearchInput) DOM.quotationSearchInput.value = '';
    renderQuotHistory();
    syncLiveDatabases(true);
  });
  if (DOM.btnModalPrintQuot) {
    DOM.btnModalPrintQuot.addEventListener('click', () => {
      window.print();
    });
  }
  if (DOM.btnModalCopyQuotText) {
    DOM.btnModalCopyQuotText.addEventListener('click', () => {
      copyCurrentQuotationSummary();
    });
  }

  // 설정 모달
  DOM.btnSettings.addEventListener('click', () => {
    DOM.settingsModal.classList.add('show');
  });
  if (DOM.btnCloseSettingsModal) {
    DOM.btnCloseSettingsModal.addEventListener('click', () => DOM.settingsModal.classList.remove('show'));
  }
  if (DOM.btnCloseSettings) {
    DOM.btnCloseSettings.addEventListener('click', () => DOM.settingsModal.classList.remove('show'));
  }

  // 상단 헤더 새로고침 (PWA 캐시 초기화 + 실시간 OTA 동기화)
  DOM.btnRefresh.addEventListener('click', async () => {
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (e) {}
    }
    showToast('🔄 최신 버전으로 화면을 새로고침합니다...');
    setTimeout(() => window.location.reload(), 400);
  });
}

// --- 3. 로컬 챗봇 엔진 (오프라인 실시간 검색) ---
function handleLocalChatCommand(text) {
  appendUserMessage(text);
  
  const clean = text.trim();
  const lower = clean.replace(/ /g, '').toLowerCase();

  // 1. Skyworks
  if (lower.includes('스카이웍스') || lower.includes('skyworks')) {
    appendBotMessage({
      sender: 'KOSTAT 봇',
      text: `✈️ **[Skyworks PO 현황]**\n내장된 **${AppState.skyworksData.length.toLocaleString()}건**의 Skyworks PO 데이터를 우측 패널 또는 'Skyworks' 탭에서 즉시 확인하실 수 있습니다.`
    });
    switchMobileTab('skyworks');
    return;
  }

  // 2. 출하조회 / 선적조회
  if (['출하조회', '출하검색', '선적조회', '선적검색', '선적계획', '출하', '선적'].some(p => lower.startsWith(p))) {
    let query = clean;
    for (const prefix of ['출하조회', '출하검색', '출하 조회', '출하 검색', '선적조회', '선적 조회', '선적계획', '선적 계획', '출하', '선적']) {
      if (query.startsWith(prefix)) {
        query = query.slice(prefix.length).trim();
        break;
      }
    }
    const pn = query.replace(/^[: ]+/, '');
    if (!pn) {
      appendBotMessage({ sender: 'KOSTAT 봇', text: '조회할 부품번호(Part No)를 입력해주세요. (예: 출하조회 880520)' });
    } else {
      searchShipPlanInChat(pn);
    }
    return;
  }

  // 3. 견적서 검색
  if (['견적서검색', '견적서조회', '견적검색', '견적조회', '견적서열기', '견적서', '견적'].some(p => lower.startsWith(p)) || (lower.includes('견적') && (lower.includes('검색') || lower.includes('조회') || lower.includes('단가')))) {
    let query = clean;
    for (const prefix of ['견적서 검색', '견적서검색', '견적서 조회', '견적서조회', '견적 검색', '견적검색', '견적 조회', '견적조회', '견적서', '견적']) {
      if (query.startsWith(prefix)) {
        query = query.slice(prefix.length).trim();
        break;
      }
    }
    for (const suffix of ['견적서 검색', '견적서검색', '검색', '조회', '찾아줘', '보여줘']) {
      if (query.endsWith(suffix)) {
        query = query.slice(0, -suffix.length).trim();
        break;
      }
    }
    const part = query.replace(/^[: ]+/, '');
    if (!part) {
      appendBotMessage({ 
        sender: 'KOSTAT 봇', 
        text: `📋 **[견적서 검색 화면으로 이동합니다]**\n내장된 **${AppState.quotationsData.length.toLocaleString()}건**의 견적서 뷰어에서 부품번호 또는 고객사명을 검색하세요.` 
      });
      switchMobileTab('quotations');
      if (DOM.quotationSearchInput) {
        setTimeout(() => DOM.quotationSearchInput.focus(), 150);
      }
    } else {
      searchQuotationsInChat(part);
    }
    return;
  }

  // 4. 견적서 이력
  if (clean.startsWith('/견적서이력') || lower.includes('견적서이력') || lower.includes('생성이력')) {
    appendBotMessage({
      sender: 'KOSTAT 봇',
      text: `📋 **[견적서 이력]**\n내장된 **${AppState.quotationsData.length.toLocaleString()}건**의 견적서 데이터베이스를 확인하실 수 있습니다.`
    });
    switchMobileTab('quotations');
    return;
  }

  // 5. 사내 FAQ / RAG 지식 검색
  const faqResult = searchLocalFAQ(clean.replace(/^\/질문\s*/, ''));
  if (faqResult) {
    appendBotMessage({ sender: 'KOSTAT 봇', text: faqResult });
    return;
  }

  // 6. 만약 부품번호를 직접 입력한 경우 자동 검색 (예: '880520', 'KS-880520')
  if (/^[a-zA-Z0-9\-_]{3,}$/.test(clean)) {
    const qNorm = clean.replace(/[-_\s]/g, '').toLowerCase();
    const hasQuot = AppState.quotationsData.some(r => (r.part_no || '').replace(/[-_\s]/g, '').toLowerCase().includes(qNorm));
    const hasShip = AppState.shipPlanData.some(r => (r.k || '').replace(/[-_\s]/g, '').toLowerCase().includes(qNorm));

    if (hasQuot || hasShip) {
      if (hasQuot) searchQuotationsInChat(clean);
      if (hasShip) searchShipPlanInChat(clean);
      return;
    }
  }

  // 7. 기본 안내
  appendBotMessage({
    sender: 'KOSTAT 봇',
    text: `💡 **명령어 안내**\n• **출하조회 [부품명]** (예: 출하조회 880520)\n• **견적서 검색 [부품명]** (예: 견적서 검색 880520)\n• **스카이웍스** - Skyworks 7,300+건 PO 현황\n• **/질문 [검색어]** (예: /질문 EXW, /질문 위탁재고)`
  });
}

// 출하 계획 로컬 고속 검색 (채팅용 - 하이픈/공백 정규화 지원)
function searchShipPlanInChat(pn) {
  const qClean = pn.toLowerCase().trim();
  const qNorm = qClean.replace(/[-_\s]/g, '');

  const matched = AppState.shipPlanData.filter(r => {
    const k = (r.k || '').toLowerCase();
    const p = (r.p || '').toLowerCase();
    const c = (r.c || '').toLowerCase();

    if (k.includes(qClean) || p.includes(qClean) || c.includes(qClean)) return true;
    if (qNorm.length >= 2) {
      if (k.replace(/[-_\s]/g, '').includes(qNorm) || p.replace(/[-_\s]/g, '').includes(qNorm)) return true;
    }
    return false;
  });

  if (matched.length === 0) {
    appendBotMessage({
      sender: 'KOSTAT 봇',
      text: `❌ '${pn}' 관련 출하/선적 계획 데이터를 찾을 수 없습니다.`
    });
    return;
  }

  const shipPlans = matched.slice(0, 10).map(r => ({
    ex_date: r.e,
    ship_date: r.s,
    customer: r.c,
    po_no: r.p,
    part_no: r.k,
    po_qty: r.q ? Number(r.q).toLocaleString() : '0',
    balance: r.b ? Number(r.b).toLocaleString() : '0'
  }));

  appendBotMessage({
    sender: 'KOSTAT 봇',
    text: `📦 **'${pn}' 출하 계획 검색 결과 (총 ${matched.length.toLocaleString()}건 중 최신 10건)**`,
    ship_plans: shipPlans
  });
}

// 견적서 로컬 고속 검색 (채팅용 - 하이픈/공백 정규화 지원)
function searchQuotationsInChat(part) {
  const qClean = part.toLowerCase().trim();
  const qNorm = qClean.replace(/[-_\s]/g, '');

  const matched = AppState.quotationsData.filter(r => {
    const p = (r.part_no || '').toLowerCase();
    const d = (r.description || '').toLowerCase();
    const v = (r.vend_name || '').toLowerCase();
    const n = (r.quot_no || '').toLowerCase();
    const rm = (r.remarks || '').toLowerCase();

    if (p.includes(qClean) || d.includes(qClean) || v.includes(qClean) || n.includes(qClean) || rm.includes(qClean)) return true;
    if (qNorm.length >= 2) {
      if (p.replace(/[-_\s]/g, '').includes(qNorm) || d.replace(/[-_\s]/g, '').includes(qNorm) || n.replace(/[-_\s]/g, '').includes(qNorm)) return true;
    }
    return false;
  });

  if (matched.length === 0) {
    appendBotMessage({
      sender: 'KOSTAT 봇',
      text: `❌ '${part}' 관련 견적서 데이터를 찾을 수 없습니다.`
    });
    return;
  }

  const quots = matched.slice(0, 8).map(r => ({
    quot_no: r.quot_no,
    quot_date: r.quot_date,
    vend_name: r.vend_name,
    part_no: r.part_no,
    description: r.description,
    price: r.price,
    unit: r.unit || 'USD',
    remarks: r.remarks
  }));

  appendBotMessage({
    sender: 'KOSTAT 봇',
    text: `💰 **'${part}' 견적서 검색 결과 (총 ${matched.length.toLocaleString()}건 중 최신 8건)**`,
    quotations: quots
  });
}

// 사내 FAQ 로컬 2-gram 검색
function searchLocalFAQ(query) {
  if (!AppState.knowledgeData || AppState.knowledgeData.length === 0) return null;
  const qClean = query.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  if (!qClean) return null;

  let bestMatch = null;
  let maxScore = 0;

  for (const item of AppState.knowledgeData) {
    const title = (item.question || item.title || '').toLowerCase();
    const answer = (item.answer || item.content || '').toLowerCase();
    
    let score = 0;
    if (title.includes(qClean)) score += 10;
    if (answer.includes(qClean)) score += 3;

    if (score > maxScore) {
      maxScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && maxScore >= 3) {
    return `📚 **[사내 규정/FAQ] ${bestMatch.question || bestMatch.title}**\n\n${bestMatch.answer || bestMatch.content}`;
  }
  return null;
}

// --- 4. Skyworks PO 뷰어 로컬 렌더링 ---
function initSkyworksYears() {
  const years = [...new Set(AppState.skyworksData.map(r => {
    const d = r.exfactorydate || r.shipdate || r.order_date || '';
    return d.length >= 4 ? d.slice(0, 4) : '';
  }).filter(Boolean))].sort().reverse();

  DOM.skyworksYearSelect.innerHTML = `<option value="">전체 연도</option>` + years.map(y => `<option value="${y}">${y}년</option>`).join('');
}

function renderSkyworksTable(rows) {
  if (!rows || rows.length === 0) {
    DOM.skyworksTbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">Skyworks 데이터가 없습니다.</td></tr>`;
    DOM.skyworksCount.textContent = '0건';
    return;
  }

  DOM.skyworksCount.textContent = `${rows.length.toLocaleString()}건`;
  const sliced = rows.slice(0, 150);

  DOM.skyworksTbody.innerHTML = sliced.map(r => {
    const exDate = r.exfactorydate || r.ex_date || r.order_date || '-';
    const shipDate = r.shipdate || r.ship_date || r.delivery_date || '-';
    const pono = r.pono || r.po_no || '-';
    const pn = r.kostat_pn || r.part_no || r.item || '-';
    const qty = r.poqty || r.qty || 0;
    const price = r.unit_price || r.price || '-';
    const amount = r.amount || '-';
    const bal = r.balance !== undefined ? r.balance : '-';

    return `
      <tr>
        <td>${formatDate(exDate)}</td>
        <td>${formatDate(shipDate)}</td>
        <td style="font-weight:600;color:#60a5fa;">${pono}</td>
        <td>${pn}</td>
        <td style="text-align:right;">${Number(qty) ? Number(qty).toLocaleString() : qty}</td>
        <td style="text-align:right;">${price}</td>
        <td style="text-align:right;color:#34d399;">${amount !== '-' && Number(amount) ? Number(amount).toLocaleString() : amount}</td>
        <td><span class="count-badge">${Number(bal) > 0 ? `잔여 ${Number(bal).toLocaleString()}` : '완료'}</span></td>
      </tr>
    `;
  }).join('');
}

function filterSkyworksTable() {
  const search = DOM.skyworksSearchInput.value.toLowerCase().trim();
  const searchNorm = search.replace(/[-_\s]/g, '');
  const year = DOM.skyworksYearSelect.value;
  
  let filtered = AppState.skyworksData;
  if (year) {
    filtered = filtered.filter(r => {
      const d = r.exfactorydate || r.shipdate || r.order_date || '';
      return d.startsWith(year);
    });
  }
  if (search) {
    filtered = filtered.filter(r => {
      const str = JSON.stringify(r).toLowerCase();
      if (str.includes(search)) return true;
      if (searchNorm.length >= 2 && str.replace(/[-_\s]/g, '').includes(searchNorm)) return true;
      return false;
    });
  }
  renderSkyworksTable(filtered);
}

// --- 5. 출하 및 선적 계획 뷰어 (로컬 검색) ---
function searchShipPlanLocal(pn) {
  const qClean = pn.toLowerCase().trim();
  const qNorm = qClean.replace(/[-_\s]/g, '');
  DOM.shipPlanTbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">조회 중...</td></tr>`;

  const matched = AppState.shipPlanData.filter(r => {
    const k = (r.k || '').toLowerCase();
    const p = (r.p || '').toLowerCase();
    const c = (r.c || '').toLowerCase();

    if (k.includes(qClean) || p.includes(qClean) || c.includes(qClean)) return true;
    if (qNorm.length >= 2) {
      if (k.replace(/[-_\s]/g, '').includes(qNorm) || p.replace(/[-_\s]/g, '').includes(qNorm)) return true;
    }
    return false;
  });

  if (matched.length === 0) {
    DOM.shipPlanTbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">일치하는 출하 데이터가 없습니다: '${escapeHtml(pn)}'</td></tr>`;
    return;
  }

  DOM.shipPlanTbody.innerHTML = matched.slice(0, 100).map(r => `
    <tr>
      <td>${formatDate(r.e)}</td>
      <td>${formatDate(r.s)}</td>
      <td>${r.c || '-'}</td>
      <td style="font-weight:600;color:#60a5fa;">${r.p || '-'}</td>
      <td>${r.k || '-'}</td>
      <td style="text-align:right;">${r.q ? Number(r.q).toLocaleString() : '0'}</td>
      <td style="text-align:right;color:#34d399;">${r.b ? Number(r.b).toLocaleString() : '0'}</td>
    </tr>
  `).join('');
}

// --- 6. 견적서 뷰어 & 상세 모달 (로컬) ---
function renderQuotHistory() {
  renderQuotationsTable(AppState.quotationsData);
}

function renderQuotationsTable(rows) {
  if (!DOM.quotationsTbody) return;
  
  if (!rows || rows.length === 0) {
    DOM.quotationsTbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">일치하는 견적서 데이터가 없습니다.</td></tr>`;
    DOM.quotHistoryCount.textContent = '0건';
    return;
  }

  DOM.quotHistoryCount.textContent = `${rows.length.toLocaleString()}건`;
  const sliced = rows.slice(0, 150);

  DOM.quotationsTbody.innerHTML = sliced.map(q => `
    <tr onclick="openQuotationDetail('${escapeHtml(q.quot_no)}')" style="cursor:pointer;" class="erp-copyable-cell">
      <td style="font-weight:700;color:#60a5fa;">${escapeHtml(q.quot_no)}</td>
      <td>${escapeHtml(q.quot_date || '-')}</td>
      <td style="font-weight:600;">${escapeHtml(q.vend_name || '-')}</td>
      <td style="color:#38bdf8;">${escapeHtml(q.part_no || '-')}</td>
      <td>${escapeHtml(q.description || '-')}</td>
      <td style="text-align:right;color:#34d399;font-weight:600;">${escapeHtml(q.price)} ${escapeHtml(q.unit || 'USD')}</td>
      <td style="color:#94a3b8;font-size:11px;">${escapeHtml(q.remarks || '-')}</td>
    </tr>
  `).join('');
}

function filterQuotationsTable() {
  if (!DOM.quotationSearchInput) return;
  const search = DOM.quotationSearchInput.value.toLowerCase().trim();
  const searchNorm = search.replace(/[-_\s]/g, '');

  if (!search) {
    renderQuotationsTable(AppState.quotationsData);
    return;
  }

  const filtered = AppState.quotationsData.filter(r => {
    const p = (r.part_no || '').toLowerCase();
    const d = (r.description || '').toLowerCase();
    const v = (r.vend_name || '').toLowerCase();
    const n = (r.quot_no || '').toLowerCase();
    const rm = (r.remarks || '').toLowerCase();

    if (p.includes(search) || d.includes(search) || v.includes(search) || n.includes(search) || rm.includes(search)) return true;
    if (searchNorm.length >= 2) {
      if (p.replace(/[-_\s]/g, '').includes(searchNorm) || d.replace(/[-_\s]/g, '').includes(searchNorm) || n.replace(/[-_\s]/g, '').includes(searchNorm)) return true;
    }
    return false;
  });

  renderQuotationsTable(filtered);
}

function openQuotationDetail(quotNo) {
  AppState.selectedQuotNo = quotNo;
  DOM.modalQuotTitle.textContent = `📋 견적서 상세 정보 [${quotNo}]`;
  
  const found = AppState.quotationsData.filter(r => r.quot_no === quotNo);
  if (found.length === 0) {
    DOM.modalQuotBody.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;">'${quotNo}' 견적서 상세 데이터를 찾을 수 없습니다.</div>`;
    DOM.quotDetailModal.classList.add('show');
    return;
  }

  const h = found[0];
  
  // PC 버전(QuotationViewerWindow)과 100% 동일한 ERP 격자 테이블 구성
  DOM.modalQuotBody.innerHTML = `
    <div class="erp-quotation-sheet" id="printableQuotation">
      <div class="erp-sheet-header-title">
        <div>
          <h2>QUOTATION (견적서)</h2>
          <div class="sub-meta">KOSTAT CO., LTD. Official Quotation Document</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:13px;color:#1e3a8a;">No: ${escapeHtml(h.quot_no)}</div>
          <div style="font-size:11px;color:#64748b;">Date: ${escapeHtml(h.quot_date || '-')} | Issuer: ${escapeHtml(h.username || '-')}</div>
        </div>
      </div>

      <!-- ERP 공식 격자 헤더 테이블 (PC 버전 100% 동일) -->
      <table class="erp-grid-table">
        <tbody>
          <tr>
            <td class="erp-lbl-blue">Quotation No. :</td>
            <td class="erp-val-cell erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.quot_no)}')" style="font-weight:700;color:#1e40af;">${escapeHtml(h.quot_no)}</td>
            <td class="erp-lbl-blue">User Name :</td>
            <td class="erp-val-cell erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.username || '')}')">${escapeHtml(h.username || '-')}</td>
            <td class="erp-lbl-blue">Approved :</td>
            <td class="erp-val-cell"></td>
          </tr>
          <tr>
            <td class="erp-lbl-gray-light">Country :</td>
            <td class="erp-val-cell erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.country || '')}')">${escapeHtml(h.country || '-')}</td>
            <td class="erp-lbl-gray-light">Issuing Date :</td>
            <td class="erp-val-cell erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.quot_date || '')}')">${escapeHtml(h.quot_date || '-')}</td>
            <td class="erp-lbl-gray-light"></td>
            <td class="erp-val-cell"></td>
          </tr>
          <tr>
            <td class="erp-lbl-gray-light">Messers :</td>
            <td class="erp-val-cell erp-copyable-cell" colspan="5" onclick="copyCellText('${escapeHtml(h.vend_name || '')}')" style="font-weight:700;">${escapeHtml(h.vend_name || '-')}</td>
          </tr>
          <tr>
            <td class="erp-lbl-gray-light">Attention :</td>
            <td class="erp-val-cell erp-copyable-cell" colspan="5" onclick="copyCellText('${escapeHtml(h.attention || '')}')">${escapeHtml(h.attention || '-')}</td>
          </tr>
          <tr>
            <td class="erp-lbl-gray-dark">Subject :</td>
            <td class="erp-val-cell erp-val-highlight erp-copyable-cell" colspan="5" onclick="copyCellText('${escapeHtml(h.title || '')}')">${escapeHtml(h.title || 'KOSTAT Tray quotation')}</td>
          </tr>
          <tr style="height:3px;background:#cbd5e1;"><td colspan="6" style="padding:0;border:none;background:#cbd5e1;height:3px;"></td></tr>
          <tr>
            <td class="erp-lbl-gray-dark">1) Leadtime :</td>
            <td class="erp-val-cell erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.delivery || '')}')">${escapeHtml(h.delivery || '-')}</td>
            <td class="erp-lbl-gray-light">6) Validity :</td>
            <td class="erp-val-cell erp-copyable-cell" colspan="3" onclick="copyCellText('${escapeHtml(h.validity || '')}')">${escapeHtml(h.validity || '-')}</td>
          </tr>
          <tr>
            <td class="erp-lbl-gray-dark">2) Payment Term :</td>
            <td class="erp-val-cell erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.payment_term || '')}')">${escapeHtml(h.payment_term || '-')}</td>
            <td class="erp-lbl-gray-light">7) Remark :</td>
            <td class="erp-val-cell erp-copyable-cell" colspan="3" onclick="copyCellText('${escapeHtml(h.remark || '')}')">${escapeHtml(h.remark || '-')}</td>
          </tr>
          <tr>
            <td class="erp-lbl-gray-dark">3) Price Term :</td>
            <td class="erp-val-cell erp-copyable-cell" colspan="5" onclick="copyCellText('${escapeHtml(h.price_term || '')}')">${escapeHtml(h.price_term || '-')}</td>
          </tr>
          <tr>
            <td class="erp-lbl-gray-dark">4) Origin :</td>
            <td class="erp-val-cell erp-copyable-cell" colspan="5" onclick="copyCellText('${escapeHtml(h.origin || '')}')">${escapeHtml(h.origin || '-')}</td>
          </tr>
        </tbody>
      </table>

      <!-- ERP 품목 디테일 테이블 (PC 버전 100% 동일) -->
      <div style="font-weight:700;margin:10px 0 6px 0;color:#1e3a8a;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;">
        <span>📋 ITEM DETAILS (총 ${found.length}개 품목)</span>
        <span style="font-size:11px;color:#64748b;font-weight:400;">각 칸을 터치하면 내용이 복사됩니다</span>
      </div>

      <div class="erp-detail-table-wrapper">
        <table class="erp-detail-table">
          <thead>
            <tr>
              <th style="width:22%;">PART NO.</th>
              <th style="width:40%;">DESCRIPTION</th>
              <th style="width:14%;text-align:right;">PRICE</th>
              <th style="width:10%;">UNIT</th>
              <th style="width:14%;">REMARKS</th>
            </tr>
          </thead>
          <tbody>
            ${found.map(d => `
              <tr>
                <td class="erp-copyable-cell" style="font-weight:700;text-align:center;color:#1e40af;" onclick="copyCellText('${escapeHtml(d.part_no || '')}')">${escapeHtml(d.part_no || '-')}</td>
                <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(d.description || '')}')">${escapeHtml(d.description || '-')}</td>
                <td class="erp-copyable-cell" style="text-align:right;font-weight:700;color:#047857;" onclick="copyCellText('${escapeHtml(d.price || '')}')">${escapeHtml(d.price || '-')}</td>
                <td class="erp-copyable-cell" style="text-align:center;" onclick="copyCellText('${escapeHtml(d.unit || '')}')">${escapeHtml(d.unit || 'USD')}</td>
                <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(d.remarks || '')}')">${escapeHtml(d.remarks || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  DOM.quotDetailModal.classList.add('show');
}

function copyCellText(text) {
  if (!text || text === '-') return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`📋 복사됨: ${text}`);
    }).catch(() => {
      showToast(`복사됨: ${text}`);
    });
  } else {
    showToast(`복사됨: ${text}`);
  }
}

function copyCurrentQuotationSummary() {
  if (!AppState.selectedQuotNo) return;
  const found = AppState.quotationsData.filter(r => r.quot_no === AppState.selectedQuotNo);
  if (found.length === 0) return;
  
  const h = found[0];
  let text = `[QUOTATION / 견적서]\n`;
  text += `• Quotation No: ${h.quot_no}\n`;
  text += `• Date: ${h.quot_date}\n`;
  text += `• Customer: ${h.vend_name}\n`;
  text += `• Attention: ${h.attention || '-'}\n`;
  text += `• Subject: ${h.title || '-'}\n`;
  text += `• Leadtime: ${h.delivery || '-'}\n`;
  text += `• Payment: ${h.payment_term || '-'}\n`;
  text += `• Price Term: ${h.price_term || '-'}\n`;
  text += `• Origin: ${h.origin || '-'}\n`;
  text += `• Validity: ${h.validity || '-'}\n\n`;
  text += `[ITEM DETAILS]\n`;
  found.forEach((d, idx) => {
    text += `${idx + 1}. ${d.part_no} | ${d.description} | ${d.price} ${d.unit} | ${d.remarks || ''}\n`;
  });

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('🎉 견적서 전체 요약이 클립보드에 복사되었습니다!');
    });
  } else {
    showToast('클립보드 복사 완료!');
  }
}

// --- 8. 탭 및 네비게이션 ---
function switchMobileTab(tab) {
  AppState.activeTab = tab;
  document.querySelectorAll('.nav-tab-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });

  const isLargeScreen = window.innerWidth >= 681;
  if (!isLargeScreen) {
    if (tab === 'chat') {
      DOM.panelChat.style.display = 'flex';
      DOM.panelViewer.style.display = 'none';
    } else {
      DOM.panelChat.style.display = 'none';
      DOM.panelViewer.style.display = 'flex';
      
      const tabTargetMap = {
        'skyworks': 'viewSkyworks',
        'shipplan': 'viewShipPlan',
        'quotations': 'viewQuotations'
      };
      switchViewerCard(tabTargetMap[tab] || 'viewSkyworks');
    }
  } else {
    const tabTargetMap = {
      'skyworks': 'viewSkyworks',
      'shipplan': 'viewShipPlan',
      'quotations': 'viewQuotations'
    };
    if (tabTargetMap[tab]) {
      switchViewerCard(tabTargetMap[tab]);
    }
  }
}

function switchViewerCard(targetId) {
  document.querySelectorAll('.viewer-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
  });
  document.querySelectorAll('.viewer-content-card').forEach(card => {
    card.classList.toggle('active', card.id === targetId);
  });
}

// --- 메시지 출력 헬퍼 ---
function appendUserMessage(text) {
  const timeStr = getCurrentTimeStr();
  const div = document.createElement('div');
  div.className = 'chat-bubble user-msg';
  div.innerHTML = `
    <div class="bubble-header">
      <span class="bot-badge" style="color:#fff;">나</span>
      <span class="msg-time">${timeStr}</span>
    </div>
    <div class="bubble-content">${escapeHtml(text)}</div>
  `;
  DOM.chatContainer.appendChild(div);
  DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
}

function appendBotMessage(data) {
  const timeStr = getCurrentTimeStr();
  const div = document.createElement('div');
  div.className = 'chat-bubble bot-msg';
  
  let formattedText = renderMarkdown(data.text || '');
  let extraHtml = '';
  
  if (data.quotations && data.quotations.length > 0) {
    extraHtml += renderInlineQuotations(data.quotations);
  }
  if (data.ship_plans && data.ship_plans.length > 0) {
    extraHtml += renderInlineShipPlans(data.ship_plans);
  }

  div.innerHTML = `
    <div class="bubble-header">
      <span class="bot-badge">${escapeHtml(data.sender || 'KOSTAT 봇')}</span>
      <span class="msg-time">${timeStr}</span>
    </div>
    <div class="bubble-content">
      ${formattedText}
      ${extraHtml}
    </div>
  `;
  
  DOM.chatContainer.appendChild(div);
  DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
}

function renderInlineQuotations(quotations) {
  let rowsHtml = quotations.map(q => `
    <tr onclick="openQuotationDetail('${q.quot_no}')" style="cursor:pointer;">
      <td style="font-weight:600;color:#60a5fa;">${q.quot_no}</td>
      <td>${q.quot_date || '-'}</td>
      <td>${escapeHtml(q.vend_name || '-')}</td>
      <td>${escapeHtml(q.part_no || q.description || '-')}</td>
      <td style="text-align:right;color:#34d399;">${q.price} ${q.unit || 'USD'}</td>
    </tr>
  `).join('');

  return `
    <div class="inline-data-card">
      <div class="inline-card-header">
        <span>💰 조회된 견적서 (${quotations.length}건)</span>
        <span style="font-size:10px;color:#94a3b8;">터치하여 상세 보기</span>
      </div>
      <table class="inline-table">
        <thead>
          <tr><th>견적번호</th><th>견적일</th><th>고객사</th><th>부품명</th><th style="text-align:right;">단가</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function renderInlineShipPlans(shipPlans) {
  let rowsHtml = shipPlans.map(sp => `
    <tr>
      <td>${formatDate(sp.ex_date)}</td>
      <td>${formatDate(sp.ship_date)}</td>
      <td>${escapeHtml(sp.customer || '-')}</td>
      <td style="color:#60a5fa;font-weight:600;">${sp.po_no || '-'}</td>
      <td style="text-align:right;">${sp.po_qty}</td>
    </tr>
  `).join('');

  return `
    <div class="inline-data-card">
      <div class="inline-card-header">
        <span>📦 출하/선적 계획 (${shipPlans.length}건)</span>
      </div>
      <table class="inline-table">
        <thead>
          <tr><th>출고일</th><th>선적일</th><th>고객사</th><th>PO번호</th><th style="text-align:right;">수량</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

// --- 유틸 ---
function formatDate(d) {
  if (!d) return '-';
  const s = String(d).trim();
  if (s.length === 8 && /^\d+$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

function getCurrentTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
    background: rgba(30, 41, 59, 0.95); color: #fff; padding: 8px 16px;
    border-radius: 20px; font-size: 12px; font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 999;
    backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
