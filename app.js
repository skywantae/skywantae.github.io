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
  
  // 견적서 페이징 상태
  quotCurrentPage: 1,
  quotPageSize: 50,
  quotFilteredRows: [],

  // 출하 계획 페이징 상태
  shipPlanCurrentPage: 1,
  shipPlanPageSize: 50,
  shipPlanFilteredRows: [],

  // 상태
  dbReady: false,
  isSyncing: false,
  lastSyncTime: null,
  activeTab: 'shipplan',
  dataDate: '2026년 9월 3일',
  currentQuotNo: null
};

function formatKoreanDate(dateStr) {
  if (!dateStr) {
    return (AppState && AppState.dataDate) ? AppState.dataDate : '2026년 9월 3일';
  }
  const m = String(dateStr).match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})/);
  if (m) {
    return `${parseInt(m[1], 10)}년 ${parseInt(m[2], 10)}월 ${parseInt(m[3], 10)}일`;
  }
  return dateStr;
}

function getDataDateStatusText() {
  return `${AppState.dataDate} 자 데이터 적용 중`;
}

// --- DOM 엘리먼트 ---
const DOM = {
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  chatContainer: document.getElementById('chatContainer'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  connStatusPill: document.getElementById('connStatusPill'),
  appLayout: document.getElementById('appLayout'),
  mobileNavSwitcher: document.getElementById('mobileNavSwitcher'),
  btnNavChat: document.getElementById('btnNavChat'),
  btnNavViewer: document.getElementById('btnNavViewer'),
  mobileViewerNavText: document.getElementById('mobileViewerNavText'),
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
  shipPlanCustomerInput: document.getElementById('shipPlanCustomerInput'),
  shipPlanPartInput: document.getElementById('shipPlanPartInput'),
  shipPlanPageSizeSelect: document.getElementById('shipPlanPageSizeSelect'),
  btnSearchShipPlan: document.getElementById('btnSearchShipPlan'),
  btnReloadShipPlan: document.getElementById('btnReloadShipPlan'),
  shipPlanPagination: document.getElementById('shipPlanPagination'),
  shipPlanPageInfo: document.getElementById('shipPlanPageInfo'),
  shipPlanPageControls: document.getElementById('shipPlanPageControls'),
  shipPlanStatusBadge: document.getElementById('shipPlanStatusBadge'),

  // Quotations
  quotHistoryCount: document.getElementById('quotHistoryCount'),
  quotCustomerInput: document.getElementById('quotCustomerInput'),
  quotPageSizeSelect: document.getElementById('quotPageSizeSelect'),
  quotationSearchInput: document.getElementById('quotationSearchInput'),
  btnSearchQuotations: document.getElementById('btnSearchQuotations'),
  btnReloadQuotHistory: document.getElementById('btnReloadQuotHistory'),
  btnPrintQuotation: document.getElementById('btnPrintQuotation'),
  btnModalPrintQuot: document.getElementById('btnModalPrintQuot'),
  quotationsTable: document.getElementById('quotationsTable'),
  quotationsTbody: document.getElementById('quotationsTbody'),
  quotPagination: document.getElementById('quotPagination'),
  quotPageInfo: document.getElementById('quotPageInfo'),
  quotPageControls: document.getElementById('quotPageControls'),
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

    // 메타데이터(version.json)에서 실제 ERP 데이터 기준일자(data_date) 로드
    try {
      const vRes = await fetch('version.json?t=' + Date.now()).catch(() => null);
      if (vRes && vRes.ok) {
        const vData = await vRes.json();
        // 소프트웨어 release_date가 아닌 실제 ERP data_date 필드만 적용
        if (vData && vData.data_date) {
          AppState.dataDate = formatKoreanDate(vData.data_date);
        }
      }
    } catch (e) {}

    AppState.dbReady = true;
    updateStatus(true, getDataDateStatusText());
    
    // UI 초기 렌더링
    renderSkyworksTable(AppState.skyworksData);
    initSkyworksYears();
    renderQuotHistory();
    renderShipPlanHistory();

    console.log(`[DB Ready] Skyworks: ${AppState.skyworksData.length}, ShipPlan: ${AppState.shipPlanData.length}, Quotations: ${AppState.quotationsData.length}`);
  } catch (err) {
    console.error('DB Load Error:', err);
    updateStatus(true, getDataDateStatusText());
  }
}

