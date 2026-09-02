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

  // 상태
  dbReady: false,
  isSyncing: false,
  lastSyncTime: null,
  activeTab: 'chat',
  viewMode: window.innerWidth >= 681 ? 'dual' : 'single',
  currentQuotNo: null
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

  // 초기 뷰 모드 적용
  applyViewMode();
});

function applyViewMode() {
  const btn = document.getElementById('btnViewMode');
  if (AppState.viewMode === 'dual') {
    document.body.classList.remove('mode-single');
    document.body.classList.add('mode-dual');
    if (btn) btn.textContent = '싱글 스크린 변경';
  } else {
    document.body.classList.remove('mode-dual');
    document.body.classList.add('mode-single');
    if (btn) btn.textContent = '듀얼 스크린 변경';
  }
  switchMobileTab(AppState.activeTab || 'chat');
}

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
    updateStatus(true, `내장 DB 준비됨 (${total.toLocaleString()}건)`);
    
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
      updateStatus(true, `실시간 최신화 완료 (${totalCount.toLocaleString()}건)`);
      showToast(`최신 데이터(${totalCount.toLocaleString()}건)가 실시간 반영되었습니다.`);
    } else {
      updateStatus(true, `최신 데이터 작동 중 (${totalCount.toLocaleString()}건)`);
      if (isManual) {
        showToast('이미 최신 데이터베이스 상태입니다.');
      }
    }
  } catch (e) {
    const totalCount = AppState.skyworksData.length + AppState.shipPlanData.length + AppState.quotationsData.length;
    updateStatus(true, `내장 데이터 작동 중 (${totalCount.toLocaleString()}건)`);
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

  // 뷰 모드 토글 버튼
  const btnViewMode = document.getElementById('btnViewMode');
  if (btnViewMode) {
    btnViewMode.addEventListener('click', () => {
      AppState.viewMode = AppState.viewMode === 'dual' ? 'single' : 'dual';
      applyViewMode();
    });
  }

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
  
  // 견적서 검색 이벤트
  if (DOM.btnSearchQuotations) DOM.btnSearchQuotations.addEventListener('click', searchQuotations);
  if (DOM.quotationSearchInput) DOM.quotationSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchQuotations();
  });
  if (DOM.quotCustomerInput) DOM.quotCustomerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchQuotations();
  });
  if (DOM.btnReloadQuotHistory) DOM.btnReloadQuotHistory.addEventListener('click', loadQuotationsTop);
  
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
        <div class="kostat-doc-title">QUOTATION</div>
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

      <!-- 5. 하단 서명란 (공식 영문 필기체 싸인 100% 동일 복제) -->
      <div class="kostat-sign-section">
        <div class="kostat-sign-box">
          <div class="kostat-sign-label">YOURS FAITHFULLY</div>
          <div style="display:flex;justify-content:center;align-items:center;min-height:52px;padding:4px 0;">
            <img src="data:image/png;base64,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" style="width:185px; height:auto; mix-blend-mode: multiply; opacity: 0.9;" />
          </div>
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
    // We would need to generate it, but btnModalPrintQuot is inside the modal, so printableQuotation is always present
    return;
  }

  // Trigger print
  window.print();
}

function switchMobileTab(tab) {
  AppState.activeTab = tab;
  document.querySelectorAll('.nav-tab-item').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });

  if (AppState.viewMode === 'single') {
    // 📱 모바일 스마트폰: 단일 화면 모드
    if (tab === 'chat') {
      DOM.panelChat.style.setProperty('display', 'flex', 'important');
      DOM.panelViewer.style.setProperty('display', 'none', 'important');
    } else {
      DOM.panelChat.style.setProperty('display', 'none', 'important');
      DOM.panelViewer.style.setProperty('display', 'flex', 'important');
      
      const tabTargetMap = {
        'shipplan': 'viewShipPlan',
        'quotations': 'viewQuotations',
        'skyworks': 'viewSkyworks'
      };
      switchViewerCard(tabTargetMap[tab] || 'viewShipPlan');
    }
  } else {
    // 💻 PC 대화면: 듀얼 분할 화면 유지 (좌측 챗봇 40% + 우측 뷰어 60%)
    if (DOM.panelChat) DOM.panelChat.style.removeProperty('display');
    if (DOM.panelViewer) DOM.panelViewer.style.removeProperty('display');
    
    const tabTargetMap = {
      'shipplan': 'viewShipPlan',
      'quotations': 'viewQuotations',
      'skyworks': 'viewSkyworks'
    };
    if (tabTargetMap[tab]) {
      switchViewerCard(tabTargetMap[tab]);
    }
  }
}

// 윈도우 리사이즈 시 PC 대화면 자동 모드 전환 보장
window.addEventListener('resize', debounce(() => {
  const isLarge = window.innerWidth >= 681;
  if (isLarge && AppState.viewMode !== 'dual') {
    AppState.viewMode = 'dual';
    applyViewMode();
  } else if (!isLarge && AppState.viewMode !== 'single') {
    AppState.viewMode = 'single';
    applyViewMode();
  }
}, 300));

function switchViewerCard(targetId) {
  if (!targetId) return;

  document.querySelectorAll('.viewer-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
  });
  
  document.querySelectorAll('.viewer-content-card').forEach(card => {
    const isTarget = card.id === targetId;
    card.classList.toggle('active', isTarget);
    card.style.display = isTarget ? 'flex' : 'none';
  });

  // 탭 전환 시 데이터 렌더링
  if (targetId === 'viewQuotations') {
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
window.copyCellText = copyCellText;