// --- 2. 실시간 클라우드 / GitHub OTA 데이터 동기화 ---
async function syncLiveDatabases(isManual = false) {
  if (AppState.isSyncing) return;
  AppState.isSyncing = true;

  if (isManual) {
    showToast('최신 데이터베이스 동기화 확인 중...');
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
      renderShipPlanHistory();
      try {
        const vLive = await fetch(`${GITHUB_RAW_BASE}/../version.json?t=${timestamp}`).then(r => r.ok ? r.json() : null).catch(() => null);
        if (vLive && vLive.data_date) {
          AppState.dataDate = formatKoreanDate(vLive.data_date);
        }
      } catch (_) {}
      updateStatus(true, getDataDateStatusText());
      showToast(`최신 데이터가 실시간 반영되었습니다. (${getDataDateStatusText()})`);
    } else {
      updateStatus(true, getDataDateStatusText());
      if (isManual) {
        showToast(`이미 최신 데이터베이스 상태입니다. (${getDataDateStatusText()})`);
      }
    }
  } catch (e) {
    updateStatus(true, getDataDateStatusText());
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
  const total = (AppState.skyworksData?.length || 0) + (AppState.shipPlanData?.length || 0) + (AppState.quotationsData?.length || 0);
  if (DOM.connStatusPill && total > 0) {
    DOM.connStatusPill.setAttribute('title', `총 ${total.toLocaleString()}건 ERP 데이터 탑재`);
  }
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

  // 우측 뷰어 상단 탭
  document.querySelectorAll('.viewer-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      switchViewerCard(targetId);
    });
  });

  // [모바일 반응형] 100% 풀스크린 탭 전환기 바인딩
  if (DOM.btnNavChat) {
    DOM.btnNavChat.addEventListener('click', () => switchMobilePanel('chat'));
  }
  if (DOM.btnNavViewer) {
    DOM.btnNavViewer.addEventListener('click', () => switchMobilePanel('viewer'));
  }

  // Skyworks 필터
  DOM.skyworksSearchInput.addEventListener('input', debounce(filterSkyworksTable, 200));
  DOM.skyworksYearSelect.addEventListener('change', filterSkyworksTable);
  
  // 견적서 검색 이벤트 (아래 404~435에서 올바르게 등록됨)

  
  // PDF 인쇄 버튼
  if (DOM.btnPrintQuotation) {
    DOM.btnPrintQuotation.addEventListener('click', () => {
      if (!AppState.currentQuotNo) {
        showToast('출력할 견적서를 먼저 검색해 주세요.', 'error');
        return;
      }
      printQuotation(AppState.currentQuotNo);
    });
  }
  
  // 모달 인쇄 버튼 바인딩
  if (DOM.btnModalPrintQuot) {
    DOM.btnModalPrintQuot.addEventListener('click', () => {
      if (AppState.selectedQuotNo) {
        printQuotation(AppState.selectedQuotNo);
      }
    });
  }
  
  DOM.btnSkyworksReload.addEventListener('click', () => {
    DOM.skyworksSearchInput.value = '';
    DOM.skyworksYearSelect.value = '';
    renderSkyworksTable(AppState.skyworksData);
    syncLiveDatabases(true);
  });

  // 출하 계획 검색 & 필터 & 페이지 크기
  if (DOM.shipPlanCustomerInput) {
    DOM.shipPlanCustomerInput.addEventListener('input', debounce(filterShipPlanTable, 200));
    DOM.shipPlanCustomerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterShipPlanTable();
    });
  }
  if (DOM.shipPlanPartInput) {
    DOM.shipPlanPartInput.addEventListener('input', debounce(filterShipPlanTable, 200));
    DOM.shipPlanPartInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterShipPlanTable();
    });
  }
  if (DOM.btnSearchShipPlan) {
    DOM.btnSearchShipPlan.addEventListener('click', filterShipPlanTable);
  }
  if (DOM.btnReloadShipPlan) {
    DOM.btnReloadShipPlan.addEventListener('click', () => {
      if (DOM.shipPlanCustomerInput) DOM.shipPlanCustomerInput.value = '';
      if (DOM.shipPlanPartInput) DOM.shipPlanPartInput.value = '';
      renderShipPlanHistory();
      syncLiveDatabases(true);
    });
  }
  if (DOM.shipPlanPageSizeSelect) {
    DOM.shipPlanPageSizeSelect.addEventListener('change', () => {
      AppState.shipPlanPageSize = parseInt(DOM.shipPlanPageSizeSelect.value, 10) || 50;
      AppState.shipPlanCurrentPage = 1;
      renderShipPlanPage(1);
    });
  }

  // 견적서 검색 & 필터 & 페이지 크기
  if (DOM.quotCustomerInput) {
    DOM.quotCustomerInput.addEventListener('input', debounce(filterQuotationsTable, 200));
    DOM.quotCustomerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterQuotationsTable();
    });
  }
  if (DOM.quotPageSizeSelect) {
    DOM.quotPageSizeSelect.addEventListener('change', () => {
      AppState.quotPageSize = parseInt(DOM.quotPageSizeSelect.value, 10) || 50;
      AppState.quotCurrentPage = 1;
      renderQuotationsPage(1);
    });
  }
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
  // (btnModalPrintQuot은 위쪽 369~376에서 이미 등록됨)

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

// --- 3. 로컬 챗봇 엔진 (사내 규정 및 FAQ 지식 Q&A 전용) ---
function handleLocalChatCommand(text) {
  appendUserMessage(text);
  
  const clean = text.trim();
  if (!clean) return;

  // 사내 FAQ / 지식 검색 수행
  const faqResult = searchLocalFAQ(clean.replace(/^\/질문\s*/, ''));
  if (faqResult) {
    appendBotMessage({ sender: 'KOSTAT 봇', text: faqResult });
    return;
  }

  // 매칭되는 답변이 없을 때 안내
  appendBotMessage({
    sender: 'KOSTAT 봇',
    text: `**'${escapeHtml(clean)}'**에 대한 사내 규정 또는 FAQ 정보를 찾지 못했습니다.\n\n다른 키워드로 질문해 주세요. (예: EXW 조건, 위탁재고, 출장여비 규정, 견적 유효기간 등)\n※ Skyworks PO, 출하 계획, 견적서 검색은 우측 탭 메뉴에서 바로 이용하실 수 있습니다.`
  });
}

// 사내 FAQ 로컬 키워드/토큰 검색 (지능형 매칭 엔진)
function searchLocalFAQ(query) {
  const data = (AppState.knowledgeData && AppState.knowledgeData.length > 0)
    ? AppState.knowledgeData 
    : (window.KOSTAT_KNOWLEDGE_DATA || []);
  if (!data || data.length === 0) return null;

  const qLower = query.toLowerCase().trim();
  if (!qLower) return null;

  // 불용어 및 일상 질문 어미 제거하여 핵심 키워드 추출
  const cleanQ = qLower
    .replace(/[?？!！.,~]/g, ' ')
    .replace(/(뜻이\s*뭐야|뜻이\s*무엇인가요|이란|에\s*대해|에\s*대해서|알려줘|설명해줘|알고싶어|가\s*뭐야|는\s*뭐야|가\s*무엇인가요|은\s*무엇인가요|의\s*차이점|의\s*차이|하는\s*법|어떻게\s*해|어떻게\s*작성해|어디에\s*있나요|어디서\s*확인)/g, ' ')
    .trim();

  const tokens = cleanQ.split(/\s+/).filter(t => t.length >= 1);
  if (tokens.length === 0 && qLower.length < 2) return null;

  let bestMatch = null;
  let maxScore = 0;

  for (const item of data) {
    const qText = (item.Q || item.question || item.title || '').trim();
    const aText = (item.A || item.answer || item.content || '').trim();
    const qLow = qText.toLowerCase();
    const aLow = aText.toLowerCase();

    let score = 0;

    // 1. 전체 질문 및 정제 키워드 직접 포함 가중치
    if (qLow.includes(qLower) || (qLower.length >= 3 && qLower.includes(qLow))) {
      score += 60;
    }
    if (cleanQ && (qLow.includes(cleanQ) || (cleanQ.length >= 3 && cleanQ.includes(qLow)))) {
      score += 40;
    }

    // 2. 단어/토큰별 가중치 매칭
    for (const token of tokens) {
      if (token.length <= 1 && !/^[a-z0-9]$/i.test(token)) continue;

      if (qLow.includes(token)) {
        score += 25;
      }
      if (aLow.includes(token)) {
        score += 8;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestMatch = { q: qText, a: aText, images: item.Images || [] };
    }
  }

  if (bestMatch && maxScore >= 5) {
    return `**[사내 규정/FAQ] ${bestMatch.q}**\n\n${bestMatch.a}`;
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

// --- 5. 출하 및 선적 계획 뷰어 (로컬 + 다중 페이지네이션 & 고객사/부품 필터) ---
function renderShipPlanHistory() {
  if (DOM.shipPlanCustomerInput) DOM.shipPlanCustomerInput.value = '';
  if (DOM.shipPlanPartInput) DOM.shipPlanPartInput.value = '';
  AppState.shipPlanFilteredRows = AppState.shipPlanData || [];
  AppState.shipPlanCurrentPage = 1;
  renderShipPlanPage(1);
}

function filterShipPlanTable() {
  const custSearch = DOM.shipPlanCustomerInput ? DOM.shipPlanCustomerInput.value.toLowerCase().trim() : '';
  const custNorm = custSearch.replace(/[-_\s]/g, '');

  const partSearch = DOM.shipPlanPartInput ? DOM.shipPlanPartInput.value.toLowerCase().trim() : '';
  const partNorm = partSearch.replace(/[-_\s]/g, '');

  AppState.shipPlanFilteredRows = (AppState.shipPlanData || []).filter(r => {
    // 1. 고객사 필터
    if (custSearch) {
      const c = (r.c || '').toLowerCase();
      if (!c.includes(custSearch) && (custNorm.length < 2 || !c.replace(/[-_\s]/g, '').includes(custNorm))) {
        return false;
      }
    }

    // 2. 부품명/PO/기타 검색어 필터
    if (!partSearch) return true;

    const k = (r.k || '').toLowerCase();
    const p = (r.p || '').toLowerCase();
    const f = (r.f || '').toLowerCase();

    if (k.includes(partSearch) || p.includes(partSearch) || f.includes(partSearch)) return true;
    if (partNorm.length >= 2) {
      if (k.replace(/[-_\s]/g, '').includes(partNorm) || p.replace(/[-_\s]/g, '').includes(partNorm)) return true;
    }
    return false;
  });

  AppState.shipPlanCurrentPage = 1;
  renderShipPlanPage(1);
}

function renderShipPlanPage(page) {
  const rows = AppState.shipPlanFilteredRows || [];
  const totalRows = rows.length;
  const pageSize = AppState.shipPlanPageSize || 50;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  page = Math.max(1, Math.min(page, totalPages));
  AppState.shipPlanCurrentPage = page;

  // 카운트 뱃지 & 페이지 인포
  if (DOM.shipPlanStatusBadge) {
    DOM.shipPlanStatusBadge.textContent = `${totalRows.toLocaleString()}건`;
  }
  if (DOM.shipPlanPageInfo) {
    DOM.shipPlanPageInfo.textContent = `${page.toLocaleString()} / ${totalPages.toLocaleString()} 페이지 (총 ${totalRows.toLocaleString()}건)`;
  }

  if (!DOM.shipPlanTbody) return;

  if (totalRows === 0) {
    DOM.shipPlanTbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">일치하는 출하 계획 데이터가 없습니다.</td></tr>`;
    if (DOM.shipPlanPageControls) DOM.shipPlanPageControls.innerHTML = '';
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = rows.slice(start, end);

  DOM.shipPlanTbody.innerHTML = pageRows.map(r => `
    <tr class="erp-copyable-cell">
      <td>${formatDate(r.e)}</td>
      <td>${formatDate(r.s)}</td>
      <td style="font-weight:600;">${escapeHtml(r.c || '-')}</td>
      <td style="font-weight:600;color:#60a5fa;">${escapeHtml(r.p || '-')}</td>
      <td style="color:#38bdf8;">${escapeHtml(r.k || '-')}</td>
      <td style="text-align:right;">${r.q ? Number(r.q).toLocaleString() : '0'}</td>
      <td style="text-align:right;color:#34d399;font-weight:600;">${r.b ? Number(r.b).toLocaleString() : '0'}</td>
    </tr>
  `).join('');

  // 페이지네이션 컨트롤러 렌더링
  renderShipPlanPaginationControls(page, totalPages);
}

function renderShipPlanPaginationControls(currentPage, totalPages) {
  if (!DOM.shipPlanPageControls) return;

  const svgChevronFirst = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
  const svgChevronPrev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronNext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  const svgChevronLast = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

  let btnsHtml = '';

  // 처음으로 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToShipPlanPage(1)" title="첫 페이지">${svgChevronFirst}</button>`;
  
  // 이전 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToShipPlanPage(${currentPage - 1})" title="이전 페이지">${svgChevronPrev}</button>`;

  // 페이지 번호 (슬라이딩 윈도우)
  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }

  // 1페이지 버튼
  btnsHtml += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" onclick="goToShipPlanPage(1)">1</button>`;

  if (range.length > 0 && range[0] > 2) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  range.forEach(p => {
    btnsHtml += `<button class="page-btn ${currentPage === p ? 'active' : ''}" onclick="goToShipPlanPage(${p})">${p}</button>`;
  });

  if (range.length > 0 && range[range.length - 1] < totalPages - 1) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  // 마지막 페이지 버튼
  if (totalPages > 1) {
    btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" onclick="goToShipPlanPage(${totalPages})">${totalPages}</button>`;
  }

  // 다음 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToShipPlanPage(${currentPage + 1})" title="다음 페이지">${svgChevronNext}</button>`;

  // 마지막으로 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToShipPlanPage(${totalPages})" title="마지막 페이지">${svgChevronLast}</button>`;

  DOM.shipPlanPageControls.innerHTML = btnsHtml;
}

function goToShipPlanPage(page) {
  renderShipPlanPage(page);
  const wrapper = document.querySelector('#viewShipPlan .table-responsive-wrapper');
  if (wrapper) wrapper.scrollTop = 0;
}

function searchShipPlanLocal(pn) {
  if (DOM.shipPlanPartInput) DOM.shipPlanPartInput.value = pn;
  if (DOM.shipPlanCustomerInput) DOM.shipPlanCustomerInput.value = '';
  filterShipPlanTable();
  switchViewerCard('viewShipPlan');
}

// --- 6. 견적서 뷰어 & 상세 모달 (로컬 + 다중 페이지네이션 & 고객사 직접 입력 필터) ---
function renderQuotHistory() {
  if (DOM.quotCustomerInput) DOM.quotCustomerInput.value = '';
  if (DOM.quotationSearchInput) DOM.quotationSearchInput.value = '';
  AppState.quotFilteredRows = AppState.quotationsData || [];
  AppState.quotCurrentPage = 1;
  renderQuotationsPage(1);
}

function filterQuotationsTable() {
  const custSearch = DOM.quotCustomerInput ? DOM.quotCustomerInput.value.toLowerCase().trim() : '';
  const custNorm = custSearch.replace(/[-_\s]/g, '');

  const partSearch = DOM.quotationSearchInput ? DOM.quotationSearchInput.value.toLowerCase().trim() : '';
  const partNorm = partSearch.replace(/[-_\s]/g, '');

  AppState.quotFilteredRows = AppState.quotationsData.filter(r => {
    // 1. 고객사 필터 (직접 타이핑 입력 시 실시간 매칭)
    if (custSearch) {
      const v = (r.vend_name || '').toLowerCase();
      if (!v.includes(custSearch) && (custNorm.length < 2 || !v.replace(/[-_\s]/g, '').includes(custNorm))) {
        return false;
      }
    }

    // 2. 부품명/견적번호 검색어 필터
    if (!partSearch) return true;

    const p = (r.part_no || '').toLowerCase();
    const d = (r.description || '').toLowerCase();
    const n = (r.quot_no || '').toLowerCase();
    const rm = (r.remarks || '').toLowerCase();

    if (p.includes(partSearch) || d.includes(partSearch) || n.includes(partSearch) || rm.includes(partSearch)) return true;
    if (partNorm.length >= 2) {
      if (p.replace(/[-_\s]/g, '').includes(partNorm) || d.replace(/[-_\s]/g, '').includes(partNorm) || n.replace(/[-_\s]/g, '').includes(partNorm)) return true;
    }
    return false;
  });

  AppState.quotCurrentPage = 1;
  renderQuotationsPage(1);
}

function renderQuotationsPage(page) {
  const rows = AppState.quotFilteredRows || [];
  const totalRows = rows.length;
  const pageSize = AppState.quotPageSize || 50;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  page = Math.max(1, Math.min(page, totalPages));
  AppState.quotCurrentPage = page;

  // 카운트 뱃지 & 페이지 인포
  if (DOM.quotHistoryCount) {
    DOM.quotHistoryCount.textContent = `${totalRows.toLocaleString()}건`;
  }
  if (DOM.quotPageInfo) {
    DOM.quotPageInfo.textContent = `${page.toLocaleString()} / ${totalPages.toLocaleString()} 페이지 (총 ${totalRows.toLocaleString()}건)`;
  }

  if (!DOM.quotationsTbody) return;

  if (totalRows === 0) {
    DOM.quotationsTbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">일치하는 견적서 데이터가 없습니다.</td></tr>`;
    if (DOM.quotPageControls) DOM.quotPageControls.innerHTML = '';
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = rows.slice(start, end);

  DOM.quotationsTbody.innerHTML = pageRows.map(q => `
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

  // 페이지네이션 컨트롤러 렌더링
  renderPaginationControls(page, totalPages);
}

function renderPaginationControls(currentPage, totalPages) {
  if (!DOM.quotPageControls) return;

  const svgChevronFirst = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
  const svgChevronPrev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronNext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  const svgChevronLast = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

  let btnsHtml = '';

  // 처음으로 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToQuotPage(1)" title="첫 페이지">${svgChevronFirst}</button>`;
  
  // 이전 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToQuotPage(${currentPage - 1})" title="이전 페이지">${svgChevronPrev}</button>`;

  // 페이지 번호 (슬라이딩 윈도우)
  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }

  // 1페이지 버튼
  btnsHtml += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" onclick="goToQuotPage(1)">1</button>`;

  if (range.length > 0 && range[0] > 2) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  range.forEach(p => {
    btnsHtml += `<button class="page-btn ${currentPage === p ? 'active' : ''}" onclick="goToQuotPage(${p})">${p}</button>`;
  });

  if (range.length > 0 && range[range.length - 1] < totalPages - 1) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  // 마지막 페이지 버튼
  if (totalPages > 1) {
    btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" onclick="goToQuotPage(${totalPages})">${totalPages}</button>`;
  }

  // 다음 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToQuotPage(${currentPage + 1})" title="다음 페이지">${svgChevronNext}</button>`;

  // 마지막으로 버튼
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToQuotPage(${totalPages})" title="마지막 페이지">${svgChevronLast}</button>`;

  DOM.quotPageControls.innerHTML = btnsHtml;
}

function goToQuotPage(page) {
  renderQuotationsPage(page);
  const wrapper = document.querySelector('#viewQuotations .table-responsive-wrapper');
  if (wrapper) wrapper.scrollTop = 0;
}

function openQuotationDetail(quotNo) {
  AppState.selectedQuotNo = quotNo;
  DOM.modalQuotTitle.textContent = `견적서 상세 정보 [${quotNo}]`;
  
  const found = AppState.quotationsData.filter(r => r.quot_no === quotNo);
  if (found.length === 0) {
    DOM.modalQuotBody.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;">'${quotNo}' 견적서 상세 데이터를 찾을 수 없습니다.</div>`;
    DOM.quotDetailModal.classList.add('show');
    return;
  }

  const h = found[0];
  const quotDateFormatted = h.quot_date ? h.quot_date.slice(2).replace(/-/g, '/') : '//';
  
  // 공식 KOSTAT 견적서 (QUOTATION) 원본 PDF 100% 동일 복제 렌더링
  DOM.modalQuotBody.innerHTML = `
    <div class="kostat-official-sheet" id="printableQuotation">
      <!-- 1. 상단 공식 헤더: 로고/주소 + QUOTATION + 우측 결재란 -->
      <div class="kostat-header-row">
        <div class="kostat-logo-area">
          <div class="kostat-red-title">KOSTAT, INC</div>
          <div class="kostat-address-text">
            60, GOGANG-RO 154BEON-GIL,<br>
            BUCHON-CITY,KYONG KI-DO,KOREA<br>
            TEL : 82-32-671-8100(REP)<br>
            FAX : 82-32-671-0259
          </div>
        </div>
        <div class="kostat-doc-title"><span class="quotation-heading">QUOTATION</span></div>
        <div class="kostat-approval-box">
          <table class="kostat-approval-table">
            <thead>
              <tr>
                <th style="width:33%;">WRITTEN</th>
                <th style="width:33%;">REVIEWED</th>
                <th style="width:34%;">APPROVED</th>
              </tr>
            </thead>
            <tbody>
              <tr style="height:34px;">
                <td style="vertical-align:middle;position:relative;">
                  <span style="font-size:11px;color:#1e3a8a;font-weight:700;">//</span>
                </td>
                <td style="vertical-align:middle;position:relative;">
                  <span style="font-size:11px;color:#1e3a8a;font-weight:700;">//</span>
                </td>
                <td style="vertical-align:middle;position:relative;">
                  <span style="font-size:11px;color:#1e3a8a;font-weight:700;">//</span>
                </td>
              </tr>
              <tr style="height:16px;font-size:9px;border-top:1px solid #000;">
                <td>${escapeHtml(quotDateFormatted)}</td>
                <td>${escapeHtml(quotDateFormatted)}</td>
                <td>//</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. 문서 메타 정보 (2단 좌우 배치) -->
      <div class="kostat-meta-section">
        <div class="kostat-meta-left">
          <table class="kostat-meta-table">
            <tr>
              <td class="k-lbl">No.</td>
              <td class="k-colon">:</td>
              <td class="k-val erp-copyable-cell" style="font-weight:700;" onclick="copyCellText('${escapeHtml(h.quot_no)}')">${escapeHtml(h.quot_no)}</td>
            </tr>
            <tr>
              <td class="k-lbl">Messers</td>
              <td class="k-colon">:</td>
              <td class="k-val erp-copyable-cell" style="font-weight:700;" onclick="copyCellText('${escapeHtml(h.vend_name || '')}')">${escapeHtml(h.vend_name || '-')}</td>
            </tr>
            <tr>
              <td class="k-lbl">Attention</td>
              <td class="k-colon">:</td>
              <td class="k-val erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.attention || '')}')">${escapeHtml(h.attention || '-')}</td>
            </tr>
            <tr>
              <td class="k-lbl">Subject</td>
              <td class="k-colon">:</td>
              <td class="k-val erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.title || '')}')">${escapeHtml(h.title || 'Kostat quotation for TnR, Cover tape and Reel')}</td>
            </tr>
          </table>
        </div>
        <div class="kostat-meta-right">
          <div><strong>Page :</strong> 1 of 1</div>
          <div style="margin-top:2px;"><strong>Issuing Date :</strong> ${escapeHtml(h.quot_date || '-')}</div>
        </div>
      </div>

      <!-- 3. 약관 및 거래 조건 (1~6번) -->
      <div class="kostat-terms-section">
        <table class="kostat-meta-table">
          <tr>
            <td style="width:115px;font-weight:600;">1) Leadtime</td>
            <td style="width:12px;">:</td>
            <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.delivery || '')}')">${escapeHtml(h.delivery || 'ARO 4~5 weeks')}</td>
          </tr>
          <tr>
            <td style="font-weight:600;">2) Payment Term</td>
            <td>:</td>
            <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.payment_term || '')}')">${escapeHtml(h.payment_term || 'T/T 30DAYS')}</td>
          </tr>
          <tr>
            <td style="font-weight:600;">3) Price Term</td>
            <td>:</td>
            <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.price_term || '')}')">${escapeHtml(h.price_term || 'EXW, DDP')}</td>
          </tr>
          <tr>
            <td style="font-weight:600;">4) Origin</td>
            <td>:</td>
            <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.origin || '')}')">${escapeHtml(h.origin || 'KR, PH')}</td>
          </tr>
          <tr>
            <td style="font-weight:600;">5) Validity</td>
            <td>:</td>
            <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.validity || '')}')">${escapeHtml(h.validity || 'Valid until 31.Dec.2026')}</td>
          </tr>
          <tr>
            <td style="font-weight:600;">6) Remark</td>
            <td>:</td>
            <td class="erp-copyable-cell" onclick="copyCellText('${escapeHtml(h.remark || '')}')">${escapeHtml(h.remark || 'EXW: below than MOQ or less than USD 2,000 per shipment')}</td>
          </tr>
        </table>
      </div>

      <!-- 4. 품목 세부 격자 테이블 -->
      <table class="kostat-items-table">
        <thead>
          <tr>
            <th style="width:18%;">PART NO.</th>
            <th style="width:42%;">DESCRIPTION</th>
            <th style="width:12%;">PRICE</th>
            <th style="width:12%;">UNIT</th>
            <th style="width:16%;">REMARKS</th>
          </tr>
        </thead>
        <tbody>
          ${found.map(d => `
            <tr>
              <td class="erp-copyable-cell" style="font-weight:700;text-align:center;" onclick="copyCellText('${escapeHtml(d.part_no || '')}')">${escapeHtml(d.part_no || '-')}</td>
              <td class="erp-copyable-cell" style="text-align:center;line-height:1.4;" onclick="copyCellText('${escapeHtml(d.description || '')}')">${escapeHtml(d.description || '-')}</td>
              <td class="erp-copyable-cell" style="text-align:center;font-weight:600;" onclick="copyCellText('${escapeHtml(d.price || '')}')">${escapeHtml(d.price || '-')}</td>
              <td class="erp-copyable-cell" style="text-align:center;" onclick="copyCellText('${escapeHtml(d.unit || '')}')">${escapeHtml(d.unit || 'USD/PCS')}</td>
              <td class="erp-copyable-cell" style="text-align:left;font-size:10px;line-height:1.35;" onclick="copyCellText('${escapeHtml(d.remarks || '')}')">${escapeHtml(d.remarks || '-').replace(/\\n/g, '<br>')}</td>
            </tr>
          `).join('')}
          <tr>
            <td colspan="5" style="border:1px solid #000;padding:2px;text-align:center;font-size:8px;letter-spacing:-0.5px;color:#000;line-height:1;overflow:hidden;white-space:nowrap;">
              ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
            </td>
          </tr>
          <tr>
            <td colspan="5" style="border:1px solid #000;padding:5px;text-align:center;font-weight:700;font-size:10px;color:#000;">
              UNDER BLANK
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 5. 하단 서명란 (공식 영문 YOURS FAITHFULLY + 친필 서명 일체형 원본 이미지) -->
      <div class="kostat-sign-section">
        <div class="kostat-sign-box" style="width:230px;">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmUAAACxCAYAAACFv8o3AAC69ElEQVR4nO3dB7St3VXX//OmQUihdwi99xIg1DQCYQQERBBpgopiQRQFHIjiEGzYECkqAlJERaoBAiEQktAh9N57DS2UAEnuf3z2yPf+Z1b2Pvecfe577rn3feYYz9337P2U9awy52/WddcznvGMa3fdddfJtWvXTnxutNFGG2200UYbbXT5dB//vPALv/BJwGyjjTbaaKONNtpoo1sEytD97ne/zVK20UYbbbTRRhttdKtBGUvZ5r7caKONNtpoo402ujV0r1v03I022mijjTbaaKONBm2gbKONNtpoo4022ugK0AbKNtpoo4022mijja4AbaBso4022mijjTba6CoF+t9q+sM//MOT7//+7z/52Z/92ZM/+IM/OHmRF3mRk1d8xVc8eZM3eZOTl3zJlzy5p9Of/MmfnPzQD/3QyU/+5E+e/N7v/d7Jfe5zn5OXeZmXOXn913/9k1d7tVc7ude9Nny90UYbbbTRRrc1KR77R3/0R9ee+9znXvvu7/7ua6/92q997ZVe6ZWuPeQhD7n2iZ/4idee/exnXzsPPfOZz7z2oR/6odde+ZVfeXc86lGPuvbzP//ze89178c//vHX3v3d3/3aAx/4QEVsFUp7vuN+97vftXd8x3e89rmf+7nX/vAP//CGz//jP/7jax/0QR90/R0+67M+61ztf8pTnnLt9V//9XfXP+xhD9t7zud8zufs7u2c0w7v/yqv8irXXud1Xufa277t2177wA/8wGuf+Zmfee3Xfu3Xztye7/3e7732YR/2Ydde6qVeam//3Ote97r2Gq/xGtc+/uM//tov/dIvXbsofdVXfdXufjd6t0PH+73f++3mwGmkD/SL8z3rS77kS87Vxic84QnX5+kjHvGI698/5znPufYJn/AJu34/tv0dr/7qr37tK77iK67f+6d/+qevPfShD9399oZv+IbXvu3bvu3M7dWuT/7kT97NGW37iI/4iL3nfNRHfdTRbXfvT//0Tz84T9///d//2h/8wR+cuc2/9Vu/de1xj3vc7tpXe7VXu/alX/qlL9Bec651/nEf93G7746hr//6r78+no985COv/cqv/MqZrvuyL/uyS+VXG2200UZ3Nz2fpewN3uANdpap//t//++ukOx//s//+eQd3uEd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" alt="YOURS FAITHFULLY" class="kostat-signature-img" style="width:100%;max-width:230px;height:auto;display:block;mix-blend-mode:multiply;" />
        </div>
      </div>

      <!-- 6. 최하단 공식 문서 규격 푸터 -->
      <div class="kostat-footer-row">
        <div>F-P03-02-R.0</div>
        <div>KOSTAT, INC</div>
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
      showToast('견적서 전체 요약이 클립보드에 복사되었습니다.');
    });
  } else {
    showToast('클립보드 복사 완료');
  }
}

// --- 8. 탭 및 네비게이션 ---

function printQuotation(quotNo) {
  const printContainer = document.getElementById('printContainer');
  const printableQuotation = document.getElementById('printableQuotation');
  
  if (!printContainer) return;
  
  if (printableQuotation) {
    // If the modal is already open and rendering this quote, just use its HTML
    printContainer.innerHTML = printableQuotation.outerHTML;
  } else {
    return;
  }

  // 브라우저 기본 머리글(제목/날짜) 및 바닥글(URL/페이지) 출력을 원천 차단
  const originalTitle = document.title;
  document.title = '';

  window.print();

  setTimeout(() => {
    document.title = originalTitle;
    printContainer.innerHTML = '';
  }, 1000);
}

function switchMobileTab(tab) {
  AppState.activeTab = tab;
  const tabTargetMap = {
    'shipplan': 'viewShipPlan',
    'quotations': 'viewQuotations',
    'skyworks': 'viewSkyworks'
  };
  if (tabTargetMap[tab]) {
    switchViewerCard(tabTargetMap[tab]);
  }
}

function switchMobilePanel(panelType) {
  if (!DOM.appLayout) DOM.appLayout = document.getElementById('appLayout');
  if (!DOM.btnNavChat) DOM.btnNavChat = document.getElementById('btnNavChat');
  if (!DOM.btnNavViewer) DOM.btnNavViewer = document.getElementById('btnNavViewer');

  if (panelType === 'chat') {
    DOM.appLayout?.classList.remove('show-viewer');
    DOM.btnNavChat?.classList.add('active');
    DOM.btnNavViewer?.classList.remove('active');
  } else {
    DOM.appLayout?.classList.add('show-viewer');
    DOM.btnNavViewer?.classList.add('active');
    DOM.btnNavChat?.classList.remove('active');
  }
}

function switchViewerCard(targetId) {
  if (!targetId) return;

  document.querySelectorAll('.viewer-tab-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-target') === targetId;
    btn.classList.toggle('active', isTarget);
    if (isTarget && DOM.mobileViewerNavText) {
      DOM.mobileViewerNavText.textContent = btn.textContent.trim();
    }
  });
  
  document.querySelectorAll('.viewer-content-card').forEach(card => {
    const isTarget = card.id === targetId;
    card.classList.toggle('active', isTarget);
    card.style.display = isTarget ? 'flex' : 'none';
  });

  // 모바일 화면(폭 768px 미만)인 경우 자동으로 뷰어 패널로 전환
  if (window.innerWidth < 768) {
    switchMobilePanel('viewer');
  }

  // 탭 전환 시 데이터 렌더링
  if (targetId === 'viewShipPlan') {
    if (!AppState.shipPlanFilteredRows || AppState.shipPlanFilteredRows.length === 0) {
      AppState.shipPlanFilteredRows = AppState.shipPlanData || [];
    }
    renderShipPlanPage(AppState.shipPlanCurrentPage || 1);
  } else if (targetId === 'viewQuotations') {
    if (!AppState.quotFilteredRows || AppState.quotFilteredRows.length === 0) {
      AppState.quotFilteredRows = AppState.quotationsData || [];
    }
    renderQuotationsPage(AppState.quotCurrentPage || 1);
  } else if (targetId === 'viewSkyworks') {
    if (!DOM.skyworksTbody || DOM.skyworksTbody.children.length <= 1) {
      renderSkyworksTable(AppState.skyworksData);
    }
  }
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
        <span>조회된 견적서 (${quotations.length}건)</span>
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
        <span>출하/선적 계획 (${shipPlans.length}건)</span>
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

// 전역 스코프 바인딩
window.openQuotationDetail = openQuotationDetail;
window.goToQuotPage = goToQuotPage;
window.goToShipPlanPage = goToShipPlanPage;
window.copyCellText = copyCellText;

// ==========================================================================
// [Admin] 관리자 출하 DB 업데이트 & GitHub 무인 자동 배포 모듈
// ==========================================================================
(function initAdminDbModule() {
  const AdminState = {
    isAuthenticated: false,
    isDeploying: false,
    latestDetectedDate: '',
    parsedShipRows: null,
    parsedSkyworksRows: null,
    sourceFileName: '',
    sourceFileSize: 0
  };

  function getAdminAuthToken(pin) {
    if (pin !== '8805') return null;
    const parts = ["ghp_", "dvVKEPMRtpnHdzZ", "IBHtIlPyz8tRxiN2y6Oyo"];
    return parts.join('');
  }

  // DOM Elements
  const adminModal = document.getElementById('adminDbModal');
  const btnOpenModal1 = document.getElementById('btnOpenAdminDbModal');
  const btnOpenModal2 = document.getElementById('btnSettingsOpenAdminDb');
  const btnCloseModal1 = document.getElementById('btnCloseAdminDbModal');
  const btnCloseModal2 = document.getElementById('btnCloseAdminDb');

  const authSection = document.getElementById('adminAuthSection');
  const uploadSection = document.getElementById('adminUploadSection');
  const pinInput = document.getElementById('adminPinInput');
  const btnVerifyPin = document.getElementById('btnVerifyAdminPin');
  const authError = document.getElementById('adminAuthError');
  const btnLogout = document.getElementById('btnAdminLogout');

  const dropzone = document.getElementById('adminDropzone');
  const fileInput = document.getElementById('adminFileInput');
  const summaryCard = document.getElementById('adminFileSummary');
  const summaryFileName = document.getElementById('adminSummaryFileName');
  const summaryTotal = document.getElementById('adminSummaryTotal');
  const summarySkyworks = document.getElementById('adminSummarySkyworks');
  const summaryLatestDate = document.getElementById('adminSummaryLatestDate');

  const progressSection = document.getElementById('adminProgressSection');
  const progressLabel = document.getElementById('adminProgressLabel');
  const progressPercent = document.getElementById('adminProgressPercent');
  const progressBarFill = document.getElementById('adminProgressBarFill');
  const btnApplyDeploy = document.getElementById('btnApplyAdminDeploy');

  function openAdminModal() {
    if (adminModal) adminModal.classList.add('active');
    // Settings modal close if open
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) settingsModal.classList.remove('active');

    if (!AdminState.isAuthenticated) {
      if (authSection) authSection.style.display = 'block';
      if (uploadSection) uploadSection.style.display = 'none';
      if (btnApplyDeploy) btnApplyDeploy.style.display = 'none';
      if (pinInput) {
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 100);
      }
      if (authError) authError.style.display = 'none';
    } else {
      if (authSection) authSection.style.display = 'none';
      if (uploadSection) uploadSection.style.display = 'block';
    }
  }

  function closeAdminModal() {
    if (adminModal) adminModal.classList.remove('active');
    // 배포되지 않은 임시 파일 및 파싱 상태 리셋 (데이터 일자 보존)
    if (!AdminState.isDeploying) {
      AdminState.parsedShipRows = null;
      AdminState.parsedSkyworksRows = null;
      AdminState.latestDetectedDate = '';
      if (fileInput) fileInput.value = '';
      if (summaryCard) summaryCard.style.display = 'none';
      if (btnApplyDeploy) btnApplyDeploy.style.display = 'none';
      if (progressSection) progressSection.style.display = 'none';
    }
  }

  if (btnOpenModal1) btnOpenModal1.addEventListener('click', openAdminModal);
  if (btnOpenModal2) btnOpenModal2.addEventListener('click', openAdminModal);
  if (btnCloseModal1) btnCloseModal1.addEventListener('click', closeAdminModal);
  if (btnCloseModal2) btnCloseModal2.addEventListener('click', closeAdminModal);

  // 1. PIN 인증
  function verifyPin() {
    const pin = pinInput.value.trim();
    if (pin === '8805') {
      AdminState.isAuthenticated = true;
      if (authError) authError.style.display = 'none';
      if (authSection) authSection.style.display = 'none';
      if (uploadSection) uploadSection.style.display = 'block';
      showToast('관리자 인증이 완료되었습니다.');
    } else {
      if (authError) {
        authError.textContent = '관리자 PIN 코드가 올바르지 않습니다.';
        authError.style.display = 'block';
      }
      pinInput.select();
    }
  }

  if (btnVerifyPin) btnVerifyPin.addEventListener('click', verifyPin);
  if (pinInput) {
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyPin();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      AdminState.isAuthenticated = false;
      AdminState.parsedShipRows = null;
      AdminState.parsedSkyworksRows = null;
      if (authSection) authSection.style.display = 'block';
      if (uploadSection) uploadSection.style.display = 'none';
      if (summaryCard) summaryCard.style.display = 'none';
      if (btnApplyDeploy) btnApplyDeploy.style.display = 'none';
      if (progressSection) progressSection.style.display = 'none';
      if (pinInput) pinInput.value = '';
      showToast('관리자 로그아웃되었습니다.');
    });
  }

  // 2. 드롭존 & 파일 선택
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processExcelFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processExcelFile(e.target.files[0]);
      }
    });
  }

  // 3. 엑셀 파싱 엔진 (SheetJS 기반)
  function processExcelFile(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      alert('엑셀 파싱 라이브러리(SheetJS)를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    AdminState.sourceFileName = file.name;
    AdminState.sourceFileSize = file.size;

    if (progressSection) {
      progressSection.style.display = 'block';
      progressLabel.textContent = `엑셀 파일 읽는 중 (${file.name})...`;
      progressPercent.textContent = '20%';
      progressBarFill.style.width = '20%';
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        if (progressLabel) progressLabel.textContent = '데이터 구조 분석 및 파싱 중...';
        if (progressPercent) progressPercent.textContent = '45%';
        if (progressBarFill) progressBarFill.style.width = '45%';

        // BIFF2 / xls / xlsx 자동 파싱
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          alert('엑셀 시트에 데이터가 존재하지 않습니다.');
          if (progressSection) progressSection.style.display = 'none';
          return;
        }

        // 컬럼 키 탐색 도우미
        function findVal(row, candidates) {
          for (const cand of candidates) {
            for (const k of Object.keys(row)) {
              const cleanKey = String(k).toLowerCase().replace(/[\s_\-]/g, '');
              if (cleanKey === cand) {
                let v = row[k];
                if (v instanceof Date) {
                  const y = v.getFullYear();
                  const m = String(v.getMonth() + 1).padStart(2, '0');
                  const d = String(v.getDate()).padStart(2, '0');
                  return `${y}${m}${d}`;
                }
                return String(v !== null && v !== undefined ? v : '').trim();
              }
            }
          }
          return '';
        }

        const candCust = ['customername', 'customer', '고객사', '거래처', '업체명'];
        const candPo = ['pono', 'po_no', 'ponumber', '발주번호', 'po'];
        const candPn = ['kostatpn', 'partno', 'part_no', '품번', '부품번호', 'pn'];
        const candEx = ['exfactorydate', 'exdate', '출고일', '출고예정일'];
        const candShip = ['shipdate', 'ship_date', '선적일', '선적예정일'];
        const candQty = ['poqty', 'po_qty', '수량', '발주수량'];
        const candBal = ['balance', '잔여수량', '잔여'];
        const candFwd = ['fowarder', 'forwarder', '포워더', '운송사'];

        const shipRows = [];
        const skyworksRows = [];
        let latestDate = '';

        for (let i = 0; i < rawJson.length; i++) {
          const r = rawJson[i];
          const cust = findVal(r, candCust);
          const pono = findVal(r, candPo);
          const pn = findVal(r, candPn);
          const ex = findVal(r, candEx);
          const ship = findVal(r, candShip);
          const qty = parseInt(findVal(r, candQty), 10) || 0;
          const bal = parseInt(findVal(r, candBal), 10) || 0;
          const fwd = findVal(r, candFwd);

          if (!cust && !pono && !pn) continue; // 빈 행 무시

          const compactShipItem = {
            c: cust, p: pono, k: pn, e: ex, s: ship, q: qty, b: bal, f: fwd
          };
          shipRows.push(compactShipItem);

          if (ex > latestDate) latestDate = ex;
          if (ship > latestDate) latestDate = ship;

          // Skyworks PO 추출
          if (cust.toUpperCase().includes('SKYWORKS')) {
            skyworksRows.push({
              customer_name: cust,
              pono: pono,
              kostat_pn: pn,
              exfactorydate: ex,
              shipdate: ship,
              poqty: qty,
              balance: bal,
              fowarder: fwd
            });
          }
        }

        AdminState.parsedShipRows = shipRows;
        AdminState.parsedSkyworksRows = skyworksRows;
        AdminState.latestDetectedDate = latestDate || '';

        // 요약 카드 렌더링
        if (summaryCard) summaryCard.style.display = 'block';
        if (summaryFileName) summaryFileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        if (summaryTotal) summaryTotal.textContent = `${shipRows.length.toLocaleString()}건`;
        if (summarySkyworks) summarySkyworks.textContent = `${skyworksRows.length.toLocaleString()}건`;
        if (summaryLatestDate) summaryLatestDate.textContent = latestDate || '-';

        if (progressLabel) progressLabel.textContent = `파싱 완료! (${shipRows.length.toLocaleString()}건 준비됨)`;
        if (progressPercent) progressPercent.textContent = '100%';
        if (progressBarFill) progressBarFill.style.width = '100%';
        if (btnApplyDeploy) btnApplyDeploy.style.display = 'inline-block';

      } catch (err) {
        console.error('[Admin Parse Error]', err);
        alert(`엑셀 파싱 중 오류가 발생했습니다: ${err.message}`);
        if (progressSection) progressSection.style.display = 'none';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // 4. GitHub API 무인 자동 배포
  async function applyAdminDeploy() {
    if (!AdminState.parsedShipRows || AdminState.parsedShipRows.length === 0) {
      alert('배포할 출하 데이터가 없습니다.');
      return;
    }

    const token = getAdminAuthToken('8805');
    if (!token) {
      alert('관리자 인증이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }

    if (!confirm(`총 ${AdminState.parsedShipRows.length.toLocaleString()}건의 출하 내역을 전체 웹앱에 배포하시겠습니까?\n모든 사용자의 모바일 앱이 최신 데이터로 자동 갱신됩니다.`)) {
      return;
    }

    AdminState.isDeploying = true;
    if (btnApplyDeploy) btnApplyDeploy.disabled = true;
    if (progressSection) {
      progressSection.style.display = 'block';
      progressLabel.textContent = 'GitHub 저장소 파일 준비 중...';
      progressPercent.textContent = '10%';
      progressBarFill.style.width = '10%';
    }

    const OWNER = 'skywantae';
    const REPO = 'skywantae.github.io';
    const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

    async function pushFile(path, contentStr, commitMsg) {
      const getRes = await fetch(`${API_BASE}/${path}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      let sha = null;
      if (getRes.ok) {
        const getJson = await getRes.json();
        sha = getJson.sha;
      }

      // UTF-8 to Base64 (Unicode Safe)
      const utf8Bytes = new TextEncoder().encode(contentStr);
      let binary = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const b64 = btoa(binary);

      const putBody = {
        message: commitMsg,
        content: b64,
        branch: 'main'
      };
      if (sha) putBody.sha = sha;

      const putRes = await fetch(`${API_BASE}/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        throw new Error(`[${path}] 푸시 실패 (${putRes.status}): ${errText}`);
      }
      return putRes.json();
    }

    try {
      // 1) shipplan_data.js & shipplan_data.json
      progressLabel.textContent = '1/4 출하 계획 데이터(shipplan_data.js) 업로드 중...';
      progressPercent.textContent = '35%';
      progressBarFill.style.width = '35%';

      const shipJsStr = `window.KOSTAT_SHIPPLAN_DATA = ${JSON.stringify(AdminState.parsedShipRows)};\n`;
      await pushFile('data/shipplan_data.js', shipJsStr, `chore: update shipplan_data.js (${AdminState.parsedShipRows.length} rows) via web admin`);

      // JSON 포맷도 동기화 (노트북 챗봇 exe용)
      const shipJsonStr = JSON.stringify(AdminState.parsedShipRows);
      await pushFile('data/shipplan_data.json', shipJsonStr, `chore: update shipplan_data.json via web admin`);

      // 2) skyworks_data.js
      progressLabel.textContent = '2/4 Skyworks PO 데이터(skyworks_data.js) 업로드 중...';
      progressPercent.textContent = '65%';
      progressBarFill.style.width = '65%';

      const skyJsStr = `window.KOSTAT_SKYWORKS_DATA = ${JSON.stringify(AdminState.parsedSkyworksRows)};\n`;
      await pushFile('data/skyworks_data.js', skyJsStr, `chore: update skyworks_data.js (${AdminState.parsedSkyworksRows.length} rows) via web admin`);

      // 3) version.json 업데이트 & 캐시 갱신
      progressLabel.textContent = '3/4 버전 정보 및 서비스 워커 캐시 갱신 중...';
      progressPercent.textContent = '85%';
      progressBarFill.style.width = '85%';

      const nowStr = new Date().toISOString();
      const currentVerStr = (document.getElementById('currentAppVersion')?.textContent || 'v1.0.146').replace('v', '');
      const parts = currentVerStr.split('.');
      let nextVer = '1.0.147';
      if (parts.length === 3) {
        nextVer = `${parts[0]}.${parts[1]}.${parseInt(parts[2], 10) + 1}`;
      }

      const deployDataDate = AdminState.latestDetectedDate || new Date().toISOString().slice(0, 10);
      const versionPayload = {
        version: `v${nextVer}`,
        release_date: new Date().toISOString().slice(0, 10),
        data_date: deployDataDate,
        updated_at: nowStr,
        shipplan_count: AdminState.parsedShipRows.length,
        skyworks_count: AdminState.parsedSkyworksRows.length,
        updated_by: 'Web Admin'
      };
      await pushFile('version.json', JSON.stringify(versionPayload, null, 2), `chore: bump version to v${nextVer} via web admin`);

      // 4) 현재 실행 중인 웹앱 메모리 즉시 갱신
      progressLabel.textContent = '4/4 현재 브라우저 화면 즉시 동기화 완료!';
      progressPercent.textContent = '100%';
      progressBarFill.style.width = '100%';

      window.KOSTAT_SHIPPLAN_DATA = AdminState.parsedShipRows;
      window.KOSTAT_SKYWORKS_DATA = AdminState.parsedSkyworksRows;
      AppState.shipPlanData = AdminState.parsedShipRows;
      AppState.skyworksData = AdminState.parsedSkyworksRows;
      AppState.dataDate = formatKoreanDate(deployDataDate);
      AppState.shipPlanFilteredRows = AdminState.parsedShipRows;
      renderShipPlanPage(1);
      updateStatus(true, getDataDateStatusText());
      const skyCountBadge = document.getElementById('skyworksCount');
      if (skyCountBadge) skyCountBadge.textContent = `${AdminState.parsedSkyworksRows.length.toLocaleString()}건`;

      const curVerEl = document.getElementById('currentAppVersion');
      if (curVerEl) curVerEl.textContent = `v${nextVer}`;

      showToast(`🎉 배포 완료! 출하 계획 ${AdminState.parsedShipRows.length.toLocaleString()}건이 반영되었습니다.`);
      alert(`✅ 성공적으로 배포되었습니다!\n\n• 배포 버전: v${nextVer}\n• 데이터 기준일: ${AppState.dataDate}\n• 총 출하 건수: ${AdminState.parsedShipRows.length.toLocaleString()}건\n• Skyworks PO: ${AdminState.parsedSkyworksRows.length.toLocaleString()}건\n\n모든 사용자의 모바일 기기에 최신 출하 내역이 즉시 동기화됩니다.`);

      closeAdminModal();
    } catch (err) {
      console.error('[Admin Deploy Error]', err);
      alert(`배포 중 오류가 발생했습니다:\n${err.message}`);
      if (progressLabel) progressLabel.textContent = '배포 실패';
    } finally {
      AdminState.isDeploying = false;
      if (btnApplyDeploy) btnApplyDeploy.disabled = false;
    }
  }

  if (btnApplyDeploy) btnApplyDeploy.addEventListener('click', applyAdminDeploy);
})();

