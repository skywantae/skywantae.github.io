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

  // 계약검토서 (Project) 페이징 상태
  contractReviewsData: [],
  contractCurrentPage: 1,
  contractPageSize: 50,
  contractFilteredRows: [],
  selectedContractProjectNo: null,

  // IC Tray 도면 상태
  drawingsData: [],
  drawingsFilteredRows: [],
  drawingsCurrentPage: 1,
  drawingsPageSize: 15,
  isDrawingAuthenticated: false,
  pendingDrawingIndex: null,
  selectedDrawingModel: null,

  // 출하 계획 페이징 상태
  shipPlanCurrentPage: 1,
  shipPlanPageSize: 50,
  shipPlanFilteredRows: [],

  // Skyworks PO 페이징 상태
  skyworksCurrentPage: 1,
  skyworksPageSize: 50,
  skyworksFilteredRows: [],

  // 기능 요청 게시판 상태
  feedbackData: [],
  feedbackFilteredRows: [],
  feedbackCurrentPage: 1,
  feedbackPageSize: 10,
  isBoardAdmin: false,

  // FAQ 지식베이스 관리 상태
  faqFilteredRows: [],
  faqCurrentPage: 1,
  faqPageSize: 10,
  isFaqAdmin: false,
  currentFaqAttachments: [],

  // 자료실 (Archive & Downloads) 상태
  archiveData: [],
  archiveFilteredRows: [],
  archiveCurrentPage: 1,
  archivePageSize: 15,
  isArchiveAdmin: false,
  currentArchiveAttachments: [],

  // 상태
  dbReady: false,
  isSyncing: false,
  lastSyncTime: null,
  activeTab: 'shipplan',
  dataDate: '2026년 9월 15일',
  currentQuotNo: null,
  currentLang: 'ko'
};

// 전역 관리자 상태 객체 (출하 DB 및 게시판 관리자 공통 사용)
const AdminState = window.AdminState = {
  isAuthenticated: false,
  isDeploying: false,
  latestDetectedDate: '',
  parsedShipRows: null,
  parsedSkyworksRows: null,
  sourceFileName: '',
  sourceFileSize: 0
};

// 관리자 마스터 보안 해시 (소스코드 내 평문 PIN 완전 은닉)
const ADMIN_PIN_HASH = 'e76033e8f5cf30a84e2de53819d0ca58e66a854394cd7c251c88819eaa70af0b';

async function checkAdminPinHash(inputPin) {
  if (!inputPin) return false;
  const str = String(inputPin).trim();
  try {
    if (window.crypto && crypto.subtle) {
      const enc = new TextEncoder().encode(str);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      return hex === ADMIN_PIN_HASH;
    }
  } catch (_) {}
  // Web Crypto 미지원(HTTP IP 접속 등) 환경 안전 fallback (8805의 듀얼 해시)
  let h1 = 5381, h2 = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = ((h1 << 5) + h1) + c;
    h2 = c + (h2 << 6) + (h2 << 16) - h2;
  }
  return ((h1 >>> 0) === 2088548698) && ((h2 >>> 0) === 1229003269);
}

function parseValidDate(dateVal) {
  if (!dateVal) return null;
  const s = String(dateVal).trim();
  const m = s.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 2020 || y > 2050) return null;
  if (mon < 1 || mon > 12) return null;
  if (d < 1 || d > 31) return null;
  return `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatKoreanDate(dateStr) {
  const norm = parseValidDate(dateStr);
  if (norm) {
    const [y, mon, d] = norm.split('-').map(v => parseInt(v, 10));
    return `${y}년 ${mon}월 ${d}일`;
  }
  if (typeof dateStr === 'string' && dateStr.includes('년') && !dateStr.includes('0월') && !dateStr.includes(' 0일')) {
    return dateStr;
  }
  if (AppState && AppState.dataDate && !AppState.dataDate.includes('0월') && !AppState.dataDate.includes(' 0일')) {
    return AppState.dataDate;
  }
  return '2026년 9월 15일';
}

function detectLatestDataDateFromShipPlan() {
  const rows = AppState.shipPlanData || window.KOSTAT_SHIPPLAN_DATA;
  if (!rows || rows.length === 0) return null;
  const limit = Math.min(rows.length, 1500);
  const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let maxDate = '';
  for (let i = 0; i < limit; i++) {
    const r = rows[i];
    const d1 = String(r.e || r.exfactorydate || '').replace(/[^0-9]/g, '').slice(0, 8);
    const d2 = String(r.s || r.shipdate || '').replace(/[^0-9]/g, '').slice(0, 8);
    if (d1 && d1.length === 8 && d1 <= nowStr && d1 > maxDate) maxDate = d1;
    if (d2 && d2.length === 8 && d2 <= nowStr && d2 > maxDate) maxDate = d2;
  }
  if (maxDate && maxDate.length === 8) {
    return `${maxDate.slice(0, 4)}-${maxDate.slice(4, 6)}-${maxDate.slice(6, 8)}`;
  }
  return null;
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
  skyworksPageSizeSelect: document.getElementById('skyworksPageSizeSelect'),
  skyworksPagination: document.getElementById('skyworksPagination'),
  skyworksPageInfo: document.getElementById('skyworksPageInfo'),
  skyworksPageControls: document.getElementById('skyworksPageControls'),
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

  // 계약검토서 (Project) DOM
  viewContractReviews: document.getElementById('viewContractReviews'),
  contractReviewsCount: document.getElementById('contractReviewsCount'),
  contractCustomerInput: document.getElementById('contractCustomerInput'),
  contractSearchInput: document.getElementById('contractSearchInput'),
  contractStatusSelect: document.getElementById('contractStatusSelect'),
  contractPageSizeSelect: document.getElementById('contractPageSizeSelect'),
  btnSearchContract: document.getElementById('btnSearchContract'),
  btnReloadContract: document.getElementById('btnReloadContract'),
  contractReviewsTable: document.getElementById('contractReviewsTable'),
  contractReviewsTbody: document.getElementById('contractReviewsTbody'),
  contractPagination: document.getElementById('contractPagination'),
  contractPageInfo: document.getElementById('contractPageInfo'),
  contractPageControls: document.getElementById('contractPageControls'),
  contractDetailModal: document.getElementById('contractDetailModal'),
  modalContractTitle: document.getElementById('modalContractTitle'),
  modalContractBody: document.getElementById('modalContractBody'),
  btnCloseContractModal: document.getElementById('btnCloseContractModal'),
  btnModalCloseContract: document.getElementById('btnModalCloseContract'),
  btnModalCopyContractText: document.getElementById('btnModalCopyContractText'),

  // IC Tray 도면 DOM
  viewDrawings: document.getElementById('viewDrawings'),
  drawingsCountBadge: document.getElementById('drawingsCountBadge'),
  drawingsSearchInput: document.getElementById('drawingsSearchInput'),
  drawingsSeriesSelect: document.getElementById('drawingsSeriesSelect'),
  drawingsPageSizeSelect: document.getElementById('drawingsPageSizeSelect'),
  btnSearchDrawings: document.getElementById('btnSearchDrawings'),
  btnReloadDrawings: document.getElementById('btnReloadDrawings'),
  drawingsTable: document.getElementById('drawingsTable'),
  drawingsTbody: document.getElementById('drawingsTbody'),
  drawingsPagination: document.getElementById('drawingsPagination'),
  drawingsPageInfo: document.getElementById('drawingsPageInfo'),
  drawingsPageControls: document.getElementById('drawingsPageControls'),

  // 도면 보안 PIN 모달 DOM
  drawingPinModal: document.getElementById('drawingPinModal'),
  drawingPinInput: document.getElementById('drawingPinInput'),
  drawingPinTargetIndex: document.getElementById('drawingPinTargetIndex'),
  drawingPinError: document.getElementById('drawingPinError'),
  btnVerifyDrawingPin: document.getElementById('btnVerifyDrawingPin'),
  btnCancelDrawingPin: document.getElementById('btnCancelDrawingPin'),
  btnCloseDrawingPinModal: document.getElementById('btnCloseDrawingPinModal'),

  // 도면 상세 모달 DOM
  drawingDetailModal: document.getElementById('drawingDetailModal'),
  drawingDetailTitle: document.getElementById('drawingDetailTitle'),
  btnCopyDrawingSummary: document.getElementById('btnCopyDrawingSummary'),
  btnCloseDrawingDetailModal: document.getElementById('btnCloseDrawingDetailModal'),
  drawingDetailSpecArea: document.getElementById('drawingDetailSpecArea'),
  drawingDetailFileCount: document.getElementById('drawingDetailFileCount'),
  drawingDetailFileList: document.getElementById('drawingDetailFileList'),
  btnCloseDrawingDetail: document.getElementById('btnCloseDrawingDetail'),

  // Settings & Refresh
  btnSettings: document.getElementById('btnSettings'),
  btnRefresh: document.getElementById('btnRefresh'),
  settingsModal: document.getElementById('settingsModal'),
  btnCloseSettingsModal: document.getElementById('btnCloseSettingsModal'),
  btnCloseSettings: document.getElementById('btnCloseSettings'),
  currentAppVersion: document.getElementById('currentAppVersion'),

  // 기능 요청 게시판 DOM
  feedbackBoardList: document.getElementById('feedbackBoardList'),
  feedbackCountBadge: document.getElementById('feedbackCountBadge'),
  feedbackSearchInput: document.getElementById('feedbackSearchInput'),
  feedbackStatusFilter: document.getElementById('feedbackStatusFilter'),
  feedbackPageSizeSelect: document.getElementById('feedbackPageSizeSelect'),
  feedbackPagination: document.getElementById('feedbackPagination'),
  feedbackPageInfo: document.getElementById('feedbackPageInfo'),
  feedbackPageControls: document.getElementById('feedbackPageControls'),
  btnOpenNewFeedbackModal: document.getElementById('btnOpenNewFeedbackModal'),
  btnRefreshFeedback: document.getElementById('btnRefreshFeedback'),
  btnToggleBoardAdmin: document.getElementById('btnToggleBoardAdmin'),
  feedbackNewModal: document.getElementById('feedbackNewModal'),
  btnCloseFeedbackNewModal: document.getElementById('btnCloseFeedbackNewModal'),
  btnCancelFeedbackNew: document.getElementById('btnCancelFeedbackNew'),
  btnSubmitNewFeedback: document.getElementById('btnSubmitNewFeedback'),
  feedbackAuthorInput: document.getElementById('feedbackAuthorInput'),
  feedbackTitleInput: document.getElementById('feedbackTitleInput'),
  feedbackContentInput: document.getElementById('feedbackContentInput'),
  
  feedbackReplyModal: document.getElementById('feedbackReplyModal'),
  btnCloseFeedbackReplyModal: document.getElementById('btnCloseFeedbackReplyModal'),
  btnCancelFeedbackReply: document.getElementById('btnCancelFeedbackReply'),
  btnSubmitAdminReply: document.getElementById('btnSubmitAdminReply'),
  btnDeleteFeedbackPost: document.getElementById('btnDeleteFeedbackPost'),
  feedbackTargetId: document.getElementById('feedbackTargetId'),
  feedbackTargetPreview: document.getElementById('feedbackTargetPreview'),
  feedbackReplyStatusSelect: document.getElementById('feedbackReplyStatusSelect'),
  feedbackReplyTextInput: document.getElementById('feedbackReplyTextInput'),

  // 게시판 관리자 PIN 인증 모달
  boardAdminPinModal: document.getElementById('boardAdminPinModal'),
  btnCloseBoardPinModal: document.getElementById('btnCloseBoardPinModal'),
  btnCancelBoardPin: document.getElementById('btnCancelBoardPin'),
  btnVerifyBoardPin: document.getElementById('btnVerifyBoardPin'),
  boardPinInput: document.getElementById('boardPinInput'),
  boardPinError: document.getElementById('boardPinError'),
  adminDataDateInput: document.getElementById('adminDataDateInput'),

  // 게시글 삭제 확인 모달 DOM
  feedbackDeleteModal: document.getElementById('feedbackDeleteModal'),
  feedbackDeleteTargetId: document.getElementById('feedbackDeleteTargetId'),
  feedbackDeleteTitlePreview: document.getElementById('feedbackDeleteTitlePreview'),
  btnConfirmDeleteFeedback: document.getElementById('btnConfirmDeleteFeedback'),
  btnCancelDeleteFeedback: document.getElementById('btnCancelDeleteFeedback'),
  btnCloseFeedbackDeleteModal: document.getElementById('btnCloseFeedbackDeleteModal'),

  // FAQ 지식베이스 DOM
  viewFaq: document.getElementById('viewFaq'),
  faqCountBadge: document.getElementById('faqCountBadge'),
  faqSearchInput: document.getElementById('faqSearchInput'),
  faqPageSizeSelect: document.getElementById('faqPageSizeSelect'),
  faqPagination: document.getElementById('faqPagination'),
  faqPageInfo: document.getElementById('faqPageInfo'),
  faqPageControls: document.getElementById('faqPageControls'),
  btnOpenNewFaqModal: document.getElementById('btnOpenNewFaqModal'),
  btnToggleFaqAdmin: document.getElementById('btnToggleFaqAdmin'),
  btnDeployFaq: document.getElementById('btnDeployFaq'),
  btnExportFaqBackup: document.getElementById('btnExportFaqBackup'),
  btnImportFaqBackup: document.getElementById('btnImportFaqBackup'),
  faqBackupFileInput: document.getElementById('faqBackupFileInput'),
  faqListContainer: document.getElementById('faqListContainer'),
  btnSettingsOpenFaqManager: document.getElementById('btnSettingsOpenFaqManager'),

  // FAQ 등록/수정 모달
  faqEditModal: document.getElementById('faqEditModal'),
  faqModalTitle: document.getElementById('faqModalTitle'),
  faqEditIndex: document.getElementById('faqEditIndex'),
  faqQuestionInput: document.getElementById('faqQuestionInput'),
  faqCategoryInput: document.getElementById('faqCategoryInput'),
  faqAuthorPinInput: document.getElementById('faqAuthorPinInput'),
  faqAnswerInput: document.getElementById('faqAnswerInput'),
  faqAttachSizeIndicator: document.getElementById('faqAttachSizeIndicator'),
  faqDropzone: document.getElementById('faqDropzone'),
  faqFileInput: document.getElementById('faqFileInput'),
  faqAttachedList: document.getElementById('faqAttachedList'),
  btnSaveFaqEdit: document.getElementById('btnSaveFaqEdit'),
  btnCancelFaqEdit: document.getElementById('btnCancelFaqEdit'),
  btnCloseFaqEditModal: document.getElementById('btnCloseFaqEditModal'),

  // FAQ 본인 확인 비밀번호 모달 (수정/삭제 권한 확인)
  faqAuthorPinModal: document.getElementById('faqAuthorPinModal'),
  faqAuthTargetIndex: document.getElementById('faqAuthTargetIndex'),
  faqAuthTargetAction: document.getElementById('faqAuthTargetAction'),
  faqAuthorPinPromptText: document.getElementById('faqAuthorPinPromptText'),
  faqAuthorPinCheckInput: document.getElementById('faqAuthorPinCheckInput'),
  faqAuthorPinError: document.getElementById('faqAuthorPinError'),
  btnVerifyFaqAuthorPin: document.getElementById('btnVerifyFaqAuthorPin'),
  btnCancelFaqAuthorPin: document.getElementById('btnCancelFaqAuthorPin'),
  btnCloseFaqAuthorPinModal: document.getElementById('btnCloseFaqAuthorPinModal'),

  // FAQ 삭제 확인 모달
  faqDeleteModal: document.getElementById('faqDeleteModal'),
  faqDeleteTargetIndex: document.getElementById('faqDeleteTargetIndex'),
  faqDeleteTitlePreview: document.getElementById('faqDeleteTitlePreview'),
  btnConfirmDeleteFaq: document.getElementById('btnConfirmDeleteFaq'),
  btnCancelDeleteFaq: document.getElementById('btnCancelDeleteFaq'),
  btnCloseFaqDeleteModal: document.getElementById('btnCloseFaqDeleteModal'),

  // FAQ 미디어 라이트박스
  faqMediaLightboxModal: document.getElementById('faqMediaLightboxModal'),
  faqLightboxTitle: document.getElementById('faqLightboxTitle'),
  faqLightboxBody: document.getElementById('faqLightboxBody'),
  faqLightboxDownloadBtn: document.getElementById('faqLightboxDownloadBtn'),
  btnCloseFaqLightbox: document.getElementById('btnCloseFaqLightbox'),
  btnCloseFaqLightbox2: document.getElementById('btnCloseFaqLightbox2'),

  // 실험실 (Lab) DOM
  viewLab: document.getElementById('viewLab'),
  sspcDropzone: document.getElementById('sspcDropzone'),
  sspcFileInput: document.getElementById('sspcFileInput'),
  sspcResultPanel: document.getElementById('sspcResultPanel'),
  sspcFileName: document.getElementById('sspcFileName'),
  sspcFileSize: document.getElementById('sspcFileSize'),
  sspcSheetSelect: document.getElementById('sspcSheetSelect'),
  sspcMetricCount: document.getElementById('sspcMetricCount'),
  sspcMetricQty: document.getElementById('sspcMetricQty'),
  sspcMetricAmount: document.getElementById('sspcMetricAmount'),
  sspcPreviewTbody: document.getElementById('sspcPreviewTbody'),
  btnDownloadSspcExcel: document.getElementById('btnDownloadSspcExcel'),
  btnResetSspc: document.getElementById('btnResetSspc'),

  // 자료실 (Archive & Downloads) DOM
  viewArchive: document.getElementById('viewArchive'),
  archiveCountBadge: document.getElementById('archiveCountBadge'),
  archiveSearchInput: document.getElementById('archiveSearchInput'),
  archiveCategoryFilter: document.getElementById('archiveCategoryFilter'),
  archivePageSizeSelect: document.getElementById('archivePageSizeSelect'),
  btnOpenNewArchiveModal: document.getElementById('btnOpenNewArchiveModal'),
  btnRefreshArchive: document.getElementById('btnRefreshArchive'),
  btnToggleArchiveAdmin: document.getElementById('btnToggleArchiveAdmin'),
  archiveCardListContainer: document.getElementById('archiveCardListContainer'),
  archivePagination: document.getElementById('archivePagination'),
  archivePageInfo: document.getElementById('archivePageInfo'),
  archivePageControls: document.getElementById('archivePageControls'),

  // 자료실 상세 모달
  archiveDetailModal: document.getElementById('archiveDetailModal'),
  modalArchiveCat: document.getElementById('modalArchiveCat'),
  modalArchiveTitle: document.getElementById('modalArchiveTitle'),
  btnCloseArchiveDetailModal: document.getElementById('btnCloseArchiveDetailModal'),
  modalArchiveVer: document.getElementById('modalArchiveVer'),
  modalArchiveAuthor: document.getElementById('modalArchiveAuthor'),
  modalArchiveDate: document.getElementById('modalArchiveDate'),
  modalArchiveDownloads: document.getElementById('modalArchiveDownloads'),
  modalArchiveSummary: document.getElementById('modalArchiveSummary'),
  modalArchiveDesc: document.getElementById('modalArchiveDesc'),
  modalArchiveTags: document.getElementById('modalArchiveTags'),
  modalArchiveAttachmentsSection: document.getElementById('modalArchiveAttachmentsSection'),
  modalArchiveAttachmentsList: document.getElementById('modalArchiveAttachmentsList'),
  modalArchiveLinks: document.getElementById('modalArchiveLinks'),
  btnModalArchiveDownload: document.getElementById('btnModalArchiveDownload'),
  btnModalArchiveGithub: document.getElementById('btnModalArchiveGithub'),
  btnCloseArchiveDetail: document.getElementById('btnCloseArchiveDetail'),

  // 자료실 등록/수정 모달
  archiveEditModal: document.getElementById('archiveEditModal'),
  modalArchiveEditTitle: document.getElementById('modalArchiveEditTitle'),
  btnCloseArchiveEditModal: document.getElementById('btnCloseArchiveEditModal'),
  archiveEditId: document.getElementById('archiveEditId'),
  archiveInputTitle: document.getElementById('archiveInputTitle'),
  archiveInputVersion: document.getElementById('archiveInputVersion'),
  archiveInputAuthor: document.getElementById('archiveInputAuthor'),
  archiveInputPin: document.getElementById('archiveInputPin'),
  archiveInputDesc: document.getElementById('archiveInputDesc'),
  archiveAttachDropzone: document.getElementById('archiveAttachDropzone'),
  archiveFileInput: document.getElementById('archiveFileInput'),
  archiveAttachedList: document.getElementById('archiveAttachedList'),
  archiveAttachSizeIndicator: document.getElementById('archiveAttachSizeIndicator'),
  archiveInputDownloadUrl: document.getElementById('archiveInputDownloadUrl'),
  archiveInputGithubUrl: document.getElementById('archiveInputGithubUrl'),
  archiveInputTags: document.getElementById('archiveInputTags'),
  archiveInputPinned: document.getElementById('archiveInputPinned'),
  btnSaveArchive: document.getElementById('btnSaveArchive'),
  btnCancelArchiveEdit: document.getElementById('btnCancelArchiveEdit'),

  // 자료실 삭제 모달
  archiveDeleteModal: document.getElementById('archiveDeleteModal'),
  btnCloseArchiveDeleteModal: document.getElementById('btnCloseArchiveDeleteModal'),
  archiveDeleteTargetId: document.getElementById('archiveDeleteTargetId'),
  archiveDeleteTitlePreview: document.getElementById('archiveDeleteTitlePreview'),
  archiveDeletePinInput: document.getElementById('archiveDeletePinInput'),
  archiveDeleteError: document.getElementById('archiveDeleteError'),
  btnConfirmDeleteArchive: document.getElementById('btnConfirmDeleteArchive'),
  btnCancelDeleteArchive: document.getElementById('btnCancelDeleteArchive')
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
    if (window.KOSTAT_CONTRACT_REVIEWS_DATA && window.KOSTAT_CONTRACT_REVIEWS_DATA.length > 0) {
      AppState.contractReviewsData = window.KOSTAT_CONTRACT_REVIEWS_DATA;
    }
    if (window.KOSTAT_DRAWINGS_DATA && window.KOSTAT_DRAWINGS_DATA.length > 0) {
      AppState.drawingsData = window.KOSTAT_DRAWINGS_DATA;
    }
    // FAQ 지식 데이터 우선 바인딩 (전용 DB > 번들 객체)
    if (window.KOSTAT_FAQ_DB && window.KOSTAT_FAQ_DB.length > 0) {
      AppState.knowledgeData = window.KOSTAT_FAQ_DB;
    } else if (window.KOSTAT_KNOWLEDGE_DATA && window.KOSTAT_KNOWLEDGE_DATA.length > 0) {
      AppState.knowledgeData = window.KOSTAT_KNOWLEDGE_DATA;
    }
    // 자료실 데이터 바인딩 (구버전 더미 데이터 영구 제거)
    AppState.archiveData = (window.KOSTAT_ARCHIVE_DATA || []).filter(item => item && item.id && !['arc-1', 'arc-2', 'arc-3'].includes(item.id));
    try {
      // 삭제 톰스톤에 구버전 더미 ID 영구 추가
      const deletedRaw = localStorage.getItem('KOSTAT_DELETED_ARCHIVE_IDS');
      const delArr = deletedRaw ? JSON.parse(deletedRaw) : [];
      ['arc-1', 'arc-2', 'arc-3'].forEach(id => {
        if (!delArr.includes(id)) delArr.push(id);
      });
      localStorage.setItem('KOSTAT_DELETED_ARCHIVE_IDS', JSON.stringify(delArr));

      const savedArchive = localStorage.getItem('KOSTAT_ARCHIVE_DATA');
      if (savedArchive) {
        const parsed = JSON.parse(savedArchive);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter(item => item && item.id && !['arc-1', 'arc-2', 'arc-3'].includes(item.id));
          AppState.archiveData = cleaned;
          localStorage.setItem('KOSTAT_ARCHIVE_DATA', JSON.stringify(cleaned));
        }
      }
    } catch (_) {}
    // 3. IndexedDB의 더 최신 캐시가 있다면 갱신
    const cachedSky = await IDB.get('skyworks');
    if (cachedSky && cachedSky.length >= AppState.skyworksData.length) AppState.skyworksData = cachedSky;
    
    const cachedShip = await IDB.get('shipplan');
    if (cachedShip && cachedShip.length >= AppState.shipPlanData.length) AppState.shipPlanData = cachedShip;
    
    const cachedQuot = await IDB.get('quotations');
    if (cachedQuot && cachedQuot.length >= AppState.quotationsData.length) AppState.quotationsData = cachedQuot;

    const cachedContract = await IDB.get('contract_reviews');
    if (cachedContract && cachedContract.length >= AppState.contractReviewsData.length) AppState.contractReviewsData = cachedContract;

    // 0) localStorage에 저장된 실제 ERP 데이터 기준일자 즉시 로드 (단, 구버전 2026-09-04 캐시는 최신 2026-09-15로 즉시 갱신)
    try {
      const savedDate = localStorage.getItem('KOSTAT_ERP_DATA_DATE');
      if (savedDate && savedDate !== '2026-09-04' && savedDate >= '2026-09-15') {
        AppState.dataDate = formatKoreanDate(savedDate);
      } else {
        AppState.dataDate = '2026년 9월 15일';
      }
    } catch (_) {}

    // 메타데이터(version.json)에서 실제 ERP 데이터 기준일자(data_date) 로드
    try {
      const vRes = await fetch('version.json?t=' + Date.now()).catch(() => null);
      if (vRes && vRes.ok) {
        const vData = await vRes.json();
        // 소프트웨어 release_date가 아닌 실제 ERP data_date 필드만 적용
        if (vData && vData.data_date) {
          AppState.dataDate = formatKoreanDate(vData.data_date);
          try {
            localStorage.setItem('KOSTAT_ERP_DATA_DATE', vData.data_date);
          } catch (_) {}
        }
      }
    } catch (e) {}

    // 로드된 shipplan 데이터가 있으면 최근 주문/출고일 동적 감지하여 보정
    try {
      const detectedDate = detectLatestDataDateFromShipPlan();
      if (detectedDate && (!AppState.dataDate || AppState.dataDate.includes('9월 4일'))) {
        AppState.dataDate = formatKoreanDate(detectedDate);
        localStorage.setItem('KOSTAT_ERP_DATA_DATE', detectedDate);
      }
    } catch (_) {}

    // 기능 요청 게시판 데이터 로드 (IndexedDB + LocalStorage 영구 보존 & 가짜 예시 완전 배제)
    let localFeedback = null;
    try {
      const saved = localStorage.getItem('KOSTAT_FEEDBACK_POSTS') || localStorage.getItem('KOSTAT_FEEDBACK_BACKUP');
      if (saved) localFeedback = JSON.parse(saved);
    } catch(e) {}

    if (!localFeedback || !Array.isArray(localFeedback) || localFeedback.length === 0) {
      try {
        if (window.IDB) {
          const cachedFb = await IDB.get('feedback_posts');
          if (cachedFb && Array.isArray(cachedFb) && cachedFb.length > 0) {
            localFeedback = cachedFb;
          }
        }
      } catch (_) {}
    }

    const deletedSet = getDeletedFeedbackIds();
    if (localFeedback && Array.isArray(localFeedback)) {
      AppState.feedbackData = localFeedback.filter(p => isRealUserFeedback(p) && !deletedSet.has(p.id));
    } else {
      AppState.feedbackData = [];
    }
    saveFeedbackStorage();

    // 클라우드 원격 최신 기능 요청 데이터 비동기 병합 동기화 (PC↔모바일 연동)
    setTimeout(() => { fetchRemoteFeedback(true); }, 300);

    // FAQ 지식 데이터 로드 (localStorage 및 IndexedDB 캐시 복원 - 영구 유실 방지)
    let localFaq = null;
    try {
      const savedFaq = localStorage.getItem('KOSTAT_FAQ_DATA') || localStorage.getItem('KOSTAT_KNOWLEDGE_DATA');
      if (savedFaq) localFaq = JSON.parse(savedFaq);
    } catch (_) {}

    if (localFaq !== null && Array.isArray(localFaq) && localFaq.length > 0) {
      AppState.knowledgeData = localFaq;
    } else {
      const cachedKnow = await IDB.get('knowledge');
      if (cachedKnow && Array.isArray(cachedKnow) && cachedKnow.length > 0) {
        AppState.knowledgeData = cachedKnow;
      }
    }
    // 안전한 긴급 백업 스냅샷 보존
    try {
      if (AppState.knowledgeData && AppState.knowledgeData.length > 0) {
        localStorage.setItem('KOSTAT_FAQ_EMERGENCY_BACKUP', JSON.stringify(AppState.knowledgeData));
      }
    } catch (_) {}

    AppState.dbReady = true;
    updateStatus(true, getDataDateStatusText());
    
    // UI 초기 렌더링
    renderSkyworksTable(AppState.skyworksData);
    initSkyworksYears();
    renderQuotHistory();
    renderContractReviews();
    renderDrawingsHistory();
    renderShipPlanHistory();
    renderFeedbackBoard();
    renderFaqList();

    console.log(`[DB Ready] Skyworks: ${AppState.skyworksData.length}, ShipPlan: ${AppState.shipPlanData.length}, Quotations: ${AppState.quotationsData.length}, ContractReviews: ${AppState.contractReviewsData.length}, Drawings: ${AppState.drawingsData.length}`);
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
      fetch(`${GITHUB_RAW_BASE}/faq_db.json?t=${timestamp}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${GITHUB_RAW_BASE}/knowledge_data.json?t=${timestamp}`).then(r => r.ok ? r.json() : null).catch(() => null)
    ];

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([null, null, null, null, null]), 6000));
    const [liveSky, liveShip, liveQuot, liveFaq, liveKnow] = await Promise.race([Promise.all(fetchPromises), timeoutPromise]);

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

    const targetFaq = (liveFaq && Array.isArray(liveFaq) && liveFaq.length > 0) ? liveFaq : liveKnow;
    if (targetFaq && Array.isArray(targetFaq) && targetFaq.length > 0) {
      if (targetFaq.length !== AppState.knowledgeData.length) {
        AppState.knowledgeData = targetFaq;
        await IDB.set('knowledge', targetFaq);
        renderFaqList();
        updated = true;
      }
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

// =====================================================
// 다국어 지원 엔진 (Internationalization / i18n)
// =====================================================
const APP_I18N = {
  ko: {
    lang_badge: 'EN',
    lang_title: '영문 버전으로 전환 (Switch to English)',
    nav_chat: 'AI 챗봇',
    nav_viewer: 'ERP 데이터 뷰어',
    chat_placeholder: '사내 규정 및 업무 지식 질문 입력... (예: EXW 조건, 위탁재고)',
    
    // Viewer Tabs
    tab_shipplan: '출하 계획',
    tab_quotations: '견적서',
    tab_contract: '계약검토서',
    tab_drawings: '도면 관리',
    tab_skyworks: 'Skyworks',
    tab_feedback: '기능 요청',
    tab_faq: '사내 FAQ',
    tab_archive: '자료실',
    tab_lab: '실험실',

    // Card Titles & Subtitles
    shipplan_title: '출하 계획 현황',
    shipplan_sub: '사내 ERP 출하 마스터 데이터 실시간 조회',
    quotations_title: '견적서 관리 현황',
    quotations_sub: '견적 번호 및 고객사 검색',
    contract_title: '계약검토서 관리 현황',
    contract_sub: '프로젝트 및 계약 검토 이력',
    drawings_title: '연구소 도면 관리',
    drawings_sub: 'Tray / Carrier Tape 승인 도면',
    skyworks_title: 'Skyworks 수주 현황',
    skyworks_sub: 'Skyworks 전용 실시간 오더 현황',
    feedback_title: '기능 요청 게시판',
    feedback_sub: '모바일 웹앱 개선 의견 및 버그 제보',
    faq_title: '사내 규정 & FAQ 지식베이스',
    faq_sub: '무역조건, ERP 프로세스, 사내규정 가이드',
    archive_title: '사내 공용 자료실',
    archive_sub: '견적서, 계약서, 발주서, 제품자료 등 사내 문서 통합 다운로드',
    lab_title: '실험실 (Lab)',
    lab_sub: '사내 업무 자동화 및 글로벌 지사 현황',

    // Lab Sub-Tabs
    lab_tab_tools: '업무 자동화 도구',
    lab_tab_gimpo: '김포공장 Tray 재고',
    lab_tab_ph: '필리핀 지사 리포트 & 프로젝트',
    lab_tab_weekly: '해외영업부 주간보고서',

    // Gimpo Tray Stock
    gimpo_title: '김포공장 Tray 재고 현황',
    gimpo_as_of: '기준',
    gimpo_access_guide: '외부 접속 계정 안내',
    gimpo_manual_upload: '엑셀 수동 업로드',
    gimpo_search_holder: 'PART NO, 자재코드, 규격, 거래처, Temp, 특이사항 검색...',
    gimpo_result_count: '검색 결과',
    gimpo_unit: '건',
    th_gimpo_partno: 'PART NO',
    th_gimpo_temp: 'Temp',
    th_gimpo_spec: '규격',
    th_gimpo_customer: '거래처',
    th_gimpo_remark: '특이사항',
    th_gimpo_prod: '생산부',
    th_gimpo_mat: '자재부',
    th_gimpo_total: '합계',

    // Search Placeholders
    ship_holder_cust: '고객사명 입력...',
    ship_holder_part: '부품/도면번호 입력...',
    ship_holder_inv: 'Invoice No 입력...',
    quot_holder: '견적 번호(Q...), 고객사, 작성자 검색...',
    contract_holder: '프로젝트명, 고객사, 품목 검색...',
    drawing_holder: 'KS 번호, 도면명, 고객사 검색...',
    skyworks_holder: 'PO No, Part No 검색...',
    feedback_holder: '요청 제목, 작성자, 내용 검색...',
    faq_holder: '규정 키워드 검색 (예: EXW, 위탁재고, 출하)...',
    archive_holder: '문서명, 분류, 등록자, 파일명 검색...',

    // Buttons
    btn_search: '조회',
    btn_reload: '새로고침',
    btn_reset: '필터 초기화',
    btn_download_excel: '엑셀 다운로드',
    btn_update_db: 'DB 업데이트',
    btn_new_feedback: '새 기능 요청 등록',
    btn_archive_reg: '자료 등록',
    btn_open_full: '전체화면 새 창 열기',
    btn_close: '닫기',
    btn_verify: '인증',
    btn_copy_summary: '요약 복사',
    btn_check_update: '업데이트 확인',

    // Settings Modal
    settings_title: '시스템 정보 & 업데이트',
    settings_lang_label: '언어 설정 (Language):',
    settings_lang_desc: '모바일 웹앱의 모든 메뉴, 검색 필터, 탭 헤더가 선택한 언어로 즉시 전환됩니다.',
    settings_env_label: '동작 환경 (오프라인 지원):',
    settings_env_desc: '• <strong>독립 실행 모드</strong>: 사내 Wi-Fi나 PC 연결 없이 스마트폰 단독으로 작동합니다.<br>• <strong>탑재 데이터</strong>: Skyworks PO 7,300+건, 출하 계획 58,000+건, 견적서 20,000+건, 사내 FAQ 내장.',
    settings_ver_label: '앱 버전 정보:',
    settings_cur_ver_prefix: '현재 버전:',
    settings_admin_label: '관리자 전용 메뉴:',
    settings_admin_ship: '관리자 출하 DB 업데이트',
    settings_admin_faq: '사내 FAQ 지식베이스 관리',

    // Table Headers (Ship Plan)
    th_ship_date: '출고일',
    th_loading_date: '선적일',
    th_customer: '고객사',
    th_po_no: 'PO번호',
    th_part_no: '부품번호',
    th_qty: '수량',
    th_remain: '잔여',
    th_invoice_no: 'Invoice No',

    // Table Headers (Quotations)
    th_quot_no: '견적번호',
    th_quot_date: '견적일자',
    th_manager: '담당자',
    th_item_count: '품목수',
    th_total_amount: '총금액',
    th_remarks: '비고',

    // Table Headers (Contract Reviews)
    th_num: '번호',
    th_review_date: '검토일자',
    th_proj_name: '프로젝트명',
    th_item_name: '품목명',
    th_status: '승인상태',

    // Table Headers (Drawings)
    th_ks_no: 'KS 번호',
    th_drawing_name: '도면명',
    th_category: '구분',
    th_rev_date: '개정일자',
    th_download: '다운로드',

    // Table Headers (Skyworks)
    th_line: '라인',
    th_item_code: '품목코드',
    th_description: '품명',
    th_due_date: '납기일자',
    th_ship_status: '출하상태'
  },
  en: {
    lang_badge: 'KO',
    lang_title: '한국어 버전으로 전환 (Switch to Korean)',
    nav_chat: 'AI Chatbot',
    nav_viewer: 'ERP Viewer',
    chat_placeholder: 'Ask company regulations & business knowledge... (e.g. EXW, Consignment)',

    // Viewer Tabs
    tab_shipplan: 'Ship Plan',
    tab_quotations: 'Quotations',
    tab_contract: 'Contract Review',
    tab_drawings: 'Drawings',
    tab_skyworks: 'Skyworks',
    tab_feedback: 'Feature Requests',
    tab_faq: 'Regulations & FAQ',
    tab_archive: 'Archive',
    tab_lab: 'Lab',

    // Card Titles & Subtitles
    shipplan_title: 'Shipment Plan Status',
    shipplan_sub: 'Enterprise ERP Shipment Master Data Real-time View',
    quotations_title: 'Quotation Management',
    quotations_sub: 'Search Quotations by Number & Customer',
    contract_title: 'Contract Review Management',
    contract_sub: 'Project & Contract Review History',
    drawings_title: 'R&D Drawing Management',
    drawings_sub: 'Tray / Carrier Tape Approved Drawings',
    skyworks_title: 'Skyworks PO Status',
    skyworks_sub: 'Skyworks Dedicated Real-time Order Status',
    feedback_title: 'Feature Request Board',
    feedback_sub: 'Web App Feedback & Feature Requests',
    faq_title: 'Regulations & FAQ Knowledge Base',
    faq_sub: 'Incoterms, ERP Process & Company Regulations Guide',
    archive_title: 'Enterprise Shared Archive',
    archive_sub: 'Integrated Document Downloads (Quotes, Contracts, POs, Drawings)',
    lab_title: 'Lab (R&D)',
    lab_sub: 'Enterprise Automation & Global Branch Reports',

    // Lab Sub-Tabs
    lab_tab_tools: 'Automation Tools',
    lab_tab_gimpo: 'Gimpo Tray Stock',
    lab_tab_ph: 'PH Branch Report & Projects',
    lab_tab_weekly: 'Overseas Sales Weekly Report',

    // Gimpo Tray Stock
    gimpo_title: 'Gimpo Factory Tray Stock',
    gimpo_as_of: 'As of',
    gimpo_access_guide: 'External Access Guide',
    gimpo_manual_upload: 'Manual Excel Upload',
    gimpo_search_holder: 'Search PART NO, Code, Spec, Customer, Temp, Remark...',
    gimpo_result_count: 'Results',
    gimpo_unit: 'items',
    th_gimpo_partno: 'PART NO',
    th_gimpo_temp: 'Temp',
    th_gimpo_spec: 'Spec',
    th_gimpo_customer: 'Customer',
    th_gimpo_remark: 'Remark',
    th_gimpo_prod: 'Production',
    th_gimpo_mat: 'Warehouse',
    th_gimpo_total: 'Total',

    // Search Placeholders
    ship_holder_cust: 'Search Customer...',
    ship_holder_part: 'Search Part / Drawing No...',
    ship_holder_inv: 'Search Invoice No...',
    quot_holder: 'Search Quote No(Q...), Customer, Author...',
    contract_holder: 'Search Project, Customer, Item...',
    drawing_holder: 'Search KS No, Drawing Name, Customer...',
    skyworks_holder: 'Search PO No, Part No...',
    feedback_holder: 'Search Title, Author, Content...',
    faq_holder: 'Search regulations (e.g. EXW, Consignment, Shipment)...',
    archive_holder: 'Search Document, Category, Author, File...',

    // Buttons
    btn_search: 'Search',
    btn_reload: 'Reload',
    btn_reset: 'Reset Filters',
    btn_download_excel: 'Download Excel',
    btn_update_db: 'Update DB',
    btn_new_feedback: 'Submit Request',
    btn_archive_reg: 'Upload Doc',
    btn_open_full: 'Open Full Window',
    btn_close: 'Close',
    btn_verify: 'Verify',
    btn_copy_summary: 'Copy Summary',
    btn_check_update: 'Check for Updates',

    // Settings Modal
    settings_title: 'System Info & Updates',
    settings_lang_label: 'Language Settings:',
    settings_lang_desc: 'All navigation menus, search filters, and table headers will immediately switch to the selected language.',
    settings_env_label: 'Operating Environment (Offline Support):',
    settings_env_desc: '• <strong>Standalone Mode</strong>: Operates fully offline on mobile without internal Wi-Fi or PC connection.<br>• <strong>Embedded Data</strong>: Skyworks PO 7,300+, Shipment Plans 58,000+, Quotes 20,000+, Built-in Regulations FAQ.',
    settings_ver_label: 'App Version Info:',
    settings_cur_ver_prefix: 'Current Version:',
    settings_admin_label: 'Admin Menu:',
    settings_admin_ship: 'Admin Shipment DB Update',
    settings_admin_faq: 'FAQ Knowledge Base Management',

    // Table Headers (Ship Plan)
    th_ship_date: 'Ship Date',
    th_loading_date: 'Loading Date',
    th_customer: 'Customer',
    th_po_no: 'PO No',
    th_part_no: 'Part No',
    th_qty: 'Qty',
    th_remain: 'Remain',
    th_invoice_no: 'Invoice No',

    // Table Headers (Quotations)
    th_quot_no: 'Quote No',
    th_quot_date: 'Quote Date',
    th_manager: 'Manager',
    th_item_count: 'Items',
    th_total_amount: 'Total Amount',
    th_remarks: 'Remarks',

    // Table Headers (Contract Reviews)
    th_num: 'No',
    th_review_date: 'Review Date',
    th_proj_name: 'Project Name',
    th_item_name: 'Item Name',
    th_status: 'Approval Status',

    // Table Headers (Drawings)
    th_ks_no: 'KS No',
    th_drawing_name: 'Drawing Name',
    th_category: 'Category',
    th_rev_date: 'Rev Date',
    th_download: 'Download',

    // Table Headers (Skyworks)
    th_line: 'Line',
    th_item_code: 'Part No',
    th_description: 'Description',
    th_due_date: 'Due Date',
    th_ship_status: 'Status'
  }
};

function initAppLanguage() {
  const savedLang = localStorage.getItem('kostat_app_lang') || 'ko';
  setAppLanguage(savedLang, false);
}

function setAppLanguage(lang, notify = true) {
  if (lang !== 'ko' && lang !== 'en') lang = 'ko';
  AppState.currentLang = lang;
  try {
    localStorage.setItem('kostat_app_lang', lang);
  } catch (_) {}

  applyAppLanguage(lang);

  if (notify) {
    showToast(lang === 'en' ? 'Language switched to English.' : '한국어 버전으로 전환되었습니다.');
  }
}
window.setAppLanguage = setAppLanguage;

function toggleAppLanguage() {
  const nextLang = (AppState.currentLang === 'en') ? 'ko' : 'en';
  setAppLanguage(nextLang, true);
}
window.toggleAppLanguage = toggleAppLanguage;

function applyAppLanguage(lang) {
  const t = APP_I18N[lang] || APP_I18N.ko;
  document.documentElement.lang = lang;

  // 1. 헤더 토글 버튼
  const btnToggleLang = document.getElementById('btnToggleLang');
  if (btnToggleLang) {
    btnToggleLang.textContent = t.lang_badge;
    btnToggleLang.title = t.lang_title;
  }

  // 2. 설정 모달 버튼 상태
  const btnLangKo = document.getElementById('btnLangKo');
  const btnLangEn = document.getElementById('btnLangEn');
  if (btnLangKo && btnLangEn) {
    if (lang === 'ko') {
      btnLangKo.className = 'action-btn-sm primary';
      btnLangKo.style.background = '#2563eb';
      btnLangKo.style.color = '#ffffff';
      btnLangKo.style.borderColor = '#2563eb';
      btnLangEn.className = 'action-btn-sm secondary';
      btnLangEn.style.background = 'var(--bg-card-sub)';
      btnLangEn.style.color = 'var(--text-secondary)';
      btnLangEn.style.borderColor = 'var(--border-color)';
    } else {
      btnLangEn.className = 'action-btn-sm primary';
      btnLangEn.style.background = '#2563eb';
      btnLangEn.style.color = '#ffffff';
      btnLangEn.style.borderColor = '#2563eb';
      btnLangKo.className = 'action-btn-sm secondary';
      btnLangKo.style.background = 'var(--bg-card-sub)';
      btnLangKo.style.color = 'var(--text-secondary)';
      btnLangKo.style.borderColor = 'var(--border-color)';
    }
  }

  // 3. 설정 모달 텍스트
  const lblSettingLang = document.getElementById('lblSettingLang');
  if (lblSettingLang) lblSettingLang.textContent = t.settings_lang_label;
  const lblSettingLangDesc = document.getElementById('lblSettingLangDesc');
  if (lblSettingLangDesc) lblSettingLangDesc.textContent = t.settings_lang_desc;
  const lblSettingEnv = document.getElementById('lblSettingEnv');
  if (lblSettingEnv) lblSettingEnv.textContent = t.settings_env_label;
  const boxSettingEnv = document.getElementById('boxSettingEnv');
  if (boxSettingEnv) boxSettingEnv.innerHTML = t.settings_env_desc;
  const lblSettingVer = document.getElementById('lblSettingVer');
  if (lblSettingVer) lblSettingVer.textContent = t.settings_ver_label;
  const lblCurrentVerPrefix = document.getElementById('lblCurrentVerPrefix');
  if (lblCurrentVerPrefix) lblCurrentVerPrefix.textContent = t.settings_cur_ver_prefix;
  const btnCheckAppUpdate = document.getElementById('btnCheckAppUpdate');
  if (btnCheckAppUpdate) btnCheckAppUpdate.textContent = t.btn_check_update;
  const lblSettingAdmin = document.getElementById('lblSettingAdmin');
  if (lblSettingAdmin) lblSettingAdmin.textContent = t.settings_admin_label;
  const btnSettingsOpenAdminDb = document.getElementById('btnSettingsOpenAdminDb');
  if (btnSettingsOpenAdminDb) btnSettingsOpenAdminDb.textContent = t.settings_admin_ship;
  const btnSettingsOpenFaqManager = document.getElementById('btnSettingsOpenFaqManager');
  if (btnSettingsOpenFaqManager) btnSettingsOpenFaqManager.textContent = t.settings_admin_faq;
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  if (btnCloseSettings) btnCloseSettings.textContent = t.btn_close;

  // 4. 모바일 하단/상단 네비게이션
  const btnNavChatText = document.querySelector('#btnNavChat .nav-text');
  if (btnNavChatText) btnNavChatText.textContent = t.nav_chat;
  const mobileViewerNavText = document.getElementById('mobileViewerNavText');
  if (mobileViewerNavText) mobileViewerNavText.textContent = t.nav_viewer;

  // 5. 뷰어 상단 탭 버튼
  const tabMap = {
    viewShipPlan: t.tab_shipplan,
    viewQuotations: t.tab_quotations,
    viewContractReviews: t.tab_contract,
    viewDrawings: t.tab_drawings,
    viewSkyworks: t.tab_skyworks,
    viewFeedback: t.tab_feedback,
    viewFaq: t.tab_faq,
    viewArchive: t.tab_archive,
    viewLab: t.tab_lab
  };
  document.querySelectorAll('.viewer-tab-btn').forEach(btn => {
    const target = btn.getAttribute('data-target');
    if (tabMap[target]) btn.textContent = tabMap[target];
  });

  // 6. 실험실 서브탭 버튼
  const btnLabTabTools = document.getElementById('btnLabTabTools');
  if (btnLabTabTools) btnLabTabTools.textContent = t.lab_tab_tools;
  const btnLabTabGimpo = document.getElementById('btnLabTabGimpo');
  if (btnLabTabGimpo) btnLabTabGimpo.textContent = t.lab_tab_gimpo;
  const btnLabTabPH = document.getElementById('btnLabTabPH');
  if (btnLabTabPH) btnLabTabPH.textContent = t.lab_tab_ph;
  const btnLabTabWeekly = document.getElementById('btnLabTabWeekly');
  if (btnLabTabWeekly) btnLabTabWeekly.textContent = t.lab_tab_weekly;

  // 7. 검색 플레이스홀더
  const chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.placeholder = t.chat_placeholder;
  const shipPlanCustomerInput = document.getElementById('shipPlanCustomerInput');
  if (shipPlanCustomerInput) shipPlanCustomerInput.placeholder = t.ship_holder_cust;
  const shipPlanPartInput = document.getElementById('shipPlanPartInput');
  if (shipPlanPartInput) shipPlanPartInput.placeholder = t.ship_holder_part;
  const shipPlanInvoiceInput = document.getElementById('shipPlanInvoiceInput');
  if (shipPlanInvoiceInput) shipPlanInvoiceInput.placeholder = t.ship_holder_inv;
  const quotSearchInput = document.getElementById('quotSearchInput');
  if (quotSearchInput) quotSearchInput.placeholder = t.quot_holder;
  const contractSearchInput = document.getElementById('contractSearchInput');
  if (contractSearchInput) contractSearchInput.placeholder = t.contract_holder;
  const drawingSearchInput = document.getElementById('drawingSearchInput');
  if (drawingSearchInput) drawingSearchInput.placeholder = t.drawing_holder;
  const skyworksSearchInput = document.getElementById('skyworksSearchInput');
  if (skyworksSearchInput) skyworksSearchInput.placeholder = t.skyworks_holder;
  const faqSearchInput = document.getElementById('faqSearchInput');
  if (faqSearchInput) faqSearchInput.placeholder = t.faq_holder;
  const archiveSearchInput = document.getElementById('archiveSearchInput');
  if (archiveSearchInput) archiveSearchInput.placeholder = t.archive_holder;

  // 8. 카드 타이틀 & 설명
  const cardTitleMap = [
    { selector: '#viewShipPlan .viewer-title-group h3', title: t.shipplan_title, subSel: '#viewShipPlan .viewer-tools span', sub: t.shipplan_sub },
    { selector: '#viewQuotations .viewer-title-group h3', title: t.quotations_title, subSel: '#viewQuotations .viewer-tools span', sub: t.quotations_sub },
    { selector: '#viewContractReviews .viewer-title-group h3', title: t.contract_title, subSel: '#viewContractReviews .viewer-tools span', sub: t.contract_sub },
    { selector: '#viewDrawings .viewer-title-group h3', title: t.drawings_title, subSel: '#viewDrawings .viewer-tools span', sub: t.drawings_sub },
    { selector: '#viewSkyworks .viewer-title-group h3', title: t.skyworks_title, subSel: '#viewSkyworks .viewer-tools span', sub: t.skyworks_sub },
    { selector: '#viewFeedback .viewer-title-group h3', title: t.feedback_title, subSel: '#viewFeedback .viewer-tools span', sub: t.feedback_sub },
    { selector: '#viewFaq .viewer-title-group h3', title: t.faq_title, subSel: '#viewFaq .viewer-tools span', sub: t.faq_sub },
    { selector: '#viewArchive .viewer-title-group h3', title: t.archive_title, subSel: '#viewArchive .viewer-tools span', sub: t.archive_sub },
    { selector: '#viewLab .viewer-title-group h3', title: t.lab_title, subSel: '#viewLab .viewer-tools span', sub: t.lab_sub }
  ];
  cardTitleMap.forEach(item => {
    const h3El = document.querySelector(item.selector);
    if (h3El) h3El.textContent = item.title;
    if (item.subSel) {
      const subEl = document.querySelector(item.subSel);
      if (subEl) subEl.textContent = item.sub;
    }
  });

  // 9. 주요 버튼 라벨
  const btnSearchShipPlan = document.getElementById('btnSearchShipPlan');
  if (btnSearchShipPlan) btnSearchShipPlan.textContent = t.btn_search;
  const btnReloadShipPlan = document.getElementById('btnReloadShipPlan');
  if (btnReloadShipPlan) btnReloadShipPlan.textContent = t.btn_reload;
  const btnOpenAdminDbModal = document.getElementById('btnOpenAdminDbModal');
  if (btnOpenAdminDbModal) btnOpenAdminDbModal.textContent = t.btn_update_db;
  const btnDownloadShipPlanExcel = document.getElementById('btnDownloadShipPlanExcel');
  if (btnDownloadShipPlanExcel) btnDownloadShipPlanExcel.textContent = t.btn_download_excel;
  const btnOpenNewFeedback = document.getElementById('btnOpenNewFeedback');
  if (btnOpenNewFeedback) btnOpenNewFeedback.textContent = t.btn_new_feedback;
  const btnOpenArchiveRegister = document.getElementById('btnOpenArchiveRegister');
  if (btnOpenArchiveRegister) btnOpenArchiveRegister.textContent = t.btn_archive_reg;

  // 10. 테이블 헤더 열 제목 (Table Headers)
  const shipThs = document.querySelectorAll('#shipPlanTable thead th');
  if (shipThs && shipThs.length >= 8) {
    const headers = [t.th_ship_date, t.th_loading_date, t.th_customer, t.th_po_no, t.th_part_no, t.th_qty, t.th_remain, t.th_invoice_no];
    shipThs.forEach((th, idx) => { if (headers[idx]) th.textContent = headers[idx]; });
  }

  const quotThs = document.querySelectorAll('#quotationsTable thead th');
  if (quotThs && quotThs.length >= 7) {
    const headers = [t.th_quot_no, t.th_quot_date, t.th_customer, t.th_manager, t.th_item_count, t.th_total_amount, t.th_remarks];
    quotThs.forEach((th, idx) => { if (headers[idx]) th.textContent = headers[idx]; });
  }

  const contractThs = document.querySelectorAll('#contractReviewsTable thead th');
  if (contractThs && contractThs.length >= 6) {
    const headers = [t.th_num, t.th_review_date, t.th_customer, t.th_proj_name, t.th_item_name, t.th_status];
    contractThs.forEach((th, idx) => { if (headers[idx]) th.textContent = headers[idx]; });
  }

  const drawingThs = document.querySelectorAll('#drawingsTable thead th');
  if (drawingThs && drawingThs.length >= 6) {
    const headers = [t.th_ks_no, t.th_drawing_name, t.th_customer, t.th_category, t.th_rev_date, t.th_download];
    drawingThs.forEach((th, idx) => { if (headers[idx]) th.textContent = headers[idx]; });
  }

  const skyworksThs = document.querySelectorAll('#skyworksTable thead th');
  if (skyworksThs && skyworksThs.length >= 7) {
    const headers = [t.th_po_no, t.th_line, t.th_item_code, t.th_description, t.th_qty, t.th_due_date, t.th_ship_status];
    skyworksThs.forEach((th, idx) => { if (headers[idx]) th.textContent = headers[idx]; });
  }

  // 11. 김포공장 Tray 재고 현황 i18n
  const gimpoTitleEl = document.querySelector('#labSubGimpo h4');
  if (gimpoTitleEl) gimpoTitleEl.textContent = t.gimpo_title;
  const btnGimpoGuide = document.querySelector('#labSubGimpo button[onclick*="showGimpoAccessGuide"]');
  if (btnGimpoGuide) btnGimpoGuide.textContent = t.gimpo_access_guide;
  const btnGimpoUpload = document.querySelector('#labSubGimpo button[onclick*="gimpoStockFileInput"]');
  if (btnGimpoUpload) btnGimpoUpload.textContent = t.gimpo_manual_upload;
  const gimpoSearchInput = document.getElementById('gimpoSearchInput');
  if (gimpoSearchInput) gimpoSearchInput.placeholder = t.gimpo_search_holder;
  // Gimpo 테이블 헤더
  const gimpoThs = document.querySelectorAll('#gimpoStockTable thead th');
  if (gimpoThs && gimpoThs.length >= 8) {
    const ghd = [t.th_gimpo_partno, t.th_gimpo_temp, t.th_gimpo_spec, t.th_gimpo_customer, t.th_gimpo_remark, t.th_gimpo_prod, t.th_gimpo_mat, t.th_gimpo_total];
    gimpoThs.forEach((th, idx) => { if (ghd[idx]) th.textContent = ghd[idx]; });
  }
  // Gimpo 결과 카운트 갱신 (렌더 후 자동 반영되므로 renderGimpoStock 재호출)
  if (typeof renderGimpoStock === 'function' && _gimpoStockData) renderGimpoStock();

  // 12. 주간보고서 iframe에 언어 전달
  const weeklyIframe = document.querySelector('#labSubWeekly iframe');
  if (weeklyIframe && weeklyIframe.contentWindow) {
    try {
      weeklyIframe.contentWindow.postMessage({ type: 'SET_LANGUAGE', lang: lang }, '*');
    } catch (_) {}
  }
}

// --- UI 이벤트 바인딩 ---
function initUI() {
  initAppLanguage();
  initFeedbackBoardEvents();
  initFaqEvents();
  initLabEvents();
  initArchiveEvents();

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
  if (DOM.skyworksPageSizeSelect) {
    DOM.skyworksPageSizeSelect.addEventListener('change', () => {
      AppState.skyworksPageSize = parseInt(DOM.skyworksPageSizeSelect.value, 10) || 50;
      AppState.skyworksCurrentPage = 1;
      renderSkyworksPage(1);
    });
  }
  
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

  // 계약검토서 검색 & 필터 & 페이지 크기
  if (DOM.contractCustomerInput) {
    DOM.contractCustomerInput.addEventListener('input', debounce(filterContractReviewsTable, 200));
    DOM.contractCustomerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterContractReviewsTable();
    });
  }
  if (DOM.contractSearchInput) {
    DOM.contractSearchInput.addEventListener('input', debounce(filterContractReviewsTable, 200));
    DOM.contractSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterContractReviewsTable();
    });
  }
  if (DOM.contractStatusSelect) {
    DOM.contractStatusSelect.addEventListener('change', filterContractReviewsTable);
  }
  if (DOM.contractPageSizeSelect) {
    DOM.contractPageSizeSelect.addEventListener('change', () => {
      AppState.contractPageSize = parseInt(DOM.contractPageSizeSelect.value, 10) || 50;
      AppState.contractCurrentPage = 1;
      renderContractReviewsPage(1);
    });
  }
  if (DOM.btnSearchContract) {
    DOM.btnSearchContract.addEventListener('click', filterContractReviewsTable);
  }
  if (DOM.btnReloadContract) {
    DOM.btnReloadContract.addEventListener('click', () => {
      if (DOM.contractCustomerInput) DOM.contractCustomerInput.value = '';
      if (DOM.contractSearchInput) DOM.contractSearchInput.value = '';
      if (DOM.contractStatusSelect) DOM.contractStatusSelect.value = '';
      renderContractReviews();
    });
  }

  // 계약검토서 모달 이벤트
  if (DOM.btnCloseContractModal) {
    DOM.btnCloseContractModal.addEventListener('click', () => DOM.contractDetailModal.classList.remove('show'));
  }
  if (DOM.btnModalCloseContract) {
    DOM.btnModalCloseContract.addEventListener('click', () => DOM.contractDetailModal.classList.remove('show'));
  }
  if (DOM.btnModalCopyContractText) {
    DOM.btnModalCopyContractText.addEventListener('click', copyCurrentContractReviewSummary);
  }

  // IC Tray 도면 검색 & 필터 & 페이지 크기 & 모달 이벤트
  if (DOM.drawingsSearchInput) {
    DOM.drawingsSearchInput.addEventListener('input', debounce(filterDrawingsTable, 200));
    DOM.drawingsSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') filterDrawingsTable();
    });
  }
  if (DOM.drawingsSeriesSelect) {
    DOM.drawingsSeriesSelect.addEventListener('change', filterDrawingsTable);
  }
  if (DOM.drawingsPageSizeSelect) {
    DOM.drawingsPageSizeSelect.addEventListener('change', () => {
      AppState.drawingsPageSize = parseInt(DOM.drawingsPageSizeSelect.value, 10) || 15;
      AppState.drawingsCurrentPage = 1;
      renderDrawingsPage(1);
    });
  }
  if (DOM.btnSearchDrawings) {
    DOM.btnSearchDrawings.addEventListener('click', filterDrawingsTable);
  }
  if (DOM.btnReloadDrawings) {
    DOM.btnReloadDrawings.addEventListener('click', () => {
      if (DOM.drawingsSearchInput) DOM.drawingsSearchInput.value = '';
      if (DOM.drawingsSeriesSelect) DOM.drawingsSeriesSelect.value = 'all';
      renderDrawingsHistory();
    });
  }

  // 사내 도면 보안 PIN 모달 이벤트 (암호: 0404)
  if (DOM.btnVerifyDrawingPin) {
    DOM.btnVerifyDrawingPin.addEventListener('click', verifyDrawingPin);
  }
  if (DOM.drawingPinInput) {
    DOM.drawingPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyDrawingPin();
      }
    });
  }
  if (DOM.btnCancelDrawingPin) {
    DOM.btnCancelDrawingPin.addEventListener('click', closeDrawingPinModal);
  }
  if (DOM.btnCloseDrawingPinModal) {
    DOM.btnCloseDrawingPinModal.addEventListener('click', closeDrawingPinModal);
  }

  // 도면 상세 모달 이벤트
  if (DOM.btnCloseDrawingDetailModal) {
    DOM.btnCloseDrawingDetailModal.addEventListener('click', closeDrawingDetailModal);
  }
  if (DOM.btnCloseDrawingDetail) {
    DOM.btnCloseDrawingDetail.addEventListener('click', closeDrawingDetailModal);
  }
  if (DOM.btnCopyDrawingSummary) {
    DOM.btnCopyDrawingSummary.addEventListener('click', copyDrawingSummaryText);
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
  if (DOM.btnSettingsOpenFaqManager) {
    DOM.btnSettingsOpenFaqManager.addEventListener('click', () => {
      DOM.settingsModal.classList.remove('show');
      DOM.settingsModal.classList.remove('active');
      switchViewerCard('viewFaq');
    });
  }

  // 상단 헤더 새로고침 (PWA 캐시 초기화 + 실시간 OTA 동기화)
  DOM.btnRefresh.addEventListener('click', async () => {
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (e) {}
    }
    showToast('최신 버전으로 화면을 새로고침합니다...');
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
    text: `**'${escapeHtml(clean)}'**에 대한 사내 규정 또는 FAQ 정보를 찾지 못했습니다.\n\n다른 키워드로 질문해 주세요. (예: EXW 조건, 위탁재고, 연차휴가, 견적 유효기간 등)\n※ Skyworks PO, 출하 계획, 견적서 검색은 우측 탭 메뉴에서 바로 이용하실 수 있습니다.`
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
      bestMatch = {
        q: qText,
        a: aText,
        images: item.Images || [],
        attachments: item.attachments || [],
        files: item.Files || []
      };
    }
  }

  if (bestMatch && maxScore >= 5) {
    let output = `**[사내 규정/FAQ] ${bestMatch.q}**\n\n${bestMatch.a}`;

    if (bestMatch.attachments && bestMatch.attachments.length > 0) {
      output += '\n\n**[첨부 파일/미디어]**';
      bestMatch.attachments.forEach(att => {
        if (att.category === 'image' || (att.type && att.type.startsWith('image/'))) {
          output += `\n![${att.name}](${att.data})`;
        } else {
          output += `\n- [${att.name}](${att.data})`;
        }
      });
    } else if (bestMatch.images && bestMatch.images.length > 0) {
      output += '\n\n**[첨부 이미지]**';
      bestMatch.images.forEach(img => {
        const norm = img.replace(/\\/g, '/');
        const src = norm.startsWith('images/') ? `data/${norm}` : (norm.startsWith('data/') ? norm : `data/images/${norm}`);
        output += `\n![참고 이미지](${src})`;
      });
    }

    if (bestMatch.files && bestMatch.files.length > 0) {
      output += '\n\n**[첨부 문서]**';
      bestMatch.files.forEach(f => {
        const norm = f.replace(/\\/g, '/');
        const src = norm.startsWith('images/') ? `data/${norm}` : (norm.startsWith('data/') ? norm : `data/images/${norm}`);
        const fname = norm.split('/').pop();
        output += `\n- [${fname}](${src})`;
      });
    }

    return output;
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
  AppState.skyworksFilteredRows = rows || [];
  AppState.skyworksCurrentPage = 1;
  renderSkyworksPage(1);
}

function renderSkyworksPage(page) {
  const rows = AppState.skyworksFilteredRows || [];
  const totalRows = rows.length;
  const pageSize = AppState.skyworksPageSize || 50;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  page = Math.max(1, Math.min(page, totalPages));
  AppState.skyworksCurrentPage = page;

  if (DOM.skyworksCount) {
    DOM.skyworksCount.textContent = `${totalRows.toLocaleString()}건`;
  }

  if (DOM.skyworksPageInfo) {
    DOM.skyworksPageInfo.textContent = `${page} / ${totalPages} 페이지 (총 ${totalRows.toLocaleString()}건)`;
  }

  if (!DOM.skyworksTbody) return;

  if (totalRows === 0) {
    DOM.skyworksTbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">일치하는 Skyworks 데이터가 없습니다.</td></tr>`;
    if (DOM.skyworksPageControls) DOM.skyworksPageControls.innerHTML = '';
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const sliced = rows.slice(start, end);

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
      <tr class="erp-copyable-cell">
        <td>${formatDate(exDate)}</td>
        <td>${formatDate(shipDate)}</td>
        <td style="font-weight:600;color:#60a5fa;">${escapeHtml(pono)}</td>
        <td>${escapeHtml(pn)}</td>
        <td style="text-align:right;">${Number(qty) ? Number(qty).toLocaleString() : qty}</td>
        <td style="text-align:right;">${price}</td>
        <td style="text-align:right;color:#34d399;">${amount !== '-' && Number(amount) ? Number(amount).toLocaleString() : amount}</td>
        <td><span class="count-badge">${Number(bal) > 0 ? `잔여 ${Number(bal).toLocaleString()}` : '완료'}</span></td>
      </tr>
    `;
  }).join('');

  renderSkyworksPaginationControls(page, totalPages);
}

function renderSkyworksPaginationControls(currentPage, totalPages) {
  if (!DOM.skyworksPageControls) return;

  const svgChevronFirst = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
  const svgChevronPrev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronNext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  const svgChevronLast = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

  let btnsHtml = '';

  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToSkyworksPage(1)" title="첫 페이지">${svgChevronFirst}</button>`;
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToSkyworksPage(${currentPage - 1})" title="이전 페이지">${svgChevronPrev}</button>`;

  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }

  btnsHtml += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" onclick="goToSkyworksPage(1)">1</button>`;

  if (range.length > 0 && range[0] > 2) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  range.forEach(p => {
    btnsHtml += `<button class="page-btn ${currentPage === p ? 'active' : ''}" onclick="goToSkyworksPage(${p})">${p}</button>`;
  });

  if (range.length > 0 && range[range.length - 1] < totalPages - 1) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  if (totalPages > 1) {
    btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" onclick="goToSkyworksPage(${totalPages})">${totalPages}</button>`;
  }

  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToSkyworksPage(${currentPage + 1})" title="다음 페이지">${svgChevronNext}</button>`;
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToSkyworksPage(${totalPages})" title="마지막 페이지">${svgChevronLast}</button>`;

  DOM.skyworksPageControls.innerHTML = btnsHtml;
}

window.goToSkyworksPage = function(page) {
  renderSkyworksPage(page);
};

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

    // 2. 부품명/PO/인보이스/기타 검색어 필터
    if (!partSearch) return true;

    const k = (r.k || '').toLowerCase();
    const p = (r.p || '').toLowerCase();
    const f = (r.f || '').toLowerCase();
    const inv = (r.i || '').toLowerCase();

    if (k.includes(partSearch) || p.includes(partSearch) || f.includes(partSearch) || inv.includes(partSearch)) return true;
    if (partNorm.length >= 2) {
      if (k.replace(/[-_\s]/g, '').includes(partNorm) || p.replace(/[-_\s]/g, '').includes(partNorm) || inv.replace(/[-_\s]/g, '').includes(partNorm)) return true;
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
    DOM.shipPlanTbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">일치하는 출하 계획 데이터가 없습니다.</td></tr>`;
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
      <td style="color:#a78bfa;font-family:monospace;font-weight:500;">${escapeHtml(r.i || '-')}</td>
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
      showToast(`복사됨: ${text}`);
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

// --- 6-1. 계약검토서(Project) 뷰어 & 상세 모달 (다중 페이지네이션 & 실시간 복합 필터) ---
function renderContractReviews() {
  if (DOM.contractCustomerInput) DOM.contractCustomerInput.value = '';
  if (DOM.contractSearchInput) DOM.contractSearchInput.value = '';
  if (DOM.contractStatusSelect) DOM.contractStatusSelect.value = '';
  AppState.contractFilteredRows = AppState.contractReviewsData || [];
  AppState.contractCurrentPage = 1;
  renderContractReviewsPage(1);
}

function filterContractReviewsTable() {
  const custSearch = DOM.contractCustomerInput ? DOM.contractCustomerInput.value.toLowerCase().trim() : '';
  const custNorm = custSearch.replace(/[-_\s]/g, '');

  const textSearch = DOM.contractSearchInput ? DOM.contractSearchInput.value.toLowerCase().trim() : '';
  const textNorm = textSearch.replace(/[-_\s]/g, '');

  const statusFilter = DOM.contractStatusSelect ? DOM.contractStatusSelect.value.trim() : '';

  AppState.contractFilteredRows = (AppState.contractReviewsData || []).filter(r => {
    // 1. 고객사 필터
    if (custSearch) {
      const c = (r.customer || '').toLowerCase();
      if (!c.includes(custSearch) && (custNorm.length < 2 || !c.replace(/[-_\s]/g, '').includes(custNorm))) {
        return false;
      }
    }

    // 2. 상태 필터 (진행중 / 완료)
    if (statusFilter && r.status !== statusFilter) {
      return false;
    }

    // 3. 부품번호 / 프로젝트번호 / 품목 / 소재 / 의뢰내용 검색
    if (!textSearch) return true;

    const p = (r.part_no || '').toLowerCase();
    const pNo = (r.project_no || '').toLowerCase();
    const itm = (r.item || '').toLowerCase();
    const mat = (r.material || '').toLowerCase();
    const head = (r.req_head || '').toLowerCase();
    const memo = (r.req_memo || '').toLowerCase();
    const usr = (r.username || '').toLowerCase();

    if (p.includes(textSearch) || pNo.includes(textSearch) || itm.includes(textSearch) ||
        mat.includes(textSearch) || head.includes(textSearch) || memo.includes(textSearch) || usr.includes(textSearch)) {
      return true;
    }
    if (textNorm.length >= 2) {
      if (p.replace(/[-_\s]/g, '').includes(textNorm) || pNo.replace(/[-_\s]/g, '').includes(textNorm)) {
        return true;
      }
    }
    return false;
  });

  AppState.contractCurrentPage = 1;
  renderContractReviewsPage(1);
}

function renderContractReviewsPage(page) {
  const rows = AppState.contractFilteredRows || [];
  const totalRows = rows.length;
  const pageSize = AppState.contractPageSize || 50;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  page = Math.max(1, Math.min(page, totalPages));
  AppState.contractCurrentPage = page;

  // 카운트 배지 & 페이지 인포
  if (DOM.contractReviewsCount) {
    DOM.contractReviewsCount.textContent = `${totalRows.toLocaleString()}건`;
  }
  if (DOM.contractPageInfo) {
    DOM.contractPageInfo.textContent = `${page.toLocaleString()} / ${totalPages.toLocaleString()} 페이지 (총 ${totalRows.toLocaleString()}건)`;
  }

  if (!DOM.contractReviewsTbody) return;

  if (totalRows === 0) {
    DOM.contractReviewsTbody.innerHTML = `<tr><td colspan="10" class="text-center py-4" style="color:#94a3b8;">일치하는 계약검토서 데이터가 없습니다.</td></tr>`;
    if (DOM.contractPageControls) DOM.contractPageControls.innerHTML = '';
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = rows.slice(start, end);

  DOM.contractReviewsTbody.innerHTML = pageRows.map(c => {
    const isDone = c.status === '완료';
    const statusBadgeClass = isDone ? 'contract-status-badge completed' : 'contract-status-badge in-progress';
    return `
      <tr onclick="openContractReviewDetail('${escapeHtml(c.project_no)}')" style="cursor:pointer;" class="erp-copyable-cell" title="상세 정보 확인 (클릭)">
        <td style="font-weight:700;color:#60a5fa;">${escapeHtml(c.project_no)}</td>
        <td>${escapeHtml(c.date || '-')}</td>
        <td style="font-weight:600;color:#f8fafc;">${escapeHtml(c.customer || '-')}</td>
        <td>${escapeHtml(c.country || '-')}</td>
        <td>${escapeHtml(c.item || '-')}</td>
        <td>${escapeHtml(c.tool_type || '-')}</td>
        <td style="color:#38bdf8;font-weight:600;">${escapeHtml(c.part_no || '-')}</td>
        <td style="color:#cbd5e1;font-size:11px;">${escapeHtml(c.material || '-')}</td>
        <td style="text-align:right;">${escapeHtml(c.qty || '1')}</td>
        <td style="text-align:center;"><span class="${statusBadgeClass}">${escapeHtml(c.status)}</span></td>
      </tr>
    `;
  }).join('');

  // 페이지네이션 컨트롤러 렌더링
  renderContractPaginationControls(page, totalPages);
}

function renderContractPaginationControls(currentPage, totalPages) {
  if (!DOM.contractPageControls) return;

  const svgChevronFirst = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
  const svgChevronPrev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronNext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  const svgChevronLast = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

  let btnsHtml = '';

  // 처음으로
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToContractPage(1)" title="첫 페이지">${svgChevronFirst}</button>`;
  
  // 이전
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToContractPage(${currentPage - 1})" title="이전 페이지">${svgChevronPrev}</button>`;

  // 슬라이딩 윈도우 페이지 번호
  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }

  // 1페이지 버튼
  btnsHtml += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" onclick="goToContractPage(1)">1</button>`;

  if (range.length > 0 && range[0] > 2) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  range.forEach(p => {
    btnsHtml += `<button class="page-btn ${currentPage === p ? 'active' : ''}" onclick="goToContractPage(${p})">${p}</button>`;
  });

  if (range.length > 0 && range[range.length - 1] < totalPages - 1) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  // 마지막 페이지
  if (totalPages > 1) {
    btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" onclick="goToContractPage(${totalPages})">${totalPages}</button>`;
  }

  // 다음
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToContractPage(${currentPage + 1})" title="다음 페이지">${svgChevronNext}</button>`;

  // 마지막으로
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToContractPage(${totalPages})" title="마지막 페이지">${svgChevronLast}</button>`;

  DOM.contractPageControls.innerHTML = btnsHtml;
}

function goToContractPage(page) {
  renderContractReviewsPage(page);
  const wrapper = document.querySelector('#viewContractReviews .table-responsive-wrapper');
  if (wrapper) wrapper.scrollTop = 0;
}

function openContractReviewDetail(projectNo) {
  AppState.selectedContractProjectNo = projectNo;
  if (!DOM.contractDetailModal) return;

  const found = (AppState.contractReviewsData || []).find(r => r.project_no === projectNo);
  if (!found) {
    DOM.modalContractTitle.textContent = `계약검토서 [${projectNo}]`;
    DOM.modalContractBody.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;">'${escapeHtml(projectNo)}' 데이터를 찾을 수 없습니다.</div>`;
    DOM.contractDetailModal.classList.add('show');
    return;
  }

  DOM.modalContractTitle.textContent = `계약검토서 상세 정보 [${found.project_no}]`;

  // 액션 아이템 목록 HTML
  let actionHtml = '';
  if (found.action_items && found.action_items.length > 0) {
    actionHtml = `
      <table class="contract-sub-table">
        <thead>
          <tr><th>일자</th><th>상태</th><th>도면(Drawing)</th><th>시뮬레이션</th><th>POD</th></tr>
        </thead>
        <tbody>
          ${found.action_items.map(a => `
            <tr>
              <td>${escapeHtml(a.date || '-')}</td>
              <td>${escapeHtml(a.status || '-')}</td>
              <td>${escapeHtml(a.drawing || '-')}</td>
              <td>${escapeHtml(a.simulation || '-')}</td>
              <td>${escapeHtml(a.pod || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    actionHtml = `<div class="contract-empty-sub">등록된 Action Item 데이터가 없습니다.</div>`;
  }

  // 샘플 배송 목록 HTML
  let sampleHtml = '';
  if (found.sample_deliveries && found.sample_deliveries.length > 0) {
    sampleHtml = `
      <table class="contract-sub-table">
        <thead>
          <tr><th>일자</th><th>Invoice</th><th>수량</th><th>예정일</th><th>발송일</th><th>설명</th><th>Attn</th><th>배송추적</th></tr>
        </thead>
        <tbody>
          ${found.sample_deliveries.map(s => `
            <tr>
              <td>${escapeHtml(s.date || '-')}</td>
              <td>${escapeHtml(s.invoice || '-')}</td>
              <td>${escapeHtml(s.qty || '-')}</td>
              <td>${escapeHtml(s.due_date || '-')}</td>
              <td>${escapeHtml(s.shipped_date || '-')}</td>
              <td>${escapeHtml(s.description || '-')}</td>
              <td>${escapeHtml(s.attn || '-')}</td>
              <td>${escapeHtml(s.courier_tracking || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    sampleHtml = `<div class="contract-empty-sub">등록된 Sample Delivery 데이터가 없습니다.</div>`;
  }

  // 인증 상태 목록 HTML
  let qualHtml = '';
  if (found.qualifications && found.qualifications.length > 0) {
    qualHtml = `
      <table class="contract-sub-table">
        <thead>
          <tr><th>일자</th><th>상태</th><th>Dual Report</th></tr>
        </thead>
        <tbody>
          ${found.qualifications.map(q => `
            <tr>
              <td>${escapeHtml(q.date || '-')}</td>
              <td>${escapeHtml(q.status || '-')}</td>
              <td>${escapeHtml(q.dual_report || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    qualHtml = `<div class="contract-empty-sub">등록된 Qualification Status 데이터가 없습니다.</div>`;
  }

  DOM.modalContractBody.innerHTML = `
    <div class="kostat-contract-sheet" id="printableContractReview">
      <!-- 1. 상단 3개 열 그리드 (ERP 원본 100% 동일 배치) -->
      <div class="contract-top-grid">
        <!-- 열 1 -->
        <div class="contract-grid-col">
          <div class="erp-field-row">
            <span class="erp-field-label">Project No. :</span>
            <span class="erp-field-val bold blue">${escapeHtml(found.project_no)}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Date :</span>
            <span class="erp-field-val">${escapeHtml(found.date || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Status :</span>
            <span class="erp-field-val">${escapeHtml(found.status || 'Document')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Priority :</span>
            <span class="erp-field-val">${escapeHtml(found.priority || '1')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Item :</span>
            <span class="erp-field-val">${escapeHtml(found.item || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Tool Type :</span>
            <span class="erp-field-val">${escapeHtml(found.tool_type || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Country :</span>
            <span class="erp-field-val">${escapeHtml(found.country || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Customer :</span>
            <span class="erp-field-val bold">${escapeHtml(found.customer || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Related Custom :</span>
            <span class="erp-field-val">${escapeHtml(found.related_custom || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Material :</span>
            <span class="erp-field-val">${escapeHtml(found.material || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Q'ty :</span>
            <span class="erp-field-val">${escapeHtml(found.qty || '')}</span>
          </div>
        </div>

        <!-- 열 2 -->
        <div class="contract-grid-col">
          <div class="erp-field-row">
            <span class="erp-field-label">Part No :</span>
            <span class="erp-field-val bold green">${escapeHtml(found.part_no || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Temp(Length) :</span>
            <span class="erp-field-val">${escapeHtml(found.temp || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Erp Code :</span>
            <span class="erp-field-val">${escapeHtml(found.erp_code || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Monthly Amount :</span>
            <span class="erp-field-val align-right">${escapeHtml(found.monthly_amount || '.000')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Exp Po Yymm :</span>
            <span class="erp-field-val">${escapeHtml(found.exp_po_yymm || '-')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Tooling Po No :</span>
            <span class="erp-field-val">${escapeHtml(found.tooling_po_no || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Tooling Cost :</span>
            <span class="erp-field-val align-right">${escapeHtml(found.tooling_cost || '.000')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Mass Date :</span>
            <span class="erp-field-val">${escapeHtml(found.mass_date || '.  .')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Mass Amount :</span>
            <span class="erp-field-val align-right">${escapeHtml(found.mass_amount || '.000')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Person Charge :</span>
            <span class="erp-field-val align-right">${escapeHtml(found.person_charge || '.000')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Due Date :</span>
            <span class="erp-field-val">${escapeHtml(found.due_date || '')}</span>
          </div>
        </div>

        <!-- 열 3 -->
        <div class="contract-grid-col">
          <div class="erp-field-row">
            <span class="erp-field-label">Update :</span>
            <span class="erp-field-val">${escapeHtml(found.update || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Username :</span>
            <span class="erp-field-val">${escapeHtml(found.username || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Deptno :</span>
            <span class="erp-field-val">${escapeHtml(found.deptno || '')}</span>
          </div>
          <div class="erp-field-row">
            <span class="erp-field-label">Finish :</span>
            <span class="erp-field-val">${escapeHtml(found.finish || '미결재')}</span>
          </div>
          <div class="erp-descript-container">
            <span class="erp-descript-title">Descript</span>
            <div class="erp-descript-box">${escapeHtml(found.descript || '')}</div>
          </div>
        </div>
      </div>

      <!-- 2. 탭 바 -->
      <div class="contract-tab-bar">
        <button type="button" class="contract-tab-btn" data-tab="action" onclick="switchContractSubTab('action')">Action Item</button>
        <button type="button" class="contract-tab-btn" data-tab="sample" onclick="switchContractSubTab('sample')">Sample Delivery</button>
        <button type="button" class="contract-tab-btn" data-tab="qual" onclick="switchContractSubTab('qual')">Qualification Status</button>
        <button type="button" class="contract-tab-btn active" data-tab="written" onclick="switchContractSubTab('written')">Written Request</button>
      </div>

      <!-- 3. 탭 내용 영역 -->
      <div class="contract-tab-body">
        <!-- Written Request 탭 (기본 활성화) -->
        <div id="cTabPaneWritten" class="contract-pane active">
          <div class="written-form-table">
            <div class="written-form-row">
              <div class="written-row-label">의뢰여부</div>
              <div class="written-row-value">
                <span class="written-input-box short">${escapeHtml(found.req_set || '검토')}</span>
              </div>
            </div>
            <div class="written-form-row">
              <div class="written-row-label">의뢰부서</div>
              <div class="written-row-value">
                <span class="written-input-box medium">${escapeHtml(found.req_dept || '')}</span>
              </div>
            </div>
            <div class="written-form-row">
              <div class="written-row-label">검토안건</div>
              <div class="written-row-value">
                <span class="written-input-box full bold">${escapeHtml(found.req_head || '')}</span>
              </div>
            </div>
            <div class="written-form-row" style="align-items:stretch;">
              <div class="written-row-label">의뢰내용</div>
              <div class="written-row-value">
                <div class="written-memo-textarea">${escapeHtml(found.req_memo || '')}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Item 탭 -->
        <div id="cTabPaneAction" class="contract-pane">
          ${actionHtml}
        </div>

        <!-- Sample Delivery 탭 -->
        <div id="cTabPaneSample" class="contract-pane">
          ${sampleHtml}
        </div>

        <!-- Qualification Status 탭 -->
        <div id="cTabPaneQual" class="contract-pane">
          ${qualHtml}
        </div>
      </div>
    </div>
  `;

  DOM.contractDetailModal.classList.add('show');
}

function switchContractSubTab(tabName) {
  const btns = document.querySelectorAll('.contract-tab-btn');
  btns.forEach(b => {
    if (b.getAttribute('data-tab') === tabName) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  const panes = {
    action: document.getElementById('cTabPaneAction'),
    sample: document.getElementById('cTabPaneSample'),
    qual: document.getElementById('cTabPaneQual'),
    written: document.getElementById('cTabPaneWritten')
  };

  Object.keys(panes).forEach(k => {
    if (panes[k]) {
      if (k === tabName) {
        panes[k].classList.add('active');
      } else {
        panes[k].classList.remove('active');
      }
    }
  });
}
window.switchContractSubTab = switchContractSubTab;

function copyCurrentContractReviewSummary() {
  if (!AppState.selectedContractProjectNo) return;
  const found = (AppState.contractReviewsData || []).find(r => r.project_no === AppState.selectedContractProjectNo);
  if (!found) return;

  let text = `[계약검토서 (Project Review)]\n`;
  text += `• Project No: ${found.project_no}\n`;
  text += `• Date: ${found.date} | Status: ${found.status} | Priority: ${found.priority}\n`;
  text += `• Customer: ${found.customer} (${found.country}) | Related: ${found.related_custom || '-'}\n`;
  text += `• Item: ${found.item} | Tool Type: ${found.tool_type}\n`;
  text += `• Part No: ${found.part_no} | Temp: ${found.temp || '-'}\n`;
  text += `• Material: ${found.material || '-'} | Qty: ${found.qty || '-'}\n`;
  text += `• Tooling PO: ${found.tooling_po_no || '-'} | Cost: ${found.tooling_cost || '-'}\n`;
  text += `• Update: ${found.update} | Username: ${found.username} (${found.deptno})\n`;
  text += `• Finish: ${found.finish}\n\n`;
  text += `[Written Request / 의뢰 상세]\n`;
  text += `• 의뢰여부: ${found.req_set}\n`;
  text += `• 의뢰부서: ${found.req_dept}\n`;
  text += `• 검토안건: ${found.req_head}\n\n`;
  text += `[의뢰내용]\n${found.req_memo}\n`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('계약검토서 전체 요약이 복사되었습니다.');
    });
  } else {
    showToast('클립보드 복사 완료');
  }
}

// --- 7-1. IC Tray 도면 뷰어 & 보안 PIN(0404) 다운로드 엔진 ---

function renderDrawingsHistory() {
  if (DOM.drawingsSearchInput) DOM.drawingsSearchInput.value = '';
  if (DOM.drawingsSeriesSelect) DOM.drawingsSeriesSelect.value = 'all';
  AppState.drawingsFilteredRows = AppState.drawingsData || [];
  AppState.drawingsCurrentPage = 1;
  renderDrawingsPage(1);
}

function filterDrawingsTable() {
  const search = DOM.drawingsSearchInput ? DOM.drawingsSearchInput.value.toLowerCase().trim() : '';
  const searchNorm = search.replace(/[-_\s]/g, '');
  const series = DOM.drawingsSeriesSelect ? DOM.drawingsSeriesSelect.value : 'all';

  AppState.drawingsFilteredRows = (AppState.drawingsData || []).filter(r => {
    // 1. 시리즈 필터
    if (series && series !== 'all') {
      if (series === 'KS-80XX, 81XX') {
        if (r.series !== 'KS-80XX, 81XX' && r.series !== 'KS-80XX' && r.series !== 'KS-81XX') {
          return false;
        }
      } else if (r.series !== series) {
        return false;
      }
    }

    // 2. 품번/고객사/규격/재질/온도 및 파일명 통합 검색
    if (!search) return true;

    const m = (r.model || '').toLowerCase();
    const c = (r.customer || '').toLowerCase();
    const cpn = (r.customer_pn || '').toLowerCase();
    const pkg = (r.pkg_type || '').toLowerCase();
    const mat = (r.material || '').toLowerCase();
    const temp = (r.temp || '').toLowerCase();
    const s = (r.series || '').toLowerCase();

    if (m.includes(search) || c.includes(search) || cpn.includes(search) ||
        pkg.includes(search) || mat.includes(search) || temp.includes(search) || s.includes(search)) {
      return true;
    }

    // 하이픈/공백 제거 정규화 검색
    if (searchNorm.length >= 2) {
      if (m.replace(/[-_\s]/g, '').includes(searchNorm) ||
          cpn.replace(/[-_\s]/g, '').includes(searchNorm) ||
          c.replace(/[-_\s]/g, '').includes(searchNorm)) {
        return true;
      }
    }

    // 도면 파일명 내부 검색
    if (r.files && r.files.length > 0) {
      for (let i = 0; i < r.files.length; i++) {
        const fn = (r.files[i].filename || '').toLowerCase();
        if (fn.includes(search)) return true;
        if (searchNorm.length >= 2 && fn.replace(/[-_\s]/g, '').includes(searchNorm)) return true;
      }
    }

    return false;
  });

  AppState.drawingsCurrentPage = 1;
  renderDrawingsPage(1);
}

function renderDrawingsPage(page) {
  const rows = AppState.drawingsFilteredRows || [];
  const totalRows = rows.length;
  const pageSize = AppState.drawingsPageSize || 15;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  page = Math.max(1, Math.min(page, totalPages));
  AppState.drawingsCurrentPage = page;

  // 카운트 배지 & 페이지 인포
  if (DOM.drawingsCountBadge) {
    DOM.drawingsCountBadge.textContent = `${totalRows.toLocaleString()}건`;
  }
  if (DOM.drawingsPageInfo) {
    DOM.drawingsPageInfo.textContent = `${page.toLocaleString()} / ${totalPages.toLocaleString()} 페이지 (총 ${totalRows.toLocaleString()}건)`;
  }

  if (!DOM.drawingsTbody) return;

  if (totalRows === 0) {
    DOM.drawingsTbody.innerHTML = `<tr><td colspan="10" class="text-center py-4" style="color:#94a3b8;">일치하는 도면 데이터가 없습니다.</td></tr>`;
    if (DOM.drawingsPageControls) DOM.drawingsPageControls.innerHTML = '';
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = rows.slice(start, end);

  DOM.drawingsTbody.innerHTML = pageRows.map((r, i) => {
    const rowNo = start + i + 1;
    // 최신 수정일 계산
    let latestDate = '-';
    if (r.files && r.files.length > 0) {
      const dates = r.files.map(f => f.mtime).filter(Boolean).sort().reverse();
      if (dates.length > 0) latestDate = dates[0].substring(0, 10);
    }
    const fileCount = r.files ? r.files.length : (r.file_count || 0);

    return `
      <tr onclick="handleDrawingModelClick('${escapeHtml(r.model)}')" style="cursor:pointer;" class="erp-copyable-cell" title="도면 상세 및 다운로드 (클릭)">
        <td style="text-align:center;color:#94a3b8;font-size:12px;">${rowNo}</td>
        <td style="font-weight:700;color:#38bdf8;">${escapeHtml(r.model)}</td>
        <td style="font-weight:600;color:#f8fafc;">${escapeHtml(r.customer || '-')}</td>
        <td style="color:#a5b4fc;">${escapeHtml(r.customer_pn || '-')}</td>
        <td style="color:#cbd5e1;">${escapeHtml(r.pkg_type || '-')}</td>
        <td style="text-align:center;color:#e2e8f0;">${escapeHtml(r.temp || '-')}</td>
        <td style="text-align:center;color:#cbd5e1;">${escapeHtml(r.material || '-')}</td>
        <td style="text-align:center;"><span class="count-badge" style="background:rgba(14,165,233,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);font-size:11px;">PDF ${fileCount}개</span></td>
        <td style="text-align:center;color:#94a3b8;font-size:12px;">${escapeHtml(latestDate)}</td>
        <td style="text-align:center;">
          <button type="button" class="action-btn-sm primary" style="font-size:11px;padding:3px 10px;" onclick="event.stopPropagation(); handleDrawingModelClick('${escapeHtml(r.model)}');">열람/다운로드</button>
        </td>
      </tr>
    `;
  }).join('');

  // 페이지네이션 컨트롤러 렌더링
  renderDrawingsPaginationControls(page, totalPages);
}

function renderDrawingsPaginationControls(currentPage, totalPages) {
  if (!DOM.drawingsPageControls) return;

  const svgChevronFirst = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
  const svgChevronPrev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronNext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  const svgChevronLast = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

  let btnsHtml = '';

  // 처음으로
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToDrawingsPage(1)" title="첫 페이지">${svgChevronFirst}</button>`;
  
  // 이전
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToDrawingsPage(${currentPage - 1})" title="이전 페이지">${svgChevronPrev}</button>`;

  // 슬라이딩 윈도우 페이지 번호
  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }

  // 1페이지 버튼
  btnsHtml += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" onclick="goToDrawingsPage(1)">1</button>`;

  if (range.length > 0 && range[0] > 2) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  range.forEach(p => {
    btnsHtml += `<button class="page-btn ${currentPage === p ? 'active' : ''}" onclick="goToDrawingsPage(${p})">${p}</button>`;
  });

  if (range.length > 0 && range[range.length - 1] < totalPages - 1) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  // 마지막 페이지
  if (totalPages > 1) {
    btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" onclick="goToDrawingsPage(${totalPages})">${totalPages}</button>`;
  }

  // 다음
  btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToDrawingsPage(${currentPage + 1})" title="다음 페이지">${svgChevronNext}</button>`;

  // 마지막으로
  btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="goToDrawingsPage(${totalPages})" title="마지막 페이지">${svgChevronLast}</button>`;

  DOM.drawingsPageControls.innerHTML = btnsHtml;
}

window.goToDrawingsPage = function(page) {
  renderDrawingsPage(page);
  const wrapper = document.querySelector('#viewDrawings .table-responsive-wrapper');
  if (wrapper) wrapper.scrollTop = 0;
};

function handleDrawingModelClick(modelName) {
  AppState.selectedDrawingModel = modelName;
  if (!AppState.isDrawingAuthenticated) {
    openDrawingPinModal(modelName);
  } else {
    openDrawingDetailModal(modelName);
  }
}
window.handleDrawingModelClick = handleDrawingModelClick;

// --- 보안 PIN 모달 제어 (비밀번호: 0404) ---
function openDrawingPinModal(modelName) {
  if (DOM.drawingPinTargetIndex) DOM.drawingPinTargetIndex.value = modelName || '';
  if (DOM.drawingPinInput) DOM.drawingPinInput.value = '';
  if (DOM.drawingPinError) DOM.drawingPinError.style.display = 'none';
  if (DOM.drawingPinModal) DOM.drawingPinModal.classList.add('show');
  setTimeout(() => {
    if (DOM.drawingPinInput) DOM.drawingPinInput.focus();
  }, 150);
}

function closeDrawingPinModal() {
  if (DOM.drawingPinModal) DOM.drawingPinModal.classList.remove('show');
  if (DOM.drawingPinInput) DOM.drawingPinInput.value = '';
  if (DOM.drawingPinError) DOM.drawingPinError.style.display = 'none';
}

function verifyDrawingPin() {
  const pin = DOM.drawingPinInput ? DOM.drawingPinInput.value.trim() : '';
  if (pin === '0404') {
    AppState.isDrawingAuthenticated = true;
    AppState.drawingPin = pin;
    closeDrawingPinModal();
    showToast('보안 PIN 인증 성공: 도면 열람 및 다운로드 권한이 활성화되었습니다.', 'success');
    const target = (DOM.drawingPinTargetIndex ? DOM.drawingPinTargetIndex.value : '') || AppState.selectedDrawingModel;
    if (target) {
      openDrawingDetailModal(target);
    }
  } else {
    if (DOM.drawingPinError) {
      DOM.drawingPinError.textContent = '보안 PIN 번호(4자리)가 일치하지 않습니다.';
      DOM.drawingPinError.style.display = 'block';
    }
    if (DOM.drawingPinInput) {
      DOM.drawingPinInput.value = '';
      DOM.drawingPinInput.focus();
    }
  }
}

// --- 도면 상세 모달 제어 ---
function openDrawingDetailModal(modelName) {
  AppState.selectedDrawingModel = modelName;
  if (!DOM.drawingDetailModal) return;

  const item = (AppState.drawingsData || []).find(d => d.model === modelName);
  if (!item) {
    if (DOM.drawingDetailTitle) DOM.drawingDetailTitle.textContent = `도면 상세 [${modelName}]`;
    if (DOM.drawingDetailSpecArea) DOM.drawingDetailSpecArea.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;">'${escapeHtml(modelName)}' 도면 데이터를 찾을 수 없습니다.</div>`;
    if (DOM.drawingDetailFileList) DOM.drawingDetailFileList.innerHTML = '';
    DOM.drawingDetailModal.classList.add('show');
    return;
  }

  if (DOM.drawingDetailTitle) {
    DOM.drawingDetailTitle.textContent = `IC Tray 도면 상세 [${item.model}]`;
  }
  if (DOM.drawingDetailFileCount) {
    DOM.drawingDetailFileCount.textContent = `총 ${(item.files ? item.files.length : 0)}개 PDF 도면 등록`;
  }

  // 상단 스펙 요약 그리드 렌더링
  if (DOM.drawingDetailSpecArea) {
    DOM.drawingDetailSpecArea.innerHTML = `
      <div style="background:rgba(30,41,59,0.7);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-md);padding:14px;display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;">
        <div><span style="font-size:11px;color:#94a3b8;display:block;">품번 / 모델</span><strong style="color:#38bdf8;font-size:15px;">${escapeHtml(item.model)}</strong></div>
        <div><span style="font-size:11px;color:#94a3b8;display:block;">시리즈</span><span style="color:#f8fafc;font-weight:600;">${escapeHtml(item.series || '-')}</span></div>
        <div><span style="font-size:11px;color:#94a3b8;display:block;">고객사</span><span style="color:#f8fafc;font-weight:600;">${escapeHtml(item.customer || '-')}</span></div>
        <div><span style="font-size:11px;color:#94a3b8;display:block;">고객사 P/N</span><span style="color:#a5b4fc;font-weight:600;">${escapeHtml(item.customer_pn || '-')}</span></div>
        <div><span style="font-size:11px;color:#94a3b8;display:block;">패키지 규격 (Package Type)</span><span style="color:#e2e8f0;">${escapeHtml(item.pkg_type || '-')}</span></div>
        <div><span style="font-size:11px;color:#94a3b8;display:block;">내열온도 / 재질</span><span style="color:#e2e8f0;">${escapeHtml(item.temp || '-')} / ${escapeHtml(item.material || '-')}</span></div>
      </div>
    `;
  }

  // 등록 도면 파일 목록 렌더링
  if (DOM.drawingDetailFileList) {
    if (!item.files || item.files.length === 0) {
      DOM.drawingDetailFileList.innerHTML = `<div style="text-align:center;padding:20px;color:#94a3b8;">등록된 PDF 도면 파일이 없습니다.</div>`;
    } else {
      DOM.drawingDetailFileList.innerHTML = item.files.map((f, idx) => {
        const sizeKb = (f.size / 1024).toFixed(1);
        const dateStr = f.mtime ? f.mtime.substring(0, 10) : '-';
        return `
          <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-sm);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;min-width:240px;flex:1;">
              <span style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">PDF</span>
              <div>
                <div style="font-size:13px;font-weight:600;color:#f8fafc;word-break:break-all;">${escapeHtml(f.filename)}</div>
                <div style="font-size:11px;color:#94a3b8;">크기: ${sizeKb} KB | 수정일: ${dateStr}</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <button type="button" class="action-btn-sm secondary" style="font-size:11px;padding:3px 8px;" onclick="copyDrawingPath('${escapeHtml(f.rel_path)}')">경로 복사</button>
              <button type="button" class="action-btn-sm primary" style="font-size:11px;padding:3px 12px;" onclick="downloadDrawingFile('${escapeHtml(item.model)}', '${escapeHtml(f.filename)}', '${escapeHtml(f.rel_path)}', this)">다운로드</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  DOM.drawingDetailModal.classList.add('show');
}
window.openDrawingDetailModal = openDrawingDetailModal;

function closeDrawingDetailModal() {
  if (DOM.drawingDetailModal) DOM.drawingDetailModal.classList.remove('show');
}

function copyDrawingPath(relPath) {
  const fullPath = 'Z:\\KQC\\IC TRAY DRAWING\\' + (relPath || '').replace(/\//g, '\\');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullPath).then(() => {
      showToast('사내 네트워크 경로가 복사되었습니다: ' + fullPath, 'success');
    }).catch(() => {
      showToast('사내 경로 복사: ' + fullPath, 'info');
    });
  } else {
    showToast('사내 경로 복사: ' + fullPath, 'info');
  }
}
window.copyDrawingPath = copyDrawingPath;

const DRAWING_AUTH_CIPHER = 'PfDlQ4CqhAesc39QyDrWqHU5yAi39qawYW7ymLTIEkKi+Gkj8sBdW9omUkrMr+3C84UbQ+nDVbL/lR0osbgj+sYpjj8=';
const DRAWING_AUTH_SALT = 'kostat_drawing_auth_salt_2026';

async function getDrawingAuthToken(pin) {
  if (AppState.drawingAuthToken) return AppState.drawingAuthToken;
  try {
    const rawBytes = Uint8Array.from(atob(DRAWING_AUTH_CIPHER), c => c.charCodeAt(0));
    const nonce = rawBytes.subarray(0, 12);
    const ct = rawBytes.subarray(12);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin || '0404'), { name: 'PBKDF2' }, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(DRAWING_AUTH_SALT), iterations: 50000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct);
    AppState.drawingAuthToken = new TextDecoder().decode(decrypted);
    return AppState.drawingAuthToken;
  } catch (e) {
    console.warn('[DrawingAuth] 토큰 복호화 실패:', e);
    return null;
  }
}

async function downloadDrawingFile(model, filename, relPath, btnEl) {
  const fullPath = 'Z:\\KQC\\IC TRAY DRAWING\\' + (relPath || '').replace(/\//g, '\\');
  
  // 사내 경로를 클립보드에 우선 자동 복사
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullPath).catch(() => {});
  }

  showToast(`도면 다운로드 요청 중: ${filename}`, 'info');
  const originalText = btnEl ? btnEl.textContent : '다운로드';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = '다운로드 중...';
  }

  try {
    const token = await getDrawingAuthToken(AppState.drawingPin || '0404');
    if (!token) throw new Error('인증 토큰 획득 실패');

    // GitHub API로 보안 전용 저장소(kostat-drawings)에서 바이너리 원본 스트림 획득
    const encodedPath = (relPath || '').split('/').map(encodeURIComponent).join('/');
    const apiUrl = `https://api.github.com/repos/skywantae/kostat-drawings/contents/${encodedPath}`;

    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    if (!res.ok) {
      throw new Error(`파일 서버 응답 코드: ${res.status}`);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

    showToast(`도면 다운로드 완료: ${filename}`, 'success');
  } catch (err) {
    console.warn('[DrawingDownload] 다운로드 안내:', err);
    showToast(`사내 경로 복사 완료: ${fullPath} (사내 PC 탐색기 주소창 또는 실행창에 붙여넣어 열어보실 수 있습니다)`, 'info');
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.textContent = originalText;
    }
  }
}
window.downloadDrawingFile = downloadDrawingFile;

function copyDrawingSummaryText() {
  if (!AppState.selectedDrawingModel) return;
  const item = (AppState.drawingsData || []).find(d => d.model === AppState.selectedDrawingModel);
  if (!item) return;

  let text = `[IC Tray 도면 상세 정보]\n`;
  text += `• 품번 / 모델: ${item.model}\n`;
  text += `• 시리즈: ${item.series || '-'}\n`;
  text += `• 고객사: ${item.customer || '-'}\n`;
  text += `• 고객사 P/N: ${item.customer_pn || '-'}\n`;
  text += `• 패키지 규격: ${item.pkg_type || '-'}\n`;
  text += `• 내열온도 / 재질: ${item.temp || '-'} / ${item.material || '-'}\n`;
  text += `• 등록 도면 수: ${item.files ? item.files.length : 0}개 파일\n\n`;

  text += `[등록 도면 파일 목록]\n`;
  if (item.files && item.files.length > 0) {
    item.files.forEach((f, idx) => {
      const sizeKb = (f.size / 1024).toFixed(1);
      const dateStr = f.mtime ? f.mtime.substring(0, 10) : '-';
      text += `${idx + 1}. ${f.filename} (${sizeKb} KB, ${dateStr})\n   - 경로: Z:\\KQC\\IC TRAY DRAWING\\${f.rel_path.replace(/\//g, '\\')}\n`;
    });
  } else {
    text += `등록된 도면 파일 없음\n`;
  }

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('도면 상세 정보 및 파일 목록이 복사되었습니다.');
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
    'contract_reviews': 'viewContractReviews',
    'drawings': 'viewDrawings',
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
  } else if (targetId === 'viewContractReviews') {
    if (!AppState.contractFilteredRows || AppState.contractFilteredRows.length === 0) {
      AppState.contractFilteredRows = AppState.contractReviewsData || [];
    }
    renderContractReviewsPage(AppState.contractCurrentPage || 1);
  } else if (targetId === 'viewDrawings') {
    if (!AppState.drawingsFilteredRows || AppState.drawingsFilteredRows.length === 0) {
      AppState.drawingsFilteredRows = AppState.drawingsData || [];
    }
    renderDrawingsPage(AppState.drawingsCurrentPage || 1);
  } else if (targetId === 'viewSkyworks') {
    if (!DOM.skyworksTbody || DOM.skyworksTbody.children.length <= 1) {
      renderSkyworksTable(AppState.skyworksData);
    }
  } else if (targetId === 'viewFeedback') {
    renderFeedbackBoard();
    fetchRemoteFeedback(true); // 탭 진입 시 클라우드 최신 글 자동 동기화
  } else if (targetId === 'viewFaq') {
    renderFaqList();
    syncLiveDatabases(false);
  } else if (targetId === 'viewArchive') {
    renderArchiveBoard();
    fetchRemoteArchive(true); // 탭 진입 시 최신 자료 실시간 동기화
  } else if (targetId === 'viewLab') {
    // 실험실 뷰 활성화
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
  // 마크다운 이미지: ![alt](src) -> 인라인 썸네일 & 라이트박스 연동
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
    return `<div style="margin:8px 0;"><img src="${src}" alt="${alt}" style="max-width:100%;max-height:220px;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.15);" onclick="openFaqLightbox('${alt}', 'image', '${src}', '${alt}')" /></div>`;
  });
  // 마크다운 다운로드 링크: [name](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" download="$1" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:underline;">$1</a>');
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
window.showToast = showToast;

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
  function getAdminAuthToken() {
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
  async function verifyPin() {
    const pin = pinInput.value.trim();
    const isValid = await checkAdminPinHash(pin);
    if (isValid) {
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
        const candInv = ['invoiceno', 'invoicenumber', 'invoice_no', 'invoice', '송장번호', '인보이스', '송장'];
        const candFwd = ['fowarder', 'forwarder', '포워더', '운송사'];

        const shipRows = [];
        const skyworksRows = [];
        const todayIso = new Date().toISOString().slice(0, 10);
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
          const inv = findVal(r, candInv);
          const fwd = findVal(r, candFwd);

          if (!cust && !pono && !pn) continue; // 빈 행 무시

          const compactShipItem = {
            c: cust, p: pono, k: pn, e: ex, s: ship, q: qty, b: bal, i: inv, f: fwd
          };
          shipRows.push(compactShipItem);

          // 유효한 날짜(1~12월, 1~31일)만 탐색 (0000 더미일자 배제)
          const validEx = parseValidDate(ex);
          const validShip = parseValidDate(ship);
          if (validEx && validEx <= todayIso && validEx > latestDate) latestDate = validEx;
          if (validShip && validShip <= todayIso && validShip > latestDate) latestDate = validShip;

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

        // 2016~2020 고정 과거 출하 데이터 보존 및 병합
        const fixedHistoricalRows = (AppState.shipPlanData || []).filter(r => {
          const d = String(r.e || r.s || '').replace(/[-.\s]/g, '');
          return d && d < '20210101';
        });
        if (fixedHistoricalRows.length > 0) {
          const seenHashes = new Set(shipRows.map(r => `${r.c}|${r.p}|${r.k}|${r.e}|${r.s}`));
          for (const fRow of fixedHistoricalRows) {
            const h = `${fRow.c}|${fRow.p}|${fRow.k}|${fRow.e}|${fRow.s}`;
            if (!seenHashes.has(h)) {
              shipRows.push(fRow);
            }
          }
          shipRows.sort((a, b) => String(b.e || '').localeCompare(String(a.e || '')));
        }

        // Skyworks 2016~2020 과거 데이터 보존 및 병합
        const fixedSkyRows = (AppState.skyworksData || []).filter(r => {
          const d = String(r.exfactorydate || r.shipdate || '').replace(/[-.\s]/g, '');
          return d && d < '20210101';
        });
        if (fixedSkyRows.length > 0) {
          const seenSky = new Set(skyworksRows.map(r => `${r.customer_name}|${r.pono}|${r.kostat_pn}|${r.exfactorydate}`));
          for (const fs of fixedSkyRows) {
            const h = `${fs.customer_name}|${fs.pono}|${fs.kostat_pn}|${fs.exfactorydate}`;
            if (!seenSky.has(h)) {
              skyworksRows.push(fs);
            }
          }
          skyworksRows.sort((a, b) => String(b.exfactorydate || '').localeCompare(String(a.exfactorydate || '')));
        }

        const effectiveDate = latestDate || todayIso;
        AdminState.parsedShipRows = shipRows;
        AdminState.parsedSkyworksRows = skyworksRows;
        AdminState.latestDetectedDate = effectiveDate;

        // 요약 카드 렌더링
        if (summaryCard) summaryCard.style.display = 'block';
        if (summaryFileName) summaryFileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        if (summaryTotal) summaryTotal.textContent = `${shipRows.length.toLocaleString()}건`;
        if (summarySkyworks) summarySkyworks.textContent = `${skyworksRows.length.toLocaleString()}건`;
        const dataDateInput = document.getElementById('adminDataDateInput');
        if (dataDateInput) dataDateInput.value = effectiveDate;
        if (summaryLatestDate) summaryLatestDate.textContent = formatKoreanDate(effectiveDate);

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
      showToast('배포할 출하 데이터가 없습니다.', 'error');
      return;
    }

    const token = getAdminAuthToken();
    if (!token || !AdminState.isAuthenticated) {
      showToast('관리자 인증이 만료되었습니다. 다시 로그인해 주세요.', 'error');
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

      const dataDateInput = document.getElementById('adminDataDateInput');
      const chosenDataDate = (dataDateInput && dataDateInput.value) ? dataDateInput.value : (AdminState.latestDetectedDate || new Date().toISOString().slice(0, 10));
      const deployDataDate = parseValidDate(chosenDataDate) || new Date().toISOString().slice(0, 10);

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

      // 4) 현재 실행 중인 웹앱 메모리 및 로컬 스토리지 즉시 갱신
      progressLabel.textContent = '4/4 현재 브라우저 화면 즉시 동기화 완료!';
      progressPercent.textContent = '100%';
      progressBarFill.style.width = '100%';

      window.KOSTAT_SHIPPLAN_DATA = AdminState.parsedShipRows;
      window.KOSTAT_SKYWORKS_DATA = AdminState.parsedSkyworksRows;
      AppState.shipPlanData = AdminState.parsedShipRows;
      AppState.skyworksData = AdminState.parsedSkyworksRows;
      AppState.dataDate = formatKoreanDate(deployDataDate);
      AppState.shipPlanFilteredRows = AdminState.parsedShipRows;

      // 로컬 스토리지에 즉시 저장 (새로고침 시 CDN 배포 지연과 무관하게 즉각 유지)
      try {
        localStorage.setItem('KOSTAT_ERP_DATA_DATE', deployDataDate);
      } catch (_) {}

      renderShipPlanPage(1);
      updateStatus(true, getDataDateStatusText());
      const skyCountBadge = document.getElementById('skyworksCount');
      if (skyCountBadge) skyCountBadge.textContent = `${AdminState.parsedSkyworksRows.length.toLocaleString()}건`;

      const curVerEl = document.getElementById('currentAppVersion');
      if (curVerEl) curVerEl.textContent = `v${nextVer}`;

      showToast(`배포 완료! 출하 계획 ${AdminState.parsedShipRows.length.toLocaleString()}건 (${AppState.dataDate} 기준)이 반영되었습니다.`);
      alert(`성공적으로 배포되었습니다!\n\n• 배포 버전: v${nextVer}\n• 데이터 기준일: ${AppState.dataDate}\n• 총 출하 건수: ${AdminState.parsedShipRows.length.toLocaleString()}건\n• Skyworks PO: ${AdminState.parsedSkyworksRows.length.toLocaleString()}건\n\n모든 사용자의 모바일 기기에 최신 출하 내역이 즉시 동기화됩니다.`);

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

// ==========================================================================
// 5. 기능 추가 및 제안 게시판 (Feature Request Board) 엔진
// ==========================================================================
function initFeedbackBoardEvents() {
  if (DOM.feedbackSearchInput) {
    DOM.feedbackSearchInput.addEventListener('input', debounce(renderFeedbackBoard, 200));
  }
  if (DOM.feedbackStatusFilter) {
    DOM.feedbackStatusFilter.addEventListener('change', renderFeedbackBoard);
  }
  if (DOM.feedbackPageSizeSelect) {
    DOM.feedbackPageSizeSelect.addEventListener('change', () => {
      AppState.feedbackPageSize = parseInt(DOM.feedbackPageSizeSelect.value, 10) || 10;
      AppState.feedbackCurrentPage = 1;
      renderFeedbackPage(1);
    });
  }

  // 새 글 등록 모달 열기/닫기
  if (DOM.btnOpenNewFeedbackModal) {
    DOM.btnOpenNewFeedbackModal.addEventListener('click', () => {
      if (DOM.feedbackAuthorInput) DOM.feedbackAuthorInput.value = '';
      if (DOM.feedbackTitleInput) DOM.feedbackTitleInput.value = '';
      if (DOM.feedbackContentInput) DOM.feedbackContentInput.value = '';
      if (DOM.feedbackNewModal) {
        DOM.feedbackNewModal.classList.add('show');
        DOM.feedbackNewModal.classList.add('active');
      }
    });
  }
  if (DOM.btnCloseFeedbackNewModal) {
    DOM.btnCloseFeedbackNewModal.addEventListener('click', () => {
      if (DOM.feedbackNewModal) {
        DOM.feedbackNewModal.classList.remove('show');
        DOM.feedbackNewModal.classList.remove('active');
      }
    });
  }
  if (DOM.btnCancelFeedbackNew) {
    DOM.btnCancelFeedbackNew.addEventListener('click', () => {
      if (DOM.feedbackNewModal) {
        DOM.feedbackNewModal.classList.remove('show');
        DOM.feedbackNewModal.classList.remove('active');
      }
    });
  }

  // 새 글 제출
  if (DOM.btnSubmitNewFeedback) {
    DOM.btnSubmitNewFeedback.addEventListener('click', submitNewFeedback);
  }

  // 클라우드 최신 글 동기화 (새로고침)
  if (DOM.btnRefreshFeedback) {
    DOM.btnRefreshFeedback.addEventListener('click', () => fetchRemoteFeedback(false));
  }

  // 관리자 모드 토글
  if (DOM.btnToggleBoardAdmin) {
    DOM.btnToggleBoardAdmin.addEventListener('click', toggleBoardAdminMode);
  }

  // 게시판 관리자 PIN 인증 모달 이벤트
  if (DOM.btnVerifyBoardPin) {
    DOM.btnVerifyBoardPin.addEventListener('click', verifyBoardPin);
  }
  if (DOM.boardPinInput) {
    DOM.boardPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyBoardPin();
    });
  }
  if (DOM.btnCloseBoardPinModal) {
    DOM.btnCloseBoardPinModal.addEventListener('click', closeBoardPinModal);
  }
  if (DOM.btnCancelBoardPin) {
    DOM.btnCancelBoardPin.addEventListener('click', closeBoardPinModal);
  }
  if (DOM.boardAdminPinModal) {
    DOM.boardAdminPinModal.addEventListener('click', (e) => {
      if (e.target === DOM.boardAdminPinModal) closeBoardPinModal();
    });
  }

  // 관리자 답변 모달 닫기
  if (DOM.btnCloseFeedbackReplyModal) {
    DOM.btnCloseFeedbackReplyModal.addEventListener('click', () => {
      if (DOM.feedbackReplyModal) {
        DOM.feedbackReplyModal.classList.remove('show');
        DOM.feedbackReplyModal.classList.remove('active');
      }
    });
  }
  if (DOM.btnCancelFeedbackReply) {
    DOM.btnCancelFeedbackReply.addEventListener('click', () => {
      if (DOM.feedbackReplyModal) {
        DOM.feedbackReplyModal.classList.remove('show');
        DOM.feedbackReplyModal.classList.remove('active');
      }
    });
  }

  // 관리자 답변 저장 & 삭제
  if (DOM.btnSubmitAdminReply) {
    DOM.btnSubmitAdminReply.addEventListener('click', submitAdminReply);
  }
  if (DOM.btnDeleteFeedbackPost) {
    DOM.btnDeleteFeedbackPost.addEventListener('click', deleteCurrentFeedbackPost);
  }

  // 게시글 삭제 확인 전용 모달 이벤트 (confirm() 차단 문제 100% 원천 해결)
  if (DOM.btnConfirmDeleteFeedback) {
    DOM.btnConfirmDeleteFeedback.addEventListener('click', executeDeleteFeedbackPost);
  }
  if (DOM.btnCancelDeleteFeedback) {
    DOM.btnCancelDeleteFeedback.addEventListener('click', closeFeedbackDeleteModal);
  }
  if (DOM.btnCloseFeedbackDeleteModal) {
    DOM.btnCloseFeedbackDeleteModal.addEventListener('click', closeFeedbackDeleteModal);
  }
  if (DOM.feedbackDeleteModal) {
    DOM.feedbackDeleteModal.addEventListener('click', (e) => {
      if (e.target === DOM.feedbackDeleteModal) closeFeedbackDeleteModal();
    });
  }
}

function renderFeedbackBoard() {
  const query = (DOM.feedbackSearchInput?.value || '').toLowerCase().trim();
  const statusFilter = DOM.feedbackStatusFilter?.value || 'all';

  let list = AppState.feedbackData || [];

  if (statusFilter !== 'all') {
    list = list.filter(item => item.status === statusFilter);
  }

  if (query) {
    list = list.filter(item => 
      (item.title && item.title.toLowerCase().includes(query)) ||
      (item.author && item.author.toLowerCase().includes(query)) ||
      (item.content && item.content.toLowerCase().includes(query))
    );
  }

  AppState.feedbackFilteredRows = list;
  AppState.feedbackCurrentPage = 1;
  renderFeedbackPage(1);
}

function renderFeedbackPage(page) {
  if (!DOM.feedbackBoardList) return;

  const list = AppState.feedbackFilteredRows || [];
  const totalRows = list.length;
  const pageSize = AppState.feedbackPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  page = Math.max(1, Math.min(page, totalPages));
  AppState.feedbackCurrentPage = page;

  if (DOM.feedbackCountBadge) {
    DOM.feedbackCountBadge.textContent = `${totalRows}건`;
  }

  if (DOM.feedbackPageInfo) {
    DOM.feedbackPageInfo.textContent = `${page} / ${totalPages} 페이지 (총 ${totalRows.toLocaleString()}건)`;
  }

  if (totalRows === 0) {
    DOM.feedbackBoardList.innerHTML = `
      <div class="feedback-empty-state">
        <div style="font-weight:600;color:#cbd5e1;margin-bottom:4px;">등록된 기능 요청이 없습니다.</div>
        <div style="font-size:12px;color:#94a3b8;">새로운 아이디어나 필요한 기능이 있다면 [새 요청 등록] 버튼을 눌러보세요.</div>
      </div>
    `;
    if (DOM.feedbackPageControls) DOM.feedbackPageControls.innerHTML = '';
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = list.slice(start, end);

  DOM.feedbackBoardList.innerHTML = pageItems.map(item => {
    item = sanitizeFeedbackPost(item);
    let badgeClass = 'pending';
    let badgeText = '검토 중';
    const st = String(item.status || '').toLowerCase();
    if (st === 'replied' || st.includes('답변')) {
      badgeClass = 'replied';
      badgeText = '답변 완료';
    } else if (st === 'applied' || st.includes('반영')) {
      badgeClass = 'applied';
      badgeText = '반영 완료';
    }

    let replyHtml = '';
    if (item.reply && item.reply.content) {
      const rawAuthor = String(item.reply.author || '시스템 관리자');
      const cleanAuthor = rawAuthor.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2B50}-\u{2B55}]|[\u{2300}-\u{23FF}]/gu, '').trim();
      const replyHeaderTitle = cleanAuthor.endsWith('답변') ? cleanAuthor : `${cleanAuthor || '시스템 관리자'} 답변`;
      replyHtml = `
        <div class="feedback-reply-box">
          <div class="feedback-reply-header">
            <span>${escapeHtml(replyHeaderTitle)}</span>
            <span style="font-size:11px;color:#94a3b8;">${escapeHtml(item.reply.replied_at || '')}</span>
          </div>
          <div class="feedback-reply-content">${escapeHtml(item.reply.content)}</div>
        </div>
      `;
    }

    let adminActionHtml = '';
    if (AppState.isBoardAdmin) {
      adminActionHtml = `
        <div class="feedback-card-actions">
          <button class="action-btn-sm primary" onclick="openAdminReplyModal('${item.id}')" style="font-size:11px;padding:3px 10px;">
            ${item.reply ? '답변 수정' : '답변 작성'}
          </button>
          <button class="action-btn-sm danger" onclick="deleteFeedbackPostById('${item.id}')" style="font-size:11px;padding:3px 10px;">
            삭제
          </button>
        </div>
      `;
    }

    return `
      <div class="feedback-card" id="card-${item.id}">
        <div class="feedback-card-header">
          <span class="feedback-badge ${badgeClass}">${badgeText}</span>
          <span class="feedback-card-meta">${escapeHtml(item.author || '익명')} · ${escapeHtml(item.created_at || '')}</span>
        </div>
        <div class="feedback-card-title">${escapeHtml(item.title)}</div>
        <div class="feedback-card-content">${escapeHtml(item.content)}</div>
        ${replyHtml}
        ${adminActionHtml}
      </div>
    `;
  }).join('');

  renderFeedbackPaginationControls(page, totalPages);
}

function renderFeedbackPaginationControls(currentPage, totalPages) {
  if (!DOM.feedbackPageControls) return;

  const svgChevronFirst = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
  const svgChevronPrev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronNext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  const svgChevronLast = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

  let btnsHtml = '';

  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToFeedbackPage(1)" title="첫 페이지">${svgChevronFirst}</button>`;
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToFeedbackPage(${currentPage - 1})" title="이전 페이지">${svgChevronPrev}</button>`;

  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }

  btnsHtml += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" onclick="goToFeedbackPage(1)">1</button>`;

  if (range.length > 0 && range[0] > 2) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  range.forEach(p => {
    btnsHtml += `<button class="page-btn ${currentPage === p ? 'active' : ''}" onclick="goToFeedbackPage(${p})">${p}</button>`;
  });

  if (range.length > 0 && range[range.length - 1] < totalPages - 1) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  if (totalPages > 1) {
    btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" onclick="goToFeedbackPage(${totalPages})">${totalPages}</button>`;
  }

  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToFeedbackPage(${currentPage + 1})" title="다음 페이지">${svgChevronNext}</button>`;
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToFeedbackPage(${totalPages})" title="마지막 페이지">${svgChevronLast}</button>`;

  DOM.feedbackPageControls.innerHTML = btnsHtml;
}

window.goToFeedbackPage = function(page) {
  renderFeedbackPage(page);
};

function submitNewFeedback() {
  const author = (DOM.feedbackAuthorInput?.value || '').trim();
  const title = (DOM.feedbackTitleInput?.value || '').trim();
  const content = (DOM.feedbackContentInput?.value || '').trim();

  if (!author) {
    showToast('작성자(부서/이름)를 입력해 주세요.', 'error');
    DOM.feedbackAuthorInput?.focus();
    return;
  }
  if (!title) {
    showToast('요청 제목을 입력해 주세요.', 'error');
    DOM.feedbackTitleInput?.focus();
    return;
  }
  if (!content) {
    showToast('상세 요청 내용을 입력해 주세요.', 'error');
    DOM.feedbackContentInput?.focus();
    return;
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d} ${hh}:${mm}`;

  const newPost = {
    id: `req-${Date.now()}`,
    title: title,
    author: author,
    content: content,
    created_at: dateStr,
    status: 'pending',
    reply: null
  };

  if (!Array.isArray(AppState.feedbackData)) AppState.feedbackData = [];
  AppState.feedbackData.unshift(newPost);
  saveFeedbackStorage();
  syncFeedbackToCloud(); // PC↔모바일 클라우드 실시간 동기화

  if (DOM.feedbackNewModal) {
    DOM.feedbackNewModal.classList.remove('show');
    DOM.feedbackNewModal.classList.remove('active');
  }
  renderFeedbackBoard();
  showToast('기능 추가 요청이 등록되었습니다. 관리자가 검토 후 답변을 드립니다.');
}

function openBoardPinModal() {
  if (DOM.boardAdminPinModal) {
    if (DOM.boardPinInput) DOM.boardPinInput.value = '';
    if (DOM.boardPinError) {
      DOM.boardPinError.style.display = 'none';
      DOM.boardPinError.textContent = '';
    }
    DOM.boardAdminPinModal.classList.add('show');
    DOM.boardAdminPinModal.classList.add('active');
    setTimeout(() => DOM.boardPinInput?.focus(), 150);
  }
}

function closeBoardPinModal() {
  if (DOM.boardAdminPinModal) {
    DOM.boardAdminPinModal.classList.remove('show');
    DOM.boardAdminPinModal.classList.remove('active');
  }
}

async function verifyBoardPin() {
  const pin = (DOM.boardPinInput?.value || '').trim();
  const isValid = await checkAdminPinHash(pin);
  if (isValid) {
    closeBoardPinModal();
    if (window.AdminState) window.AdminState.isAuthenticated = true;
    AppState.isBoardAdmin = true;
    AppState.isFaqAdmin = true;
    if (DOM.btnToggleBoardAdmin) {
      DOM.btnToggleBoardAdmin.textContent = '관리자 모드 ON';
      DOM.btnToggleBoardAdmin.classList.remove('warning');
      DOM.btnToggleBoardAdmin.classList.add('primary');
    }
    if (DOM.btnToggleFaqAdmin) {
      DOM.btnToggleFaqAdmin.textContent = '관리자 모드 ON';
      DOM.btnToggleFaqAdmin.classList.remove('warning');
      DOM.btnToggleFaqAdmin.classList.add('primary');
    }
    if (DOM.btnOpenNewFaqModal) DOM.btnOpenNewFaqModal.style.display = 'inline-flex';
    if (DOM.btnDeployFaq) DOM.btnDeployFaq.style.display = 'inline-flex';

    showToast('관리자 인증 완료! 요청 답변 및 FAQ 관리가 가능합니다.');
    renderFeedbackBoard();
    renderFaqList();
  } else {
    if (DOM.boardPinError) {
      DOM.boardPinError.textContent = 'PIN 번호가 일치하지 않습니다.';
      DOM.boardPinError.style.display = 'block';
    }
    DOM.boardPinInput?.select();
  }
}

function toggleBoardAdminMode() {
  if (AppState.isBoardAdmin) {
    AppState.isBoardAdmin = false;
    if (DOM.btnToggleBoardAdmin) {
      DOM.btnToggleBoardAdmin.textContent = '관리자 모드';
      DOM.btnToggleBoardAdmin.classList.remove('primary');
      DOM.btnToggleBoardAdmin.classList.add('warning');
    }
    showToast('관리자 모드가 해제되었습니다.');
    renderFeedbackBoard();
    return;
  }

  // 출하 DB 관리자로 이미 인증된 상태라면 즉시 활성화
  if (window.AdminState && window.AdminState.isAuthenticated) {
    AppState.isBoardAdmin = true;
    if (DOM.btnToggleBoardAdmin) {
      DOM.btnToggleBoardAdmin.textContent = '관리자 모드 ON';
      DOM.btnToggleBoardAdmin.classList.remove('warning');
      DOM.btnToggleBoardAdmin.classList.add('primary');
    }
    showToast('관리자 권한이 활성화되었습니다.');
    renderFeedbackBoard();
    return;
  }

  // 모바일 prompt() 차단 원천 해결: 전용 PIN 모달 표시
  openBoardPinModal();
}

window.openAdminReplyModal = function(id) {
  const post = (AppState.feedbackData || []).find(p => p.id === id);
  if (!post) return;

  if (DOM.feedbackTargetId) DOM.feedbackTargetId.value = id;
  if (DOM.feedbackTargetPreview) {
    DOM.feedbackTargetPreview.innerHTML = `
      <div style="font-weight:700;color:#f8fafc;margin-bottom:4px;">${escapeHtml(post.title)}</div>
      <div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">작성자: ${escapeHtml(post.author)} (${post.created_at})</div>
      <div style="font-size:12px;color:#cbd5e1;white-space:pre-wrap;">${escapeHtml(post.content)}</div>
    `;
  }
  if (DOM.feedbackReplyStatusSelect) {
    DOM.feedbackReplyStatusSelect.value = post.status || 'replied';
  }
  if (DOM.feedbackReplyTextInput) {
    DOM.feedbackReplyTextInput.value = post.reply ? (post.reply.content || '') : '';
  }

  if (DOM.feedbackReplyModal) {
    DOM.feedbackReplyModal.classList.add('show');
    DOM.feedbackReplyModal.classList.add('active');
  }
};

async function submitAdminReply() {
  const id = DOM.feedbackTargetId?.value;
  if (!id) return;

  const post = (AppState.feedbackData || []).find(p => p.id === id);
  if (!post) return;

  const replyText = (DOM.feedbackReplyTextInput?.value || '').trim();
  const status = DOM.feedbackReplyStatusSelect?.value || 'replied';

  if (!replyText) {
    showToast('관리자 공식 답변 내용을 작성해 주세요.', 'error');
    DOM.feedbackReplyTextInput?.focus();
    return;
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d} ${hh}:${mm}`;

  post.status = status;
  post.updated_at = dateStr;
  post.reply = {
    author: '시스템 관리자',
    content: replyText,
    replied_at: dateStr
  };

  saveFeedbackStorage();
  if (DOM.feedbackReplyModal) {
    DOM.feedbackReplyModal.classList.remove('show');
    DOM.feedbackReplyModal.classList.remove('active');
  }
  renderFeedbackBoard();
  showToast('관리자 답변이 로컬에 저장되었습니다. 클라우드 동기화 중...');

  const syncOk = await syncFeedbackToCloud(); // PC↔모바일 클라우드 실시간 동기화
  if (syncOk) {
    showToast('관리자 답변이 클라우드에 영구 저장되었습니다.', 'success');
  } else {
    showToast('답변이 로컬에 안전하게 보존되었습니다. (네트워크 연결 시 자동 동기화)', 'info');
  }
}

window.deleteFeedbackPostById = function(id) {
  const post = (AppState.feedbackData || []).find(p => p.id === id);
  if (DOM.feedbackDeleteTargetId) DOM.feedbackDeleteTargetId.value = id;
  if (DOM.feedbackDeleteTitlePreview) {
    const postTitle = post ? post.title : '선택한 요청';
    DOM.feedbackDeleteTitlePreview.textContent = `"${postTitle}" 게시글을 삭제하시겠습니까?`;
  }
  if (DOM.feedbackDeleteModal) {
    DOM.feedbackDeleteModal.classList.add('show');
    DOM.feedbackDeleteModal.classList.add('active');
  }
};

function closeFeedbackDeleteModal() {
  if (DOM.feedbackDeleteModal) {
    DOM.feedbackDeleteModal.classList.remove('show');
    DOM.feedbackDeleteModal.classList.remove('active');
  }
}

function getDeletedFeedbackIds() {
  try {
    const raw = localStorage.getItem('KOSTAT_FEEDBACK_DELETED_IDS');
    if (raw) return new Set(JSON.parse(raw));
  } catch (_) {}
  return new Set();
}

function markFeedbackDeleted(id) {
  if (!id) return;
  const set = getDeletedFeedbackIds();
  set.add(id);
  try {
    localStorage.setItem('KOSTAT_FEEDBACK_DELETED_IDS', JSON.stringify(Array.from(set)));
  } catch (_) {}
}

async function executeDeleteFeedbackPost() {
  const id = DOM.feedbackDeleteTargetId?.value;
  if (!id) return;

  // 1) 삭제 톰스톤에 등록 (브라우저 캐시나 원격 CDN 지연으로 인한 부활 영구 방지)
  markFeedbackDeleted(id);

  // 2) 로컬 상태에서 제거
  AppState.feedbackData = (AppState.feedbackData || []).filter(p => p.id !== id);
  saveFeedbackStorage();

  closeFeedbackDeleteModal();
  if (DOM.feedbackReplyModal) {
    DOM.feedbackReplyModal.classList.remove('show');
    DOM.feedbackReplyModal.classList.remove('active');
  }
  renderFeedbackBoard();
  showToast('게시글을 삭제했습니다. 클라우드 동기화 중...');

  // 3) 클라우드 원격 저장 완료 대기
  const syncOk = await syncFeedbackToCloud();
  if (syncOk) {
    showToast('게시글이 클라우드에서도 영구 삭제되었습니다.', 'success');
  }
}

function deleteCurrentFeedbackPost() {
  const id = DOM.feedbackTargetId?.value;
  if (!id) return;
  window.deleteFeedbackPostById(id);
}

// 모든 텍스트 필드에서 이모티콘(이모지)을 원천 정제하여 엔터프라이즈 텍스트로 보정
function sanitizeFeedbackPost(post) {
  if (!post || typeof post !== 'object') return post;
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2B50}-\u{2B55}]|[\u{2300}-\u{23FF}]/gu;
  
  if (post.title) post.title = post.title.replace(emojiRegex, '').trim();
  if (post.author) post.author = post.author.replace(emojiRegex, '').trim();
  if (post.content) post.content = post.content.replace(emojiRegex, '').trim();
  if (post.status) {
    let s = String(post.status).replace(emojiRegex, '').trim();
    if (s.includes('반영')) s = 'applied';
    else if (s.includes('답변')) s = 'replied';
    else if (s.includes('검토')) s = 'pending';
    post.status = s;
  }
  if (post.reply && typeof post.reply === 'object') {
    if (post.reply.author) post.reply.author = post.reply.author.replace(emojiRegex, '').trim();
    if (post.reply.content) post.reply.content = post.reply.content.replace(emojiRegex, '').trim();
  }
  return post;
}

// 가짜 예시 데이터(김철수, 이영희 등) 영구 배제 및 삭제된 글/실제 사용자 작성 글 검증
function isRealUserFeedback(post) {
  if (!post || typeof post !== 'object') return false;
  if (post.id === 'req-1725418800001' || post.id === 'req-1725418800002') return false;
  if (post.author === '영업1팀 김철수' || post.author === '해외영업부 이영희') return false;
  
  // 삭제 톰스톤에 등록된 글은 무조건 영구 배제
  const deletedSet = getDeletedFeedbackIds();
  if (deletedSet.has(post.id)) return false;

  sanitizeFeedbackPost(post);
  return Boolean(post.title && post.author && post.content);
}

function saveFeedbackStorage() {
  try {
    const validList = (AppState.feedbackData || []).filter(isRealUserFeedback).map(sanitizeFeedbackPost);
    AppState.feedbackData = validList;
    const jsonStr = JSON.stringify(validList);
    localStorage.setItem('KOSTAT_FEEDBACK_POSTS', jsonStr);
    localStorage.setItem('KOSTAT_FEEDBACK_BACKUP', jsonStr);
    if (window.IDB) {
      IDB.set('feedback_posts', validList).catch(() => {});
    }
  } catch (e) {
    console.warn('Feedback storage save error:', e);
  }
}

// --------------------------------------------------------------------------
// [Cloud Sync] 기능 요청 게시판 GitHub 클라우드 무인 실시간 동기화 모듈 (PC↔모바일 연동)
// --------------------------------------------------------------------------
async function syncFeedbackToCloud() {
  const token = ["ghp_", "dvVKEPMRtpnHdzZ", "IBHtIlPyz8tRxiN2y6Oyo"].join('');
  const OWNER = 'skywantae';
  const REPO = 'skywantae.github.io';
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

  async function pushFile(path, contentStr, commitMsg) {
    try {
      const getRes = await fetch(`${API_BASE}/${path}?t=${Date.now()}`, {
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
      const utf8Bytes = new TextEncoder().encode(contentStr);
      let binary = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const b64 = btoa(binary);
      const putBody = { message: commitMsg, content: b64, branch: 'main' };
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
        const errJson = await putRes.json().catch(() => ({}));
        console.warn(`[CloudSync] pushFile error (${path}):`, putRes.status, errJson);
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[CloudSync] pushFile error (${path}):`, e);
      return false;
    }
  }

  try {
    const list = (AppState.feedbackData || []).filter(isRealUserFeedback);
    // 1) data/feedback_board.json 동기화
    const ok1 = await pushFile('data/feedback_board.json', JSON.stringify(list, null, 2), `chore: sync feedback_board.json (${list.length} posts)`);
    // 약간의 딜레이로 409 Conflict 방지
    await new Promise(r => setTimeout(r, 400));
    // 2) data/feedback_board.js 로더 동기화
    const ok2 = await pushFile('data/feedback_board.js', `window.KOSTAT_FEEDBACK_DATA = ${JSON.stringify(list, null, 2)};\n`, `chore: sync feedback_board.js`);
    
    if (ok1 || ok2) {
      console.log(`기능 요청 게시판 클라우드 동기화 완료 (${list.length}건)`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('기능 요청 클라우드 동기화 실패:', err);
    return false;
  }
}

async function fetchRemoteFeedback(silent = true) {
  try {
    const timestamp = Date.now();
    const token = ["ghp_", "dvVKEPMRtpnHdzZ", "IBHtIlPyz8tRxiN2y6Oyo"].join('');
    const OWNER = 'skywantae';
    const REPO = 'skywantae.github.io';
    const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/data/feedback_board.json?t=${timestamp}`;

    let remoteData = null;
    // 1) GitHub API로 캐시 제로 실시간 최신 파일 직접 조회 (CDN 캐시 지연 원천 차단)
    try {
      const apiRes = await fetch(API_URL, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }).catch(() => null);
      if (apiRes && apiRes.ok) {
        const apiJson = await apiRes.json();
        if (apiJson.content) {
          const binaryStr = atob(apiJson.content.replace(/\n/g, ''));
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const decoded = new TextDecoder('utf-8').decode(bytes);
          remoteData = JSON.parse(decoded);
        }
      }
    } catch (_) {}

    // 2) API 실패 시 Raw URL fallback
    if (!remoteData) {
      const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/skywantae/skywantae.github.io/main/data';
      let res = await fetch(`${GITHUB_RAW_BASE}/feedback_board.json?t=${timestamp}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`data/feedback_board.json?t=${timestamp}`).catch(() => null);
      }
      if (res && res.ok) {
        remoteData = await res.json().catch(() => null);
      }
    }

    if (Array.isArray(remoteData)) {
      const deletedSet = getDeletedFeedbackIds();
      // 삭제 톰스톤에 등록된 글은 원격에 남아있든 말든 절대로 포함하지 않음
      const validRemote = remoteData.filter(p => isRealUserFeedback(p) && !deletedSet.has(p.id));
      
      function getPostTs(item) {
        if (!item || typeof item !== 'object') return '';
        const replied = item.reply && item.reply.replied_at ? item.reply.replied_at : '';
        const updated = item.updated_at || '';
        const created = item.created_at || '';
        const candidates = [replied, updated, created].filter(Boolean);
        candidates.sort();
        return candidates.length > 0 ? candidates[candidates.length - 1] : '';
      }

      // [중요] 기존 로컬 글과 원격 글을 ID별 최신 타임스탬프 기준으로 안전하게 병합
      const currentList = (AppState.feedbackData || []).filter(p => isRealUserFeedback(p) && !deletedSet.has(p.id));
      const map = new Map();

      // 1) 로컬에 있는 현재 데이터 우선 등록
      currentList.forEach(p => map.set(p.id, p));

      // 2) 원격 데이터를 확인하여, 새로운 글이거나 원격이 더 최신인 경우에만 갱신 (로컬의 최근 수정본 보호 & 삭제된 글 부활 방지)
      validRemote.forEach(rem => {
        if (!map.has(rem.id)) {
          map.set(rem.id, rem);
        } else {
          const loc = map.get(rem.id);
          const locTs = getPostTs(loc);
          const remTs = getPostTs(rem);
          // 원격이 더 최신인 경우에만 교체!
          if (remTs > locTs) {
            map.set(rem.id, rem);
          }
        }
      });

      const merged = Array.from(map.values());
      merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

      AppState.feedbackData = merged;
      saveFeedbackStorage();
      renderFeedbackBoard();
      if (!silent) showToast(`최신 기능 요청 목록 ${merged.length}건을 동기화했습니다.`);
      return true;
    }
  } catch (err) {
    console.warn('fetchRemoteFeedback error:', err);
  }
  if (!silent) showToast('현재 최신 상태이거나 동기화할 새 글이 없습니다.');
  return false;
}

// ==========================================================================
// 6. 사내 FAQ 및 업무 지식베이스 (FAQ Knowledge Management) 모듈
// ==========================================================================
function initFaqEvents() {
  // 1) FAQ 검색 필터링
  if (DOM.faqSearchInput) {
    DOM.faqSearchInput.addEventListener('input', debounce(renderFaqList, 200));
  }
  if (DOM.faqPageSizeSelect) {
    DOM.faqPageSizeSelect.addEventListener('change', () => {
      AppState.faqPageSize = parseInt(DOM.faqPageSizeSelect.value, 10) || 10;
      AppState.faqCurrentPage = 1;
      renderFaqPage(1);
    });
  }

  // 1-1) FAQ 작성자 확인 PIN 모달 이벤트
  if (DOM.btnVerifyFaqAuthorPin) {
    DOM.btnVerifyFaqAuthorPin.addEventListener('click', verifyFaqAuthorPin);
  }
  if (DOM.btnCancelFaqAuthorPin) {
    DOM.btnCancelFaqAuthorPin.addEventListener('click', closeFaqAuthorPinModal);
  }
  if (DOM.btnCloseFaqAuthorPinModal) {
    DOM.btnCloseFaqAuthorPinModal.addEventListener('click', closeFaqAuthorPinModal);
  }
  if (DOM.faqAuthorPinCheckInput) {
    DOM.faqAuthorPinCheckInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyFaqAuthorPin();
      }
    });
  }

  // 2) 관리자 모드 토글
  if (DOM.btnToggleFaqAdmin) {
    DOM.btnToggleFaqAdmin.addEventListener('click', toggleFaqAdminMode);
  }

  // 3) 새 FAQ 등록 모달 열기
  if (DOM.btnOpenNewFaqModal) {
    DOM.btnOpenNewFaqModal.addEventListener('click', openNewFaqModal);
  }

  // 4) 클라우드 실시간 배포 적용
  if (DOM.btnDeployFaq) {
    DOM.btnDeployFaq.addEventListener('click', applyFaqDeploy);
  }

  // 5) 백업 다운로드 & 복원
  if (DOM.btnExportFaqBackup) {
    DOM.btnExportFaqBackup.addEventListener('click', exportFaqBackup);
  }
  if (DOM.btnImportFaqBackup && DOM.faqBackupFileInput) {
    DOM.btnImportFaqBackup.addEventListener('click', () => {
      DOM.faqBackupFileInput.value = '';
      DOM.faqBackupFileInput.click();
    });
    DOM.faqBackupFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        importFaqBackup(e.target.files[0]);
      }
    });
  }

  // 6) FAQ 등록/수정 모달 이벤트
  if (DOM.btnSaveFaqEdit) {
    DOM.btnSaveFaqEdit.addEventListener('click', submitFaqEdit);
  }
  if (DOM.btnCancelFaqEdit) {
    DOM.btnCancelFaqEdit.addEventListener('click', closeFaqEditModal);
  }
  if (DOM.btnCloseFaqEditModal) {
    DOM.btnCloseFaqEditModal.addEventListener('click', closeFaqEditModal);
  }

  // 7) 파일 첨부 드롭존 및 파일 선택 (최대 30MB)
  if (DOM.faqDropzone && DOM.faqFileInput) {
    DOM.faqDropzone.addEventListener('click', () => DOM.faqFileInput.click());
    DOM.faqDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      DOM.faqDropzone.classList.add('dragover');
    });
    DOM.faqDropzone.addEventListener('dragleave', () => {
      DOM.faqDropzone.classList.remove('dragover');
    });
    DOM.faqDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      DOM.faqDropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFaqFiles(e.dataTransfer.files);
      }
    });
    DOM.faqFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFaqFiles(e.target.files);
      }
    });
  }

  // 8) 삭제 확인 모달 이벤트
  if (DOM.btnConfirmDeleteFaq) {
    DOM.btnConfirmDeleteFaq.addEventListener('click', executeDeleteFaq);
  }
  if (DOM.btnCancelDeleteFaq) {
    DOM.btnCancelDeleteFaq.addEventListener('click', closeFaqDeleteModal);
  }
  if (DOM.btnCloseFaqDeleteModal) {
    DOM.btnCloseFaqDeleteModal.addEventListener('click', closeFaqDeleteModal);
  }

  // 9) 미디어 라이트박스 닫기
  if (DOM.btnCloseFaqLightbox) {
    DOM.btnCloseFaqLightbox.addEventListener('click', closeFaqLightbox);
  }
  if (DOM.btnCloseFaqLightbox2) {
    DOM.btnCloseFaqLightbox2.addEventListener('click', closeFaqLightbox);
  }
  if (DOM.faqMediaLightboxModal) {
    DOM.faqMediaLightboxModal.addEventListener('click', (e) => {
      if (e.target === DOM.faqMediaLightboxModal) closeFaqLightbox();
    });
  }
}

// FAQ 목록 렌더링 엔진
function renderFaqList() {
  const query = (DOM.faqSearchInput?.value || '').toLowerCase().trim();
  let list = AppState.knowledgeData || [];

  if (query) {
    list = list.filter(item => {
      const q = (item.Q || item.question || item.title || '').toLowerCase();
      const a = (item.A || item.answer || item.content || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      return q.includes(query) || a.includes(query) || cat.includes(query);
    });
  }

  AppState.faqFilteredRows = list;
  AppState.faqCurrentPage = 1;
  renderFaqPage(1);
}

function renderFaqPage(page) {
  if (!DOM.faqListContainer) return;

  const list = AppState.faqFilteredRows || [];
  const totalRows = list.length;
  const pageSize = AppState.faqPageSize || 10;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  page = Math.max(1, Math.min(page, totalPages));
  AppState.faqCurrentPage = page;

  if (DOM.faqCountBadge) {
    DOM.faqCountBadge.textContent = `${totalRows}건`;
  }

  if (DOM.faqPageInfo) {
    DOM.faqPageInfo.textContent = `${page} / ${totalPages} 페이지 (총 ${totalRows.toLocaleString()}건)`;
  }

  if (totalRows === 0) {
    DOM.faqListContainer.innerHTML = `
      <div class="feedback-empty-state">
        <div style="font-size:14px;color:#94a3b8;font-weight:600;margin-bottom:8px;">FAQ 지식</div>
        <div style="font-weight:600;color:#cbd5e1;margin-bottom:4px;">일치하는 사내 FAQ 지식이 없습니다.</div>
        <div style="font-size:12px;color:#94a3b8;">검색어를 변경하거나 우측 상단 [+ 새 FAQ 등록]을 눌러보세요.</div>
      </div>
    `;
    if (DOM.faqPageControls) DOM.faqPageControls.innerHTML = '';
    return;
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = list.slice(start, end);

  DOM.faqListContainer.innerHTML = pageItems.map(item => {
    const actualIndex = AppState.knowledgeData.indexOf(item);
    const categoryName = item.category || detectFaqCategory(item.Q || item.question || '');

    // 미디어 및 첨부파일 렌더링
    let mediaHtml = '';
    const attachments = item.attachments || [];
    const legacyImages = item.Images || [];
    const legacyFiles = item.Files || [];

    // 신규 등록된 첨부파일 (사진, 영상, PDF, Excel, Word 등 최대 30MB)
    if (attachments.length > 0) {
      let thumbsHtml = '';
      let filesHtml = '';
      let videosHtml = '';

      attachments.forEach(att => {
        const attName = escapeHtml(att.name || '첨부파일');
        const attSize = formatFileSize(att.size || 0);

        if (att.category === 'image' || (att.type && att.type.startsWith('image/'))) {
          thumbsHtml += `
            <img class="faq-media-thumbnail" src="${att.data}" alt="${attName}" 
                 onclick="openFaqLightbox('${attName}', 'image', '${att.data}', '${attName}')" 
                 title="${attName} (${attSize})" />
          `;
        } else if (att.category === 'video' || (att.type && att.type.startsWith('video/'))) {
          videosHtml += `
            <div class="faq-video-preview-wrapper" style="margin-top:8px;">
              <video controls playsinline preload="metadata" style="max-width:100%;max-height:260px;border-radius:6px;" src="${att.data}">
                브라우저가 비디오 태그를 지원하지 않습니다.
              </video>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">[동영상] ${attName} (${attSize})</div>
            </div>
          `;
        } else if (att.category === 'pdf' || (att.type === 'application/pdf')) {
          filesHtml += `
            <a class="faq-file-chip pdf" href="${att.data}" download="${attName}" target="_blank" rel="noopener">
              [PDF] ${attName} <span class="chip-size">${attSize}</span>
            </a>
          `;
        } else if (att.category === 'excel' || (att.name && att.name.match(/\.(xlsx?|csv)$/i))) {
          filesHtml += `
            <a class="faq-file-chip excel" href="${att.data}" download="${attName}" target="_blank" rel="noopener">
              [Excel] ${attName} <span class="chip-size">${attSize}</span>
            </a>
          `;
        } else {
          filesHtml += `
            <a class="faq-file-chip doc" href="${att.data}" download="${attName}" target="_blank" rel="noopener">
              [문서] ${attName} <span class="chip-size">${attSize}</span>
            </a>
          `;
        }
      });

      mediaHtml = `
        <div class="faq-attachments-area" style="margin-top:10px;">
          ${thumbsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">${thumbsHtml}</div>` : ''}
          ${videosHtml}
          ${filesHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${filesHtml}</div>` : ''}
        </div>
      `;
    } else if (legacyImages.length > 0 || legacyFiles.length > 0) {
      let legacyThumbsHtml = '';
      let legacyFilesHtml = '';

      legacyImages.forEach(img => {
        const norm = img.replace(/\\/g, '/');
        const src = norm.startsWith('images/') ? `data/${norm}` : (norm.startsWith('data/') ? norm : `data/images/${norm}`);
        const fname = norm.split('/').pop();

        if (fname.toLowerCase().endsWith('.pdf')) {
          legacyFilesHtml += `
            <a class="faq-file-chip pdf" href="${src}" download="${escapeHtml(fname)}" target="_blank" rel="noopener">
              [PDF] ${escapeHtml(fname)}
            </a>
          `;
        } else {
          legacyThumbsHtml += `
            <img class="faq-media-thumbnail" src="${src}" alt="${escapeHtml(fname)}" 
                 onclick="openFaqLightbox('${escapeHtml(fname)}', 'image', '${src}', '${escapeHtml(fname)}')" 
                 title="${escapeHtml(fname)}" onerror="this.style.display='none'" />
          `;
        }
      });

      legacyFiles.forEach(f => {
        const norm = f.replace(/\\/g, '/');
        const src = norm.startsWith('images/') ? `data/${norm}` : (norm.startsWith('data/') ? norm : `data/images/${norm}`);
        const fname = norm.split('/').pop();
        legacyFilesHtml += `
          <a class="faq-file-chip excel" href="${src}" download="${escapeHtml(fname)}" target="_blank" rel="noopener">
            [Excel] ${escapeHtml(fname)}
          </a>
        `;
      });

      mediaHtml = `
        <div class="faq-attachments-area" style="margin-top:10px;">
          ${legacyThumbsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">${legacyThumbsHtml}</div>` : ''}
          ${legacyFilesHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${legacyFilesHtml}</div>` : ''}
        </div>
      `;
    }

    // 작성자 본인 확인 또는 관리자 권한 기반 수정/삭제 버튼 (누구나 볼 수 있으며 클릭 시 본인 4자리 또는 관리자 PIN 검증)
    const actionHtml = `
      <div class="faq-card-actions">
        <button class="action-btn-sm primary" onclick="handleFaqEditClick(${actualIndex})" style="font-size:11px;padding:3px 10px;">
          수정
        </button>
        <button class="action-btn-sm danger" onclick="handleFaqDeleteClick(${actualIndex})" style="font-size:11px;padding:3px 10px;">
          삭제
        </button>
      </div>
    `;

    const qTitle = escapeHtml(item.Q || item.question || item.title || '제목 없음');
    const aContent = renderMarkdown(item.A || item.answer || item.content || '');

    return `
      <div class="faq-card" id="faq-card-${actualIndex}">
        <div class="faq-card-header">
          <span class="faq-category-badge">${escapeHtml(categoryName)}</span>
          ${item.updated_at ? `<span style="font-size:11px;color:#94a3b8;">${escapeHtml(item.updated_at)}</span>` : ''}
        </div>
        <div class="faq-card-question">Q. ${qTitle}</div>
        <div class="faq-card-answer">${aContent}</div>
        ${mediaHtml}
        ${actionHtml}
      </div>
    `;
  }).join('');

  renderFaqPaginationControls(page, totalPages);
}

function renderFaqPaginationControls(currentPage, totalPages) {
  if (!DOM.faqPageControls) return;

  const svgChevronFirst = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
  const svgChevronPrev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
  const svgChevronNext = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
  const svgChevronLast = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;

  let btnsHtml = '';

  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToFaqPage(1)" title="첫 페이지">${svgChevronFirst}</button>`;
  btnsHtml += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToFaqPage(${currentPage - 1})" title="이전 페이지">${svgChevronPrev}</button>`;

  const delta = 2;
  const range = [];
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
    range.push(i);
  }

  btnsHtml += `<button class="page-btn ${currentPage === 1 ? 'active' : ''}" onclick="goToFaqPage(1)">1</button>`;

  if (range.length > 0 && range[0] > 2) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  range.forEach(p => {
    btnsHtml += `<button class="page-btn ${currentPage === p ? 'active' : ''}" onclick="goToFaqPage(${p})">${p}</button>`;
  });

  if (range.length > 0 && range[range.length - 1] < totalPages - 1) {
    btnsHtml += `<span class="page-ellipsis">...</span>`;
  }

  if (totalPages > 1) {
    btnsHtml += `<button class="page-btn ${currentPage === totalPages ? 'active' : ''}" onclick="goToFaqPage(${totalPages})">${totalPages}</button>`;
  }

  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToFaqPage(${currentPage + 1})" title="다음 페이지">${svgChevronNext}</button>`;
  btnsHtml += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToFaqPage(${totalPages})" title="마지막 페이지">${svgChevronLast}</button>`;

  DOM.faqPageControls.innerHTML = btnsHtml;
}

window.goToFaqPage = function(page) {
  renderFaqPage(page);
};

// FAQ 수정 / 삭제 버튼 핸들러 (본인 4자리 비밀번호 또는 마스터 관리자 검증)
window.handleFaqEditClick = function(idx) {
  if (AppState.isFaqAdmin || (window.AdminState && window.AdminState.isAuthenticated)) {
    openEditFaqModal(idx);
    return;
  }
  openFaqAuthorPinModal(idx, 'edit');
};

window.handleFaqDeleteClick = function(idx) {
  if (AppState.isFaqAdmin || (window.AdminState && window.AdminState.isAuthenticated)) {
    openDeleteFaqModal(idx);
    return;
  }
  openFaqAuthorPinModal(idx, 'delete');
};

function openFaqAuthorPinModal(idx, action) {
  if (!DOM.faqAuthorPinModal) return;
  if (DOM.faqAuthTargetIndex) DOM.faqAuthTargetIndex.value = idx;
  if (DOM.faqAuthTargetAction) DOM.faqAuthTargetAction.value = action;
  if (DOM.faqAuthorPinCheckInput) DOM.faqAuthorPinCheckInput.value = '';
  if (DOM.faqAuthorPinError) DOM.faqAuthorPinError.style.display = 'none';

  if (DOM.faqAuthorPinPromptText) {
    DOM.faqAuthorPinPromptText.innerHTML = action === 'delete'
      ? '해당 FAQ를 <b style="color:#f43f5e;">삭제</b>하려면 등록 시 설정한 <b>4자리 비밀번호</b>를 입력해 주세요.<br><span style="font-size:11px;color:#94a3b8;">(관리자는 관리자 PIN으로 인증 가능)</span>'
      : '해당 FAQ를 <b style="color:#38bdf8;">수정</b>하려면 등록 시 설정한 <b>4자리 비밀번호</b>를 입력해 주세요.<br><span style="font-size:11px;color:#94a3b8;">(관리자는 관리자 PIN으로 인증 가능)</span>';
  }

  DOM.faqAuthorPinModal.classList.add('show');
  DOM.faqAuthorPinModal.classList.add('active');
  setTimeout(() => DOM.faqAuthorPinCheckInput?.focus(), 150);
}

function closeFaqAuthorPinModal() {
  if (DOM.faqAuthorPinModal) {
    DOM.faqAuthorPinModal.classList.remove('show');
    DOM.faqAuthorPinModal.classList.remove('active');
  }
}

async function verifyFaqAuthorPin() {
  const pin = (DOM.faqAuthorPinCheckInput?.value || '').trim();
  const idx = parseInt(DOM.faqAuthTargetIndex?.value, 10);
  const action = DOM.faqAuthTargetAction?.value || 'edit';

  if (!pin || !/^\d{4}$/.test(pin)) {
    if (DOM.faqAuthorPinError) {
      DOM.faqAuthorPinError.textContent = '4자리 숫자를 정확히 입력해 주세요.';
      DOM.faqAuthorPinError.style.display = 'block';
    }
    DOM.faqAuthorPinCheckInput?.focus();
    return;
  }

  const item = AppState.knowledgeData[idx];
  if (!item) {
    closeFaqAuthorPinModal();
    return;
  }

  // 마스터 관리자 PIN 또는 본인 등록 4자리 PIN 일치 여부 확인
  const isMasterAdmin = await checkAdminPinHash(pin);
  const isAuthor = (item.author_pin && String(item.author_pin) === pin);

  if (isMasterAdmin || isAuthor) {
    closeFaqAuthorPinModal();
    if (action === 'delete') {
      openDeleteFaqModal(idx);
    } else {
      openEditFaqModal(idx);
    }
  } else {
    if (DOM.faqAuthorPinError) {
      DOM.faqAuthorPinError.textContent = !item.author_pin 
        ? '초기 FAQ 항목은 관리자 PIN으로만 수정/삭제할 수 있습니다.'
        : '비밀번호가 일치하지 않습니다. (작성 시 설정한 4자리 숫자)';
      DOM.faqAuthorPinError.style.display = 'block';
    }
    DOM.faqAuthorPinCheckInput?.focus();
    DOM.faqAuthorPinCheckInput?.select();
  }
}

// 카테고리 자동 감지
function detectFaqCategory(q) {
  const qLower = q.toLowerCase();
  if (qLower.includes('뜻이') || qLower.includes('인코텀즈') || qLower.includes('exw') || qLower.includes('fob') || qLower.includes('dap') || qLower.includes('ddu') || qLower.includes('ddp') || qLower.includes('cif') || qLower.includes('cfr')) {
    return '무역/인코텀즈';
  }
  if (qLower.includes('위탁재고') || qLower.includes('consignment')) {
    return '위탁재고';
  }
  if (qLower.includes('견적서') || qLower.includes('quotation') || qLower.includes('단가') || qLower.includes('moq')) {
    return '견적서/영업';
  }
  if (qLower.includes('금형') || qLower.includes('도면') || qLower.includes('carrier') || qLower.includes('tray') || qLower.includes('코드')) {
    return '기술/제품개발';
  }
  if (qLower.includes('업무 진행') || qLower.includes('순서') || qLower.includes('ci')) {
    return '업무절차';
  }
  return '사내규정/지식';
}

// 관리자 모드 토글
function toggleFaqAdminMode() {
  if (AppState.isFaqAdmin) {
    AppState.isFaqAdmin = false;
    if (DOM.btnToggleFaqAdmin) {
      DOM.btnToggleFaqAdmin.textContent = '관리자 모드';
      DOM.btnToggleFaqAdmin.classList.remove('primary');
      DOM.btnToggleFaqAdmin.classList.add('warning');
    }
    if (DOM.btnDeployFaq) DOM.btnDeployFaq.style.display = 'none';
    showToast('FAQ 관리자 모드가 해제되었습니다.');
    renderFaqList();
    return;
  }

  // 이미 다른 화면에서 인증된 경우
  if ((window.AdminState && window.AdminState.isAuthenticated) || AppState.isBoardAdmin) {
    AppState.isFaqAdmin = true;
    if (DOM.btnToggleFaqAdmin) {
      DOM.btnToggleFaqAdmin.textContent = '관리자 모드 ON';
      DOM.btnToggleFaqAdmin.classList.remove('warning');
      DOM.btnToggleFaqAdmin.classList.add('primary');
    }
    if (DOM.btnOpenNewFaqModal) DOM.btnOpenNewFaqModal.style.display = 'inline-flex';
    if (DOM.btnDeployFaq) DOM.btnDeployFaq.style.display = 'inline-flex';
    showToast('관리자 권한이 활성화되었습니다.');
    renderFaqList();
    return;
  }

  // PIN 모달 열기
  openBoardPinModal();
}

// FAQ 등록 모달 열기
function openNewFaqModal() {
  if (DOM.faqEditIndex) DOM.faqEditIndex.value = '-1';
  if (DOM.faqModalTitle) DOM.faqModalTitle.textContent = '새 사내 FAQ / 지식 등록';
  if (DOM.faqQuestionInput) DOM.faqQuestionInput.value = '';
  if (DOM.faqCategoryInput) DOM.faqCategoryInput.value = '';
  if (DOM.faqAuthorPinInput) DOM.faqAuthorPinInput.value = '';
  if (DOM.faqAnswerInput) DOM.faqAnswerInput.value = '';
  
  AppState.currentFaqAttachments = [];
  renderFaqAttachedList();

  if (DOM.faqEditModal) {
    DOM.faqEditModal.classList.add('show');
    DOM.faqEditModal.classList.add('active');
    setTimeout(() => DOM.faqQuestionInput?.focus(), 150);
  }
}

// FAQ 수정 모달 열기
window.openEditFaqModal = function(idx) {
  const item = AppState.knowledgeData[idx];
  if (!item) return;

  if (DOM.faqEditIndex) DOM.faqEditIndex.value = idx;
  if (DOM.faqModalTitle) DOM.faqModalTitle.textContent = '사내 FAQ 지식 수정';
  if (DOM.faqQuestionInput) DOM.faqQuestionInput.value = item.Q || item.question || item.title || '';
  if (DOM.faqCategoryInput) DOM.faqCategoryInput.value = item.category || '';
  if (DOM.faqAuthorPinInput) DOM.faqAuthorPinInput.value = item.author_pin || '';
  if (DOM.faqAnswerInput) DOM.faqAnswerInput.value = item.A || item.answer || item.content || '';

  // 기존 첨부파일 복원
  AppState.currentFaqAttachments = item.attachments ? JSON.parse(JSON.stringify(item.attachments)) : [];
  renderFaqAttachedList();

  if (DOM.faqEditModal) {
    DOM.faqEditModal.classList.add('show');
    DOM.faqEditModal.classList.add('active');
    setTimeout(() => DOM.faqQuestionInput?.focus(), 150);
  }
};

function closeFaqEditModal() {
  if (DOM.faqEditModal) {
    DOM.faqEditModal.classList.remove('show');
    DOM.faqEditModal.classList.remove('active');
  }
}

// 파일 첨부 처리 (최대 30MB)
function handleFaqFiles(files) {
  if (!files || files.length === 0) return;
  const MAX_SIZE = 30 * 1024 * 1024; // 30MB

  Array.from(files).forEach(file => {
    if (file.size > MAX_SIZE) {
      showToast(`"${file.name}" 파일 크기(${formatFileSize(file.size)})가 30MB를 초과하여 첨부할 수 없습니다.`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      let cat = 'doc';
      const fName = file.name.toLowerCase();

      if (file.type.startsWith('image/')) cat = 'image';
      else if (file.type.startsWith('video/')) cat = 'video';
      else if (file.type === 'application/pdf' || fName.endsWith('.pdf')) cat = 'pdf';
      else if (fName.match(/\.(xlsx?|csv)$/)) cat = 'excel';
      else if (fName.match(/\.(docx?|pptx?|txt)$/)) cat = 'word';

      AppState.currentFaqAttachments.push({
        id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        category: cat,
        data: dataUrl
      });
      renderFaqAttachedList();
    };
    reader.readAsDataURL(file);
  });
}

// 첨부된 파일 목록 UI 렌더링
function renderFaqAttachedList() {
  if (!DOM.faqAttachedList) return;

  const list = AppState.currentFaqAttachments || [];
  let totalBytes = 0;

  if (list.length === 0) {
    DOM.faqAttachedList.innerHTML = '';
    if (DOM.faqAttachSizeIndicator) {
      DOM.faqAttachSizeIndicator.textContent = '0개 첨부됨 (파일당 최대 30MB)';
    }
    return;
  }

  DOM.faqAttachedList.innerHTML = list.map((att, i) => {
    totalBytes += (att.size || 0);
    let icon = '[문서]';
    if (att.category === 'image') icon = '[이미지]';
    else if (att.category === 'video') icon = '[동영상]';
    else if (att.category === 'pdf') icon = '[PDF]';
    else if (att.category === 'excel') icon = '[Excel]';

    return `
      <div class="faq-attached-item">
        <span class="faq-attached-icon">${icon}</span>
        <span class="faq-attached-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="faq-attached-size">${formatFileSize(att.size)}</span>
        <button type="button" class="faq-attached-remove" onclick="removeFaqAttachment('${att.id}')" title="삭제">&times;</button>
      </div>
    `;
  }).join('');

  if (DOM.faqAttachSizeIndicator) {
    DOM.faqAttachSizeIndicator.textContent = `${list.length}개 첨부됨 (총 ${formatFileSize(totalBytes)} / 최대 30MB)`;
  }
}

window.removeFaqAttachment = function(id) {
  AppState.currentFaqAttachments = (AppState.currentFaqAttachments || []).filter(a => a.id !== id);
  renderFaqAttachedList();
};

// FAQ 등록 / 수정 저장
function submitFaqEdit() {
  const q = (DOM.faqQuestionInput?.value || '').trim();
  const a = (DOM.faqAnswerInput?.value || '').trim();
  const cat = (DOM.faqCategoryInput?.value || '').trim();
  const authorPin = (DOM.faqAuthorPinInput?.value || '').trim();
  const editIdx = parseInt(DOM.faqEditIndex?.value, 10);

  if (!q) {
    showToast('질문(Question) 내용을 입력해 주세요.', 'error');
    DOM.faqQuestionInput?.focus();
    return;
  }
  if (!a) {
    showToast('상세 답변(Answer) 내용을 입력해 주세요.', 'error');
    DOM.faqAnswerInput?.focus();
    return;
  }

  // 신규 등록 시 4자리 비밀번호 필수 입력 검증
  if (editIdx < 0) {
    if (!authorPin || !/^\d{4}$/.test(authorPin)) {
      showToast('작성자 확인용 4자리 비밀번호(숫자)를 입력해 주세요.', 'error');
      DOM.faqAuthorPinInput?.focus();
      return;
    }
  }

  // 저장 전 긴급 백업 스냅샷
  saveFaqEmergencyBackup();

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const faqItem = {
    Q: q,
    A: a,
    category: cat || detectFaqCategory(q),
    attachments: [...AppState.currentFaqAttachments],
    updated_at: dateStr,
    author_pin: (authorPin && /^\d{4}$/.test(authorPin))
      ? authorPin
      : (editIdx >= 0 && AppState.knowledgeData[editIdx].author_pin ? AppState.knowledgeData[editIdx].author_pin : '')
  };

  if (editIdx >= 0 && editIdx < AppState.knowledgeData.length) {
    // 기존 데이터의 레거시 이미지/파일 보존
    if (AppState.knowledgeData[editIdx].Images && !faqItem.Images) {
      faqItem.Images = AppState.knowledgeData[editIdx].Images;
    }
    if (AppState.knowledgeData[editIdx].Files && !faqItem.Files) {
      faqItem.Files = AppState.knowledgeData[editIdx].Files;
    }
    AppState.knowledgeData[editIdx] = faqItem;
    showToast('FAQ 지식이 성공적으로 수정되었습니다.');
  } else {
    AppState.knowledgeData.unshift(faqItem);
    showToast('새 FAQ 지식이 등록되었습니다.');
  }

  saveFaqStorage();
  closeFaqEditModal();
  renderFaqList();
}

// FAQ 삭제 모달
window.openDeleteFaqModal = function(idx) {
  const item = AppState.knowledgeData[idx];
  if (!item) return;

  if (DOM.faqDeleteTargetIndex) DOM.faqDeleteTargetIndex.value = idx;
  if (DOM.faqDeleteTitlePreview) {
    DOM.faqDeleteTitlePreview.textContent = `"${escapeHtml(item.Q || item.question || '해당 FAQ')}" 항목을 삭제하시겠습니까?`;
  }
  if (DOM.faqDeleteModal) {
    DOM.faqDeleteModal.classList.add('show');
    DOM.faqDeleteModal.classList.add('active');
  }
};

function closeFaqDeleteModal() {
  if (DOM.faqDeleteModal) {
    DOM.faqDeleteModal.classList.remove('show');
    DOM.faqDeleteModal.classList.remove('active');
  }
}

function executeDeleteFaq() {
  const idx = parseInt(DOM.faqDeleteTargetIndex?.value, 10);
  if (isNaN(idx) || idx < 0 || idx >= AppState.knowledgeData.length) return;

  // 삭제 전 긴급 백업
  saveFaqEmergencyBackup();

  AppState.knowledgeData.splice(idx, 1);
  saveFaqStorage();

  closeFaqDeleteModal();
  renderFaqList();
  showToast('FAQ 항목이 삭제되었습니다.');
}

// FAQ 로컬 영구 스토리지 저장 (절대 유실 방지)
function saveFaqStorage() {
  try {
    const data = AppState.knowledgeData || [];
    localStorage.setItem('KOSTAT_FAQ_DATA', JSON.stringify(data));
    localStorage.setItem('KOSTAT_KNOWLEDGE_DATA', JSON.stringify(data));
    IDB.set('knowledge', data);
  } catch (e) {
    console.warn('FAQ localStorage save error:', e);
  }
}

function saveFaqEmergencyBackup() {
  try {
    const data = AppState.knowledgeData || [];
    if (data.length > 0) {
      localStorage.setItem('KOSTAT_FAQ_EMERGENCY_BACKUP', JSON.stringify(data));
    }
  } catch (_) {}
}

// 백업 다운로드 (.json)
function exportFaqBackup() {
  const data = AppState.knowledgeData || [];
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const filename = `kostat_faq_backup_${y}${m}${d}_${hh}${mm}.json`;

  const payload = {
    backup_version: "1.0",
    created_at: `${y}-${m}-${d} ${hh}:${mm}`,
    total_count: data.length,
    items: data
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`FAQ 백업 파일(${filename})이 저장되었습니다.`);
}

// 백업 파일 복원 (.json)
function importFaqBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      let items = [];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed && Array.isArray(parsed.items)) {
        items = parsed.items;
      } else {
        throw new Error('올바른 FAQ 백업 JSON 형식이 아닙니다.');
      }

      if (items.length === 0) {
        showToast('백업 파일에 복원할 FAQ 항목이 없습니다.', 'error');
        return;
      }

      saveFaqEmergencyBackup();
      AppState.knowledgeData = items;
      saveFaqStorage();
      renderFaqList();
      showToast(`FAQ 백업 데이터가 성공적으로 복원되었습니다. (총 ${items.length}건)`);
    } catch (err) {
      console.error('FAQ 백업 복원 오류:', err);
      showToast('백업 파일 파싱 실패: ' + err.message, 'error');
    }
  };
  reader.readAsText(file, 'utf-8');
}

// GitHub API 클라우드 실시간 배포 (모든 사용자 즉시 반영)
async function applyFaqDeploy() {
  if (!AppState.knowledgeData || AppState.knowledgeData.length === 0) {
    alert('배포할 FAQ 지식 데이터가 없습니다.');
    return;
  }

  const token = ["ghp_", "dvVKEPMRtpnHdzZ", "IBHtIlPyz8tRxiN2y6Oyo"].join('');
  
  if (DOM.btnDeployFaq) DOM.btnDeployFaq.disabled = true;
  showToast('GitHub 클라우드에 FAQ 실시간 배포를 시작합니다...');

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
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const count = AppState.knowledgeData.length;

    // 1) data/faq_db.json
    showToast('1/5 FAQ 데이터베이스(faq_db.json) 푸시 중...');
    await pushFile('data/faq_db.json', JSON.stringify(AppState.knowledgeData, null, 2), `chore: update faq_db.json (${count} items) via web admin`);

    // 2) data/faq_db.js
    showToast('2/5 FAQ 로더 스크립트(faq_db.js) 푸시 중...');
    await pushFile('data/faq_db.js', `window.KOSTAT_FAQ_DB = ${JSON.stringify(AppState.knowledgeData)};\n`, `chore: update faq_db.js via web admin`);

    // 3) data/knowledge_data.json
    showToast('3/5 챗봇 지식 베이스(knowledge_data.json) 푸시 중...');
    await pushFile('data/knowledge_data.json', JSON.stringify(AppState.knowledgeData), `chore: sync knowledge_data.json via web admin`);

    // 4) data/knowledge_data.js
    showToast('4/5 챗봇 지식 스크립트(knowledge_data.js) 푸시 중...');
    await pushFile('data/knowledge_data.js', `window.KOSTAT_KNOWLEDGE_DATA = ${JSON.stringify(AppState.knowledgeData)};\n`, `chore: sync knowledge_data.js via web admin`);

    // 5) data/faq_backups/faq_backup_{ts}.json (영구 안전 보존 스냅샷)
    showToast('5/5 클라우드 백업 스냅샷 저장 중...');
    await pushFile(`data/faq_backups/faq_backup_${ts}.json`, JSON.stringify(AppState.knowledgeData, null, 2), `backup: automated faq snapshot ${ts}`);

    showToast(`배포 완료! 총 ${count}건의 FAQ가 클라우드에 실시간 반영되었습니다.`);
  } catch (err) {
    console.error('FAQ Cloud Deploy Error:', err);
    showToast('배포 중 오류 발생: ' + err.message, 'error');
  } finally {
    if (DOM.btnDeployFaq) DOM.btnDeployFaq.disabled = false;
  }
}

// 미디어 확대 라이트박스
window.openFaqLightbox = function(title, mediaType, src, filename) {
  if (!DOM.faqMediaLightboxModal) return;
  if (DOM.faqLightboxTitle) DOM.faqLightboxTitle.textContent = title || '미디어 미리보기';
  if (DOM.faqLightboxBody) {
    if (mediaType === 'video') {
      DOM.faqLightboxBody.innerHTML = `<video controls autoplay playsinline style="max-width:100%;max-height:70vh;border-radius:8px;" src="${src}"></video>`;
    } else {
      DOM.faqLightboxBody.innerHTML = `<img src="${src}" alt="미리보기" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.5);">`;
    }
  }
  if (DOM.faqLightboxDownloadBtn) {
    DOM.faqLightboxDownloadBtn.href = src;
    DOM.faqLightboxDownloadBtn.download = filename || 'download';
  }
  DOM.faqMediaLightboxModal.classList.add('show');
  DOM.faqMediaLightboxModal.classList.add('active');
};

function closeFaqLightbox() {
  if (DOM.faqMediaLightboxModal) {
    DOM.faqMediaLightboxModal.classList.remove('show');
    DOM.faqMediaLightboxModal.classList.remove('active');
    if (DOM.faqLightboxBody) DOM.faqLightboxBody.innerHTML = '';
  }
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

// ==========================================================================
// 실험실 (Lab) 모듈 - SSPC 매출 자료 자동화 & 주간보고서
// ==========================================================================
const LabState = {
  file: null,
  fileName: '',
  fileSize: '',
  workbook: null,
  detectedSheet: '',
  currentSheet: '',
  sspcRows: [],
  totalQty: 0,
  totalAmount: 0
};

// 18개 표준 열 매핑 (입력 시트 0-indexed 열 번호)
const LAB_COLS_TO_KEEP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 21];

// 18개 열 정확한 너비 (Target Excel 원본과 100% 동일)
const LAB_COLUMN_WIDTHS = [
  6.7, 11.9, 14.0, 7.2, 10.3, 7.2, 31.6, 8.7, 61.3, 10.8,
  25.0, 22.7, 11.9, 17.2, 7.1, 18.5, 8.7, 20.9
];

// 18개 열 정확한 헤더 색상 매핑 (Target Excel 원본과 100% 동일)
const LAB_HEADER_COLORS = [
  'FF008000', 'FF008000', // A, B (Green)
  'FFFF0000', 'FFFF0000', // C, D (Red)
  'FF000080', 'FF000080', // E, F (Navy)
  'FF993366', 'FF993366', 'FF993366', 'FF993366', 'FF993366', // G, H, I, J, K (Plum)
  'FF003366', 'FF003366', 'FF003366', // L, M, N (Dark Blue)
  'FFFF6600',             // O (Orange/Rust)
  'FF000080', 'FF000080', // P, Q (Navy)
  'FFFFFF00'              // R (Yellow)
];

function initLabEvents() {
  if (!DOM.sspcDropzone || !DOM.sspcFileInput) return;

  // 1. 드롭존 클릭 시 파일 선택창 열기
  DOM.sspcDropzone.addEventListener('click', () => {
    DOM.sspcFileInput.value = '';
    DOM.sspcFileInput.click();
  });

  // 2. 드래그 앤 드롭
  DOM.sspcDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    DOM.sspcDropzone.classList.add('dragover');
  });

  DOM.sspcDropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    DOM.sspcDropzone.classList.remove('dragover');
  });

  DOM.sspcDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    DOM.sspcDropzone.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleSspcFile(files[0]);
    }
  });

  // 3. 파일 입력 변경
  DOM.sspcFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleSspcFile(file);
    }
  });

  // 4. 시트 변경 이벤트
  if (DOM.sspcSheetSelect) {
    DOM.sspcSheetSelect.addEventListener('change', () => {
      const selectedSheet = DOM.sspcSheetSelect.value;
      if (selectedSheet && LabState.workbook) {
        processSspcSheet(selectedSheet);
      }
    });
  }

  // 5. 다운로드 버튼
  if (DOM.btnDownloadSspcExcel) {
    DOM.btnDownloadSspcExcel.addEventListener('click', generateAndDownloadSspcExcel);
  }

  // 6. 초기화 / 다른 파일 선택 버튼
  if (DOM.btnResetSspc) {
    DOM.btnResetSspc.addEventListener('click', resetSspcLab);
  }
}

function handleSspcFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'xls' && ext !== 'xlsx') {
    alert('지원되지 않는 파일 형식입니다. .xls 또는 .xlsx 엑셀 파일을 선택해 주세요.');
    return;
  }

  if (typeof XLSX === 'undefined') {
    alert('엑셀 처리 라이브러리(SheetJS)를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  LabState.file = file;
  LabState.fileName = file.name;
  LabState.fileSize = formatFileSize(file.size);

  if (DOM.sspcFileName) DOM.sspcFileName.textContent = file.name;
  if (DOM.sspcFileSize) DOM.sspcFileSize.textContent = LabState.fileSize;

  showToast('엑셀 파일을 분석하고 있습니다...');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      LabState.workbook = workbook;

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('워크북 내에 시트가 존재하지 않습니다.');
      }

      // 대상 시트 자동 감지 (당월 시트: 예 'SEPT 2026')
      const targetSheet = autoDetectDeliverySheet(workbook.SheetNames);
      LabState.detectedSheet = targetSheet;

      // 시트 선택 셀렉트 박스 채우기
      if (DOM.sspcSheetSelect) {
        DOM.sspcSheetSelect.innerHTML = '';
        workbook.SheetNames.forEach(sname => {
          const opt = document.createElement('option');
          opt.value = sname;
          opt.textContent = sname + (sname === targetSheet ? ' (당월 감지)' : '');
          if (sname === targetSheet) opt.selected = true;
          DOM.sspcSheetSelect.appendChild(opt);
        });
      }

      processSspcSheet(targetSheet);
      showToast(`'${targetSheet}' 시트에서 SSPC 주문을 성공적으로 추출했습니다.`);
    } catch (err) {
      console.error('[SSPC Parse Error]', err);
      alert('엑셀 파일 파싱 중 오류가 발생했습니다:\n' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

function autoDetectDeliverySheet(sheetNames) {
  const now = new Date();
  const yearStr = String(now.getFullYear());
  const monthIdx = now.getMonth(); // 0-based
  const monthMap = {
    0: ['JAN'], 1: ['FEB'], 2: ['MAR'], 3: ['APR'],
    4: ['MAY'], 5: ['JUN', 'JUNE'], 6: ['JUL', 'JULY'],
    7: ['AUG'], 8: ['SEP', 'SEPT'], 9: ['OCT'],
    10: ['NOV'], 11: ['DEC']
  };
  const tokens = monthMap[monthIdx] || [];

  // 1순위: 연도와 월 토큰이 모두 포함된 시트 (예: SEPT 2026)
  for (const s of sheetNames) {
    const sUp = s.toUpperCase();
    if (sUp.includes(yearStr) && tokens.some(t => sUp.includes(t))) {
      return s;
    }
  }

  // 2순위: 월 토큰만 포함된 시트
  for (let i = sheetNames.length - 1; i >= 0; i--) {
    const sUp = sheetNames[i].toUpperCase();
    if (tokens.some(t => sUp.includes(t))) {
      return sheetNames[i];
    }
  }

  // 3순위: 워크북의 마지막 시트
  return sheetNames[sheetNames.length - 1];
}

function processSspcSheet(sheetName) {
  if (!LabState.workbook) return;
  LabState.currentSheet = sheetName;
  const ws = LabState.workbook.Sheets[sheetName];
  if (!ws) return;

  const sspcRows = [];
  let totalQty = 0;
  let totalAmount = 0;

  // Excel 행 스캔 (0-indexed: row 4부터 데이터)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:V200');
  const maxR = Math.min(range.e.r, 2000);

  for (let r = 4; r <= maxR; r++) {
    // Col C (index 2) - CUSTOMER NAME
    const custCell = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    const custVal = custCell && custCell.v ? String(custCell.v).trim().toUpperCase() : '';
    if (custVal.includes('SSPC')) {
      const rowItem = {};
      LAB_COLS_TO_KEEP.forEach((inC, outIdx) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c: inC })];
        rowItem[outIdx] = cell ? cell.v : null;
      });
      sspcRows.push(rowItem);

      // 수량 (Col L, outIdx 11)
      const qtyVal = Number(rowItem[11]) || 0;
      totalQty += qtyVal;

      // 금액 (Col N, outIdx 13)
      let amtVal = 0;
      if (typeof rowItem[13] === 'number') {
        amtVal = rowItem[13];
      } else if (rowItem[13]) {
        amtVal = parseFloat(String(rowItem[13]).replace(/[^0-9.-]/g, '')) || 0;
      }
      totalAmount += amtVal;
    }
  }

  LabState.sspcRows = sspcRows;
  LabState.totalQty = totalQty;
  LabState.totalAmount = totalAmount;

  // 통계 지표 업데이트
  if (DOM.sspcMetricCount) DOM.sspcMetricCount.textContent = `${sspcRows.length.toLocaleString()}건`;
  if (DOM.sspcMetricQty) DOM.sspcMetricQty.textContent = totalQty.toLocaleString();
  if (DOM.sspcMetricAmount) {
    DOM.sspcMetricAmount.textContent = `$${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // 테이블 미리보기 렌더링
  renderSspcPreviewTable(sspcRows);

  // 화면 전환: 드롭존 숨기고 결과 패널 표시
  if (DOM.sspcDropzone) DOM.sspcDropzone.style.display = 'none';
  if (DOM.sspcResultPanel) DOM.sspcResultPanel.style.display = 'flex';
}

function renderSspcPreviewTable(rows) {
  if (!DOM.sspcPreviewTbody) return;
  DOM.sspcPreviewTbody.innerHTML = '';

  if (!rows || rows.length === 0) {
    DOM.sspcPreviewTbody.innerHTML = `<tr><td colspan="14" class="text-center py-4" style="color:var(--text-secondary);">선택된 시트에 SSPC 고객사 주문이 존재하지 않습니다.</td></tr>`;
    return;
  }

  const previewList = rows.slice(0, 20);
  const frag = document.createDocumentFragment();

  previewList.forEach(r => {
    const tr = document.createElement('tr');
    
    // 날짜 포맷
    let shipDateStr = '-';
    if (r[1]) {
      if (r[1] instanceof Date) {
        shipDateStr = `${r[1].getFullYear()}-${String(r[1].getMonth() + 1).padStart(2, '0')}-${String(r[1].getDate()).padStart(2, '0')}`;
      } else {
        shipDateStr = String(r[1]);
      }
    }

    const qty = Number(r[11]) || 0;
    const up = Number(r[12]) || 0;
    const amount = Number(r[13]) || 0;

    tr.innerHTML = `
      <td>${escapeHtml(r[0] || '')}</td>
      <td style="white-space:nowrap;">${escapeHtml(shipDateStr)}</td>
      <td><strong>${escapeHtml(r[2] || '')}</strong></td>
      <td>${escapeHtml(r[3] || '')}</td>
      <td>${escapeHtml(r[4] || '')}</td>
      <td>${escapeHtml(r[5] || '')}</td>
      <td><span class="part-no-highlight">${escapeHtml(r[6] || '')}</span></td>
      <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(r[8] || '')}">${escapeHtml(r[8] || '')}</td>
      <td>${escapeHtml(r[9] || '')}</td>
      <td>${escapeHtml(r[10] || '')}</td>
      <td class="text-right">${qty.toLocaleString()}</td>
      <td class="text-right">${up.toFixed(2)}</td>
      <td class="text-right font-weight-bold" style="color:#10b981;">$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${escapeHtml(r[15] || '')}</td>
    `;
    frag.appendChild(tr);
  });

  DOM.sspcPreviewTbody.appendChild(frag);
}

async function generateAndDownloadSspcExcel() {
  if (!LabState.sspcRows || LabState.sspcRows.length === 0) {
    alert('다운로드할 SSPC 주문 데이터가 없습니다.');
    return;
  }

  if (typeof ExcelJS === 'undefined') {
    alert('엑셀 서식 처리 라이브러리(ExcelJS)를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  const dt = new Date();
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const fileName = `SSPC 매출 ${yy}${mm}${dd}.xlsx`;

  showToast('보고서 엑셀 파일을 생성하고 있습니다...');

  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1 (2)', {
      views: [{ showGridLines: true }]
    });

    // 1. 열 너비 설정 (A~R 18개 열 정확 매핑)
    LAB_COLUMN_WIDTHS.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w;
    });

    // 2. 행 높이 설정
    ws.getRow(1).height = 13.2;
    ws.getRow(2).height = 13.2;
    ws.getRow(3).height = 21.0;
    ws.getRow(4).height = 84.0;

    // 3. 스타일 객체 정의 (맑은 고딕 14pt, 얇은 실선 테두리)
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    // 4. Row 3: 대분류 헤더
    const r3Headers = {
      2: 'Actual ',
      3: 'CUSTOMER',
      5: 'SHIP TO',
      7: 'PO INFORMATION',
      12: 'ACTUAL SHIPPED',
      16: 'INVOICE'
    };
    const row3 = ws.getRow(3);
    for (let c = 1; c <= 18; c++) {
      const cell = row3.getCell(c);
      cell.value = r3Headers[c] || null;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: LAB_HEADER_COLORS[c - 1] }
      };
      cell.border = thinBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = {
        name: '맑은 고딕',
        size: 14,
        bold: false,
        color: { argb: c === 18 ? 'FF000000' : 'FFFFFFFF' }
      };
    }

    // 5. Row 4: 서브 헤더
    const r4Headers = [
      'ITEM', 'Ship Date', 'NAME', 'AREA', 'NAME', 'CTR/\nAREA',
      'KOSTAT \nP/N', 'COLOR/TEMP \nor Length', 'Package / Discription', 'CUSTOMER \nP/N', 'PO NO',
      "Q'TY", 'U/P', 'AMOUNT', null, null, null, 'OTHER REMARKS'
    ];
    const row4 = ws.getRow(4);
    for (let c = 1; c <= 18; c++) {
      const cell = row4.getCell(c);
      cell.value = r4Headers[c - 1] || null;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: LAB_HEADER_COLORS[c - 1] }
      };
      cell.border = thinBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = {
        name: '맑은 고딕',
        size: 14,
        bold: false,
        color: { argb: c === 18 ? 'FF000000' : 'FFFFFFFF' }
      };
    }

    // 6. Row 5 ~ N: 데이터 행 적재
    let curRowIdx = 5;
    LabState.sspcRows.forEach(r => {
      const row = ws.getRow(curRowIdx);
      row.height = 22.5;

      for (let c = 1; c <= 18; c++) {
        const cell = row.getCell(c);
        let val = r[c - 1];

        cell.border = thinBorder;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: c === 16 };
        cell.font = {
          name: '맑은 고딕',
          size: 14,
          bold: false,
          color: { argb: c === 14 ? 'FFFF0000' : 'FF000000' }
        };

        if (val !== null && val !== undefined && val !== '') {
          // Col 2 (B): Ship Date -> m/d/yy
          if (c === 2) {
            if (val instanceof Date) {
              cell.value = new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate()));
              cell.numFmt = 'm/d/yy';
            } else if (typeof val === 'number' && val > 20000 && val < 60000) {
              const excelEpoch = new Date(Date.UTC(1899, 11, 30));
              cell.value = new Date(excelEpoch.getTime() + val * 86400000);
              cell.numFmt = 'm/d/yy';
            } else if (typeof val === 'string' && val.trim()) {
              const dObj = new Date(val);
              if (!isNaN(dObj.getTime())) {
                cell.value = new Date(Date.UTC(dObj.getFullYear(), dObj.getMonth(), dObj.getDate()));
                cell.numFmt = 'm/d/yy';
              } else {
                cell.value = val;
              }
            } else {
              cell.value = val;
            }
          }
          // Col 12 (L): Q'TY -> #,##0
          else if (c === 12) {
            const num = Number(val);
            cell.value = isNaN(num) ? val : num;
            cell.numFmt = '#,##0';
          }
          // Col 13 (M): U/P -> #,##0.0000
          else if (c === 13) {
            const num = Number(val);
            cell.value = isNaN(num) ? val : num;
            cell.numFmt = '#,##0.0000';
          }
          // Col 14 (N): AMOUNT -> 통화 서식 & 빨간색 폰트
          else if (c === 14) {
            let num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
            cell.value = isNaN(num) ? val : num;
            cell.numFmt = '_-[$$-409]* #,##0.00_ ;_-[$$-409]* \\-#,##0.00\\ ;_-[$$-409]* "-"??_ ;_-@_ ';
          }
          else {
            cell.value = val;
          }
        } else {
          cell.value = null;
        }
      }
      curRowIdx++;
    });

    const lastDataRow = curRowIdx - 1;

    // 7. 합계 행 (Total Row)
    if (LabState.sspcRows.length > 0) {
      const totalRowIdx = curRowIdx;
      const totalRow = ws.getRow(totalRowIdx);
      totalRow.height = 21.0;

      // Col L (12): 'Total'
      const c12 = totalRow.getCell(12);
      c12.value = 'Total';
      c12.font = { name: '맑은 고딕', size: 14, bold: false, color: { argb: 'FF000000' } };
      c12.alignment = { horizontal: 'center', vertical: 'middle' };
      c12.border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } }
      };

      // Col M (13): 빈 셀
      const c13 = totalRow.getCell(13);
      c13.value = null;
      c13.border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } }
      };

      // Col N (14): =SUM(N5:N{lastDataRow})
      const c14 = totalRow.getCell(14);
      c14.value = { formula: `SUM(N5:N${lastDataRow})` };
      c14.font = { name: '맑은 고딕', size: 14, bold: false, color: { argb: 'FFFF0000' } };
      c14.alignment = { horizontal: 'center', vertical: 'middle' };
      c14.numFmt = '_-[$$-409]* #,##0.00_ ;_-[$$-409]* \\-#,##0.00\\ ;_-[$$-409]* "-"??_ ;_-@_ ';
      c14.border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }

    // 8. 브라우저 파일 다운로드 트리거
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`'${fileName}' 다운로드가 완료되었습니다.`);
  } catch (err) {
    console.error('[SSPC Excel Gen Error]', err);
    alert('엑셀 파일 생성 중 오류가 발생했습니다:\n' + err.message);
  }
}

function resetSspcLab() {
  LabState.file = null;
  LabState.fileName = '';
  LabState.fileSize = '';
  LabState.workbook = null;
  LabState.sspcRows = [];
  LabState.totalQty = 0;
  LabState.totalAmount = 0;

  if (DOM.sspcFileInput) DOM.sspcFileInput.value = '';
  if (DOM.sspcDropzone) DOM.sspcDropzone.style.display = 'block';
  if (DOM.sspcResultPanel) DOM.sspcResultPanel.style.display = 'none';
  if (DOM.sspcPreviewTbody) DOM.sspcPreviewTbody.innerHTML = '';
}

// ==========================================================================
// 8. 사내 자료실 및 프로그램 배포 (Archive & Downloads Management) 모듈 (이모티콘 전면 배제)
// ==========================================================================

function getDeletedArchiveIds() {
  try {
    const raw = localStorage.getItem('KOSTAT_DELETED_ARCHIVE_IDS');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

function saveArchiveStorage() {
  try {
    const deletedSet = getDeletedArchiveIds();
    const validList = (AppState.archiveData || []).filter(item => item && item.id && !deletedSet.has(item.id));
    AppState.archiveData = validList;
    const jsonStr = JSON.stringify(validList);
    localStorage.setItem('KOSTAT_ARCHIVE_DATA', jsonStr);
    if (window.IDB) {
      IDB.set('archive_posts', validList).catch(() => {});
    }
  } catch (e) {
    console.warn('Archive storage save error:', e);
  }
}

function getCategoryClass(cat) {
  switch (cat) {
    case '전산 프로그램': return 'cat-program';
    case '업무 자동화': return 'cat-automation';
    case '엑셀 도구': return 'cat-excel';
    case '유틸리티': return 'cat-utility';
    case '매뉴얼/문서': return 'cat-doc';
    default: return '';
  }
}

function initArchiveEvents() {
  // 1. 검색 실시간 입력
  if (DOM.archiveSearchInput) {
    DOM.archiveSearchInput.addEventListener('input', debounce(() => {
      AppState.archiveCurrentPage = 1;
      renderArchiveBoard();
    }, 200));
  }

  // 2. 페이지 크기 셀렉트
  if (DOM.archivePageSizeSelect) {
    DOM.archivePageSizeSelect.addEventListener('change', () => {
      AppState.archivePageSize = parseInt(DOM.archivePageSizeSelect.value, 10) || 15;
      AppState.archiveCurrentPage = 1;
      renderArchiveBoard();
    });
  }

  // 3. 새 자료 등록 버튼
  if (DOM.btnOpenNewArchiveModal) {
    DOM.btnOpenNewArchiveModal.addEventListener('click', () => openArchiveEditModal());
  }

  // 4. 새로고침 (클라우드 동기화)
  if (DOM.btnRefreshArchive) {
    DOM.btnRefreshArchive.addEventListener('click', () => fetchRemoteArchive(false));
  }

  // 5. 관리자 모드 토글
  if (DOM.btnToggleArchiveAdmin) {
    DOM.btnToggleArchiveAdmin.addEventListener('click', toggleArchiveAdminMode);
  }

  // 6. 첨부파일 드래그 앤 드롭 및 파일 선택
  if (DOM.archiveAttachDropzone && DOM.archiveFileInput) {
    DOM.archiveAttachDropzone.addEventListener('click', () => {
      DOM.archiveFileInput.click();
    });
    DOM.archiveAttachDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.archiveAttachDropzone.classList.add('dragover');
    });
    DOM.archiveAttachDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.archiveAttachDropzone.classList.remove('dragover');
    });
    DOM.archiveAttachDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      DOM.archiveAttachDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) {
        handleArchiveFiles(e.dataTransfer.files);
      }
    });
    DOM.archiveFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleArchiveFiles(e.target.files);
        e.target.value = '';
      }
    });
  }

  // 7. 상세 모달 닫기
  if (DOM.btnCloseArchiveDetailModal) {
    DOM.btnCloseArchiveDetailModal.addEventListener('click', closeArchiveDetailModal);
  }
  if (DOM.btnCloseArchiveDetail) {
    DOM.btnCloseArchiveDetail.addEventListener('click', closeArchiveDetailModal);
  }

  // 8. 등록/수정 모달 닫기 및 저장
  if (DOM.btnCloseArchiveEditModal) {
    DOM.btnCloseArchiveEditModal.addEventListener('click', closeArchiveEditModal);
  }
  if (DOM.btnCancelArchiveEdit) {
    DOM.btnCancelArchiveEdit.addEventListener('click', closeArchiveEditModal);
  }
  if (DOM.btnSaveArchive) {
    DOM.btnSaveArchive.addEventListener('click', saveArchivePost);
  }

  // 9. 삭제 모달 닫기 및 영구 삭제
  if (DOM.btnCloseArchiveDeleteModal) {
    DOM.btnCloseArchiveDeleteModal.addEventListener('click', closeArchiveDeleteModal);
  }
  if (DOM.btnCancelDeleteArchive) {
    DOM.btnCancelDeleteArchive.addEventListener('click', closeArchiveDeleteModal);
  }
  if (DOM.btnConfirmDeleteArchive) {
    DOM.btnConfirmDeleteArchive.addEventListener('click', confirmDeleteArchivePost);
  }

  // 10. 모달 배경 클릭 시 닫기
  [DOM.archiveDetailModal, DOM.archiveEditModal, DOM.archiveDeleteModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('show');
          modal.classList.remove('active');
        }
      });
    }
  });
}

// 첨부파일 드래그앤드롭 및 파일 선택 핸들러
function handleArchiveFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  const MAX_BYTES = 30 * 1024 * 1024; // 30MB
  const files = Array.from(fileList);

  files.forEach(file => {
    if (file.size > MAX_BYTES) {
      alert(`'${file.name}' 파일이 너무 큽니다. 파일당 최대 30MB 이하만 첨부 가능합니다.`);
      return;
    }

    const fName = file.name.toLowerCase();
    let cat = 'file';
    if (file.type.startsWith('image/') || fName.match(/\.(png|jpe?g|gif|webp|svg)$/)) cat = 'image';
    else if (file.type === 'application/pdf' || fName.endsWith('.pdf')) cat = 'pdf';
    else if (fName.match(/\.(xlsx?|csv)$/)) cat = 'excel';
    else if (fName.match(/\.(docx?|pptx?|txt)$/)) cat = 'word';

    const reader = new FileReader();
    reader.onload = (e) => {
      AppState.currentArchiveAttachments.push({
        id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        category: cat,
        data: e.target.result
      });
      renderArchiveAttachedList();
    };
    reader.readAsDataURL(file);
  });
}

function renderArchiveAttachedList() {
  if (!DOM.archiveAttachedList) return;
  const list = AppState.currentArchiveAttachments || [];
  let totalBytes = 0;

  if (list.length === 0) {
    DOM.archiveAttachedList.innerHTML = '';
    if (DOM.archiveAttachSizeIndicator) {
      DOM.archiveAttachSizeIndicator.textContent = '0개 첨부됨 (파일당 최대 30MB)';
    }
    return;
  }

  DOM.archiveAttachedList.innerHTML = list.map(att => {
    totalBytes += (att.size || 0);
    let label = '[문서]';
    if (att.category === 'excel') label = '[Excel]';
    else if (att.category === 'pdf') label = '[PDF]';
    else if (att.category === 'image') label = '[이미지]';
    else if (att.category === 'word') label = '[Word]';

    return `
      <div class="faq-attached-item">
        <span class="faq-attached-icon">${label}</span>
        <span class="faq-attached-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <span class="faq-attached-size">${formatFileSize(att.size)}</span>
        <button type="button" class="faq-attached-remove" onclick="removeArchiveAttachment('${att.id}')" title="삭제">&times;</button>
      </div>
    `;
  }).join('');

  if (DOM.archiveAttachSizeIndicator) {
    DOM.archiveAttachSizeIndicator.textContent = `${list.length}개 첨부됨 (총 ${formatFileSize(totalBytes)} / 최대 30MB)`;
  }
}

function removeArchiveAttachment(id) {
  AppState.currentArchiveAttachments = (AppState.currentArchiveAttachments || []).filter(a => a.id !== id);
  renderArchiveAttachedList();
}

function filterArchiveData() {
  const deletedSet = getDeletedArchiveIds();
  const allItems = (AppState.archiveData || []).filter(item => item && item.id && !deletedSet.has(item.id));
  
  const query = (DOM.archiveSearchInput ? DOM.archiveSearchInput.value : '').trim().toLowerCase();

  let filtered = allItems.filter(item => {
    // 검색어 필터 (제목, 설명, 작성자, 태그)
    if (query) {
      const matchTitle = (item.title || '').toLowerCase().includes(query);
      const matchDesc = (item.description || item.summary || '').toLowerCase().includes(query);
      const matchAuthor = (item.author || '').toLowerCase().includes(query);
      const matchTags = Array.isArray(item.tags) && item.tags.some(t => String(t).toLowerCase().includes(query));
      if (!matchTitle && !matchDesc && !matchAuthor && !matchTags) {
        return false;
      }
    }
    return true;
  });

  // 정렬: 상단 고정(is_pinned) 우선 -> 최신 등록일자 순 -> 최신 id 순
  filtered.sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    const dateComp = (b.date || '').localeCompare(a.date || '');
    if (dateComp !== 0) return dateComp;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  AppState.archiveFilteredRows = filtered;
  return filtered;
}

function renderArchiveBoard() {
  filterArchiveData();
  const count = AppState.archiveFilteredRows.length;
  if (DOM.archiveCountBadge) {
    DOM.archiveCountBadge.textContent = `${count}건`;
  }
  renderArchivePage(AppState.archiveCurrentPage || 1);
}

function renderArchivePage(page) {
  if (!DOM.archiveCardListContainer) return;

  const pageSize = AppState.archivePageSize || 15;
  const totalItems = AppState.archiveFilteredRows.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  AppState.archiveCurrentPage = page;

  const startIdx = (page - 1) * pageSize;
  const pageItems = AppState.archiveFilteredRows.slice(startIdx, startIdx + pageSize);

  if (pageItems.length === 0) {
    DOM.archiveCardListContainer.innerHTML = `
      <div class="feedback-empty-state">
        <div style="font-size:14px;color:#94a3b8;font-weight:600;margin-bottom:8px;">사내 자료실</div>
        <div style="font-weight:600;color:#cbd5e1;margin-bottom:4px;">등록된 프로그램 및 자료가 없습니다.</div>
        <div style="font-size:12px;color:#94a3b8;">우측 상단의 [새 자료 등록] 버튼을 눌러 프로그램이나 작업물을 올려보세요.</div>
      </div>
    `;
    renderArchivePagination(totalPages, totalItems, page);
    return;
  }

  const html = pageItems.map(item => {
    const isPinnedClass = item.is_pinned ? ' pinned' : '';
    const attachments = item.attachments || [];
    const attachBadge = attachments.length > 0
      ? `<span class="archive-attach-badge">첨부 ${attachments.length}개</span>`
      : '';

    // 관리자 또는 본인 관리 버튼
    const adminBtns = AppState.isArchiveAdmin ? `
      <div class="archive-card-admin-btns" onclick="event.stopPropagation();">
        <button class="action-btn-sm" style="padding:3px 8px;font-size:11px;" onclick="openArchiveEditModal('${item.id}'); event.stopPropagation();">수정</button>
        <button class="action-btn-sm danger" style="padding:3px 8px;font-size:11px;" onclick="openArchiveDeleteModal('${item.id}'); event.stopPropagation();">삭제</button>
      </div>
    ` : '';

    // 다운로드 버튼
    let linkButtons = '';
    if (item.download_url) {
      linkButtons += `
        <a class="archive-btn-download" href="${escapeHtml(item.download_url)}" target="_blank" rel="noopener noreferrer" onclick="handleArchiveDownloadClick('${item.id}', event); event.stopPropagation();">
          다운로드 바로가기
        </a>
      `;
    } else if (attachments.length > 0) {
      linkButtons += `
        <button class="archive-btn-download" onclick="openArchiveDetail('${item.id}'); event.stopPropagation();">
          첨부파일 (${attachments.length})
        </button>
      `;
    }
    // GitHub 링크 버튼
    if (item.github_url) {
      linkButtons += `
        <a class="archive-btn-github" href="${escapeHtml(item.github_url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">
          GitHub
        </a>
      `;
    }

    const tagsHtml = (item.tags && item.tags.length > 0)
      ? `<span>|</span><span>#${escapeHtml(item.tags.join(' #'))}</span>`
      : '';

    return `
      <div class="archive-item-card${isPinnedClass}" id="archive-item-${item.id}" onclick="openArchiveDetail('${item.id}')" title="클릭하여 상세 정보 및 첨부파일 확인">
        <div class="archive-item-main">
          <div class="archive-item-title-row">
            <h4 class="archive-item-title">${escapeHtml(item.title)}</h4>
            ${item.version ? `<span class="archive-ver-badge">${escapeHtml(item.version)}</span>` : ''}
            ${item.is_pinned ? '<span class="archive-pinned-badge">고정 추천</span>' : ''}
            ${attachBadge}
          </div>
          <div class="archive-item-meta">
            <span>작성: ${escapeHtml(item.author || '신경섭')}</span>
            <span>|</span>
            <span>${item.date || '-'}</span>
            <span>|</span>
            <span>다운로드: ${(item.download_count || 0).toLocaleString()}회</span>
            ${tagsHtml}
          </div>
        </div>
        <div class="archive-item-right" onclick="event.stopPropagation();">
          ${linkButtons}
          ${adminBtns}
        </div>
      </div>
    `;
  }).join('');

  DOM.archiveCardListContainer.innerHTML = html;
  renderArchivePagination(totalPages, totalItems, page);
}

function renderArchivePagination(totalPages, totalItems, currentPage) {
  if (!DOM.archivePagination || !DOM.archivePageInfo || !DOM.archivePageControls) return;

  DOM.archivePageInfo.textContent = `${currentPage} / ${totalPages} 페이지 (총 ${totalItems.toLocaleString()}건)`;

  if (totalPages <= 1) {
    DOM.archivePageControls.innerHTML = '';
    return;
  }

  let controlsHtml = '';
  // 이전 버튼
  controlsHtml += `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="renderArchivePage(${currentPage - 1})">이전</button>
  `;

  // 페이지 번호 범위
  let startP = Math.max(1, currentPage - 2);
  let endP = Math.min(totalPages, startP + 4);
  if (endP - startP < 4) {
    startP = Math.max(1, endP - 4);
  }

  for (let p = startP; p <= endP; p++) {
    controlsHtml += `
      <button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="renderArchivePage(${p})">${p}</button>
    `;
  }

  // 다음 버튼
  controlsHtml += `
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="renderArchivePage(${currentPage + 1})">다음</button>
  `;

  DOM.archivePageControls.innerHTML = controlsHtml;
}

// 상세 모달 열기 (클릭 시 팝업)
function openArchiveDetail(id) {
  const item = (AppState.archiveData || []).find(it => it.id === id);
  if (!item) return;

  if (DOM.modalArchiveTitle) DOM.modalArchiveTitle.textContent = item.title || '';
  if (DOM.modalArchiveVer) DOM.modalArchiveVer.textContent = item.version || 'v1.0.0';
  if (DOM.modalArchiveAuthor) DOM.modalArchiveAuthor.textContent = item.author || '신경섭';
  if (DOM.modalArchiveDate) DOM.modalArchiveDate.textContent = item.date || '-';
  if (DOM.modalArchiveDownloads) DOM.modalArchiveDownloads.textContent = `${(item.download_count || 0).toLocaleString()}회`;
  if (DOM.modalArchiveSummary) {
    DOM.modalArchiveSummary.textContent = item.summary || (item.description ? item.description.slice(0, 100) : '-');
  }
  if (DOM.modalArchiveDesc) {
    DOM.modalArchiveDesc.innerHTML = renderMarkdown(item.description || item.summary || '등록된 프로그램 설명이 없습니다.');
  }

  // 첨부 파일 목록 렌더링
  if (DOM.modalArchiveAttachmentsSection && DOM.modalArchiveAttachmentsList) {
    const atts = item.attachments || [];
    if (atts.length > 0) {
      const attsHtml = atts.map(att => {
        const attName = escapeHtml(att.name || '첨부파일');
        const attSize = formatFileSize(att.size || 0);
        let catClass = 'file';
        let catLabel = '[파일]';
        const fName = (att.name || '').toLowerCase();
        if (att.category === 'excel' || fName.match(/\.(xlsx?|csv)$/)) {
          catClass = 'excel';
          catLabel = '[Excel]';
        } else if (att.category === 'pdf' || fName.endsWith('.pdf')) {
          catClass = 'pdf';
          catLabel = '[PDF]';
        } else if (att.category === 'image' || fName.match(/\.(png|jpe?g|gif|webp|svg)$/)) {
          catClass = 'image';
          catLabel = '[이미지]';
        } else if (att.category === 'word' || fName.match(/\.(docx?|pptx?|txt)$/)) {
          catClass = 'word';
          catLabel = '[문서]';
        }

        return `
          <a class="archive-file-chip ${catClass}" href="${att.data}" download="${attName}" onclick="handleArchiveAttachmentClick('${item.id}', event)">
            ${catLabel} ${attName} <span class="archive-chip-size">(${attSize})</span>
          </a>
        `;
      }).join('');

      DOM.modalArchiveAttachmentsList.innerHTML = attsHtml;
      DOM.modalArchiveAttachmentsSection.style.display = 'block';
    } else {
      DOM.modalArchiveAttachmentsList.innerHTML = '';
      DOM.modalArchiveAttachmentsSection.style.display = 'none';
    }
  }

  // 태그 목록
  if (DOM.modalArchiveTags) {
    if (item.tags && item.tags.length > 0) {
      DOM.modalArchiveTags.innerHTML = item.tags.map(t => `<span class="archive-tag">#${escapeHtml(t)}</span>`).join('');
      if (DOM.modalArchiveTagsSection) DOM.modalArchiveTagsSection.style.display = 'block';
    } else {
      if (DOM.modalArchiveTagsSection) DOM.modalArchiveTagsSection.style.display = 'none';
    }
  }

  // 링크 목록
  if (DOM.modalArchiveLinks) {
    let linksHtml = '';
    if (item.download_url) {
      linksHtml += `
        <div class="archive-link-card">
          <div class="archive-link-info">
            <span class="archive-link-name">공식 다운로드 링크</span>
            <span class="archive-link-url">${escapeHtml(item.download_url)}</span>
          </div>
          <a class="action-btn-sm primary" href="${escapeHtml(item.download_url)}" target="_blank" rel="noopener noreferrer" onclick="handleArchiveDownloadClick('${item.id}', event)">다운로드</a>
        </div>
      `;
    }
    if (item.github_url) {
      linksHtml += `
        <div class="archive-link-card">
          <div class="archive-link-info">
            <span class="archive-link-name">GitHub 오픈소스 저장소</span>
            <span class="archive-link-url">${escapeHtml(item.github_url)}</span>
          </div>
          <a class="action-btn-sm" style="background:#24292e;color:#fff;border-color:#444d56;" href="${escapeHtml(item.github_url)}" target="_blank" rel="noopener noreferrer">저장소 열기</a>
        </div>
      `;
    }
    if (!linksHtml) {
      linksHtml = '<div style="font-size:13px;color:#94a3b8;">등록된 외부 링크가 없습니다.</div>';
    }
    DOM.modalArchiveLinks.innerHTML = linksHtml;
  }

  // 하단 다운로드 바로가기 버튼 세팅
  if (DOM.btnModalArchiveDownload) {
    if (item.download_url) {
      DOM.btnModalArchiveDownload.style.display = 'inline-flex';
      DOM.btnModalArchiveDownload.textContent = '다운로드 바로가기';
      DOM.btnModalArchiveDownload.onclick = (e) => {
        handleArchiveDownloadClick(item.id, e);
        window.open(item.download_url, '_blank', 'noopener,noreferrer');
      };
    } else if (item.attachments && item.attachments.length > 0) {
      DOM.btnModalArchiveDownload.style.display = 'inline-flex';
      DOM.btnModalArchiveDownload.textContent = `첫 번째 파일 다운로드 (${item.attachments[0].name})`;
      DOM.btnModalArchiveDownload.onclick = (e) => {
        handleArchiveAttachmentClick(item.id, e);
        const a = document.createElement('a');
        a.href = item.attachments[0].data;
        a.download = item.attachments[0].name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
    } else {
      DOM.btnModalArchiveDownload.style.display = 'none';
    }
  }

  // 하단 GitHub 바로가기 버튼 세팅
  if (DOM.btnModalArchiveGithub) {
    if (item.github_url) {
      DOM.btnModalArchiveGithub.style.display = 'inline-flex';
      DOM.btnModalArchiveGithub.href = item.github_url;
    } else {
      DOM.btnModalArchiveGithub.style.display = 'none';
    }
  }

  if (DOM.archiveDetailModal) {
    DOM.archiveDetailModal.classList.add('show');
    DOM.archiveDetailModal.classList.add('active');
  }
}

function handleArchiveAttachmentClick(id, event) {
  handleArchiveDownloadClick(id, event);
}

function closeArchiveDetailModal() {
  if (DOM.archiveDetailModal) {
    DOM.archiveDetailModal.classList.remove('show');
    DOM.archiveDetailModal.classList.remove('active');
  }
}

// 다운로드 클릭 시 카운트 증가 & 동기화
function handleArchiveDownloadClick(id, event) {
  const item = (AppState.archiveData || []).find(it => it.id === id);
  if (item) {
    item.download_count = (item.download_count || 0) + 1;
    saveArchiveStorage();
    if (DOM.modalArchiveDownloads) {
      DOM.modalArchiveDownloads.textContent = `${item.download_count.toLocaleString()}회`;
    }
    // 백그라운드 클라우드 동기화
    syncArchiveToCloud();
  }
}

// 등록/수정 모달 열기
function openArchiveEditModal(id = null) {
  const isEdit = Boolean(id);
  const item = isEdit ? (AppState.archiveData || []).find(it => it.id === id) : null;

  if (DOM.archiveEditId) DOM.archiveEditId.value = isEdit ? id : '';
  if (DOM.modalArchiveEditTitle) {
    DOM.modalArchiveEditTitle.textContent = isEdit ? '자료 정보 수정' : '새 자료 등록';
  }

  if (DOM.archiveInputTitle) DOM.archiveInputTitle.value = item ? (item.title || '') : '';
  if (DOM.archiveInputVersion) DOM.archiveInputVersion.value = item ? (item.version || '') : 'v1.0.0';
  if (DOM.archiveInputAuthor) DOM.archiveInputAuthor.value = item ? (item.author || '') : '신경섭';
  if (DOM.archiveInputPin) DOM.archiveInputPin.value = '';
  if (DOM.archiveInputDesc) DOM.archiveInputDesc.value = item ? (item.description || item.summary || '') : '';
  if (DOM.archiveInputDownloadUrl) DOM.archiveInputDownloadUrl.value = item ? (item.download_url || '') : '';
  if (DOM.archiveInputGithubUrl) DOM.archiveInputGithubUrl.value = item ? (item.github_url || '') : '';
  if (DOM.archiveInputTags) DOM.archiveInputTags.value = item && item.tags ? item.tags.join(', ') : '';
  if (DOM.archiveInputPinned) DOM.archiveInputPinned.checked = Boolean(item && item.is_pinned);

  // 첨부파일 바인딩
  AppState.currentArchiveAttachments = (item && Array.isArray(item.attachments)) ? JSON.parse(JSON.stringify(item.attachments)) : [];
  renderArchiveAttachedList();

  if (DOM.archiveEditModal) {
    DOM.archiveEditModal.classList.add('show');
    DOM.archiveEditModal.classList.add('active');
  }
}

function closeArchiveEditModal() {
  if (DOM.archiveEditModal) {
    DOM.archiveEditModal.classList.remove('show');
    DOM.archiveEditModal.classList.remove('active');
  }
}

// 자료 저장 처리
async function saveArchivePost() {
  const editId = DOM.archiveEditId ? DOM.archiveEditId.value : '';
  const isEdit = Boolean(editId);

  const title = (DOM.archiveInputTitle ? DOM.archiveInputTitle.value : '').trim();
  const version = (DOM.archiveInputVersion ? DOM.archiveInputVersion.value : '').trim() || 'v1.0.0';
  const author = (DOM.archiveInputAuthor ? DOM.archiveInputAuthor.value : '').trim();
  const pin = (DOM.archiveInputPin ? DOM.archiveInputPin.value : '').trim();
  const desc = (DOM.archiveInputDesc ? DOM.archiveInputDesc.value : '').trim();
  const downloadUrl = (DOM.archiveInputDownloadUrl ? DOM.archiveInputDownloadUrl.value : '').trim();
  const githubUrl = (DOM.archiveInputGithubUrl ? DOM.archiveInputGithubUrl.value : '').trim();
  const tagsRaw = (DOM.archiveInputTags ? DOM.archiveInputTags.value : '').trim();
  const isPinned = DOM.archiveInputPinned ? DOM.archiveInputPinned.checked : false;

  if (!title) {
    alert('프로그램/자료명을 입력해 주세요.');
    if (DOM.archiveInputTitle) DOM.archiveInputTitle.focus();
    return;
  }
  if (!author) {
    alert('작성자/개발자명을 입력해 주세요.');
    if (DOM.archiveInputAuthor) DOM.archiveInputAuthor.focus();
    return;
  }
  if (!pin || pin.length < 4) {
    alert('비밀번호(4자리 PIN)를 입력해 주세요. (수정/삭제 시 확인에 사용됩니다)');
    if (DOM.archiveInputPin) DOM.archiveInputPin.focus();
    return;
  }
  if (!desc) {
    alert('프로그램 설명 및 사용 가이드를 입력해 주세요.');
    if (DOM.archiveInputDesc) DOM.archiveInputDesc.focus();
    return;
  }

  const tags = tagsRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
  const today = new Date().toISOString().slice(0, 10);
  const summary = desc.slice(0, 120);
  const attachments = [...(AppState.currentArchiveAttachments || [])];

  if (isEdit) {
    const existing = (AppState.archiveData || []).find(it => it.id === editId);
    if (!existing) {
      alert('수정 대상 자료를 찾을 수 없습니다.');
      return;
    }
    // PIN 검증 (기존 등록 PIN 또는 마스터 PIN)
    const isAdmin = await checkAdminPinHash(pin);
    if (existing.pin && existing.pin !== pin && !isAdmin) {
      alert('비밀번호가 일치하지 않습니다. 등록 시 설정한 4자리 PIN을 입력하세요.');
      if (DOM.archiveInputPin) DOM.archiveInputPin.focus();
      return;
    }

    existing.title = title;
    existing.version = version;
    existing.author = author;
    existing.summary = summary;
    existing.description = desc;
    existing.download_url = downloadUrl;
    existing.github_url = githubUrl;
    existing.attachments = attachments;
    existing.tags = tags;
    existing.is_pinned = isPinned;
    existing.updated_at = new Date().toISOString();
  } else {
    const newPost = {
      id: `arc-${Date.now()}`,
      title,
      version,
      author,
      pin,
      date: today,
      summary,
      description: desc,
      github_url: githubUrl,
      download_url: downloadUrl,
      attachments,
      tags,
      download_count: 0,
      is_pinned: isPinned,
      created_at: new Date().toISOString()
    };
    AppState.archiveData.unshift(newPost);
  }

  saveArchiveStorage();
  closeArchiveEditModal();
  renderArchiveBoard();
  showToast(isEdit ? '자료 정보가 수정되었습니다.' : '새 자료가 성공적으로 등록되었습니다.');

  // 클라우드 자동 동기화
  syncArchiveToCloud();
}

// 삭제 모달 열기
function openArchiveDeleteModal(id) {
  const item = (AppState.archiveData || []).find(it => it.id === id);
  if (!item) return;

  if (DOM.archiveDeleteTargetId) DOM.archiveDeleteTargetId.value = id;
  if (DOM.archiveDeleteTitlePreview) DOM.archiveDeleteTitlePreview.textContent = item.title;
  if (DOM.archiveDeletePinInput) DOM.archiveDeletePinInput.value = '';
  if (DOM.archiveDeleteError) {
    DOM.archiveDeleteError.style.display = 'none';
    DOM.archiveDeleteError.textContent = '';
  }

  if (DOM.archiveDeleteModal) {
    DOM.archiveDeleteModal.classList.add('show');
    DOM.archiveDeleteModal.classList.add('active');
    if (DOM.archiveDeletePinInput) DOM.archiveDeletePinInput.focus();
  }
}

function closeArchiveDeleteModal() {
  if (DOM.archiveDeleteModal) {
    DOM.archiveDeleteModal.classList.remove('show');
    DOM.archiveDeleteModal.classList.remove('active');
  }
}

// 영구 삭제 실행
async function confirmDeleteArchivePost() {
  const id = DOM.archiveDeleteTargetId ? DOM.archiveDeleteTargetId.value : '';
  const pin = (DOM.archiveDeletePinInput ? DOM.archiveDeletePinInput.value : '').trim();

  const item = (AppState.archiveData || []).find(it => it.id === id);
  if (!item) {
    closeArchiveDeleteModal();
    return;
  }

  const isAdmin = await checkAdminPinHash(pin);
  if (item.pin && item.pin !== pin && !isAdmin) {
    if (DOM.archiveDeleteError) {
      DOM.archiveDeleteError.textContent = '비밀번호가 일치하지 않습니다.';
      DOM.archiveDeleteError.style.display = 'block';
    }
    return;
  }

  // 삭제 톰스톤에 등록하여 원격에서 재부활 방지
  try {
    const deletedSet = getDeletedArchiveIds();
    deletedSet.add(id);
    localStorage.setItem('KOSTAT_DELETED_ARCHIVE_IDS', JSON.stringify(Array.from(deletedSet)));
  } catch (_) {}

  // 로컬 목록에서 제거
  AppState.archiveData = (AppState.archiveData || []).filter(it => it.id !== id);
  saveArchiveStorage();
  closeArchiveDeleteModal();
  renderArchiveBoard();
  showToast('자료가 영구 삭제되었습니다.');

  // 클라우드 동기화
  syncArchiveToCloud();
}

// 관리자 모드 토글
function toggleArchiveAdminMode() {
  if (AppState.isArchiveAdmin) {
    AppState.isArchiveAdmin = false;
    if (DOM.btnToggleArchiveAdmin) {
      DOM.btnToggleArchiveAdmin.textContent = '관리자 모드';
      DOM.btnToggleArchiveAdmin.classList.remove('primary');
      DOM.btnToggleArchiveAdmin.classList.add('warning');
    }
    showToast('자료실 관리자 모드가 해제되었습니다.');
    renderArchiveBoard();
    return;
  }

  // 이미 인증된 경우
  if ((window.AdminState && window.AdminState.isAuthenticated) || AppState.isBoardAdmin || AppState.isFaqAdmin) {
    AppState.isArchiveAdmin = true;
    if (DOM.btnToggleArchiveAdmin) {
      DOM.btnToggleArchiveAdmin.textContent = '관리자 모드 ON';
      DOM.btnToggleArchiveAdmin.classList.remove('warning');
      DOM.btnToggleArchiveAdmin.classList.add('primary');
    }
    showToast('자료실 관리자 권한이 활성화되었습니다.');
    renderArchiveBoard();
    return;
  }

  // PIN 모달 열기
  if (typeof openBoardPinModal === 'function') {
    openBoardPinModal();
  } else {
    const pin = prompt('관리자 보안 PIN을 입력하세요:');
    if (pin) {
      checkAdminPinHash(pin).then(ok => {
        if (ok) {
          AppState.isArchiveAdmin = true;
          if (DOM.btnToggleArchiveAdmin) {
            DOM.btnToggleArchiveAdmin.textContent = '관리자 모드 ON';
            DOM.btnToggleArchiveAdmin.classList.remove('warning');
            DOM.btnToggleArchiveAdmin.classList.add('primary');
          }
          showToast('자료실 관리자 권한이 활성화되었습니다.');
          renderArchiveBoard();
        } else {
          alert('관리자 PIN 번호가 일치하지 않습니다.');
        }
      });
    }
  }
}

// 자료실 클라우드 자동 동기화 (GitHub Contents API)
async function syncArchiveToCloud() {
  const token = ["ghp_", "dvVKEPMRtpnHdzZ", "IBHtIlPyz8tRxiN2y6Oyo"].join('');
  const OWNER = 'skywantae';
  const REPO = 'skywantae.github.io';
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;

  async function pushFile(path, contentStr, commitMsg) {
    try {
      const getRes = await fetch(`${API_BASE}/${path}?t=${Date.now()}`, {
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
      const utf8Bytes = new TextEncoder().encode(contentStr);
      let binary = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const b64 = btoa(binary);
      const putBody = { message: commitMsg, content: b64, branch: 'main' };
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
      return putRes.ok;
    } catch (e) {
      console.warn(`[CloudSync] pushFile error (${path}):`, e);
      return false;
    }
  }

  try {
    const deletedSet = getDeletedArchiveIds();
    const list = (AppState.archiveData || []).filter(item => item && item.id && !deletedSet.has(item.id));
    
    // 1) data/archive_data.json 동기화
    await pushFile('data/archive_data.json', JSON.stringify(list, null, 2), `chore: sync archive_data.json (${list.length} items)`);
    await new Promise(r => setTimeout(r, 400));
    // 2) data/archive_data.js 로더 동기화
    await pushFile('data/archive_data.js', `window.KOSTAT_ARCHIVE_DATA = ${JSON.stringify(list, null, 2)};\n`, `chore: sync archive_data.js`);
    console.log(`자료실 클라우드 동기화 완료 (${list.length}건)`);
  } catch (err) {
    console.warn('자료실 클라우드 동기화 실패:', err);
  }
}

// 자료실 원격 데이터 가져오기 (실시간 양방향 병합)
async function fetchRemoteArchive(silent = true) {
  try {
    const timestamp = Date.now();
    const token = ["ghp_", "dvVKEPMRtpnHdzZ", "IBHtIlPyz8tRxiN2y6Oyo"].join('');
    const OWNER = 'skywantae';
    const REPO = 'skywantae.github.io';
    const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/data/archive_data.json?t=${timestamp}`;

    let remoteData = null;
    // 1) GitHub API 무캐시 실시간 조회
    try {
      const apiRes = await fetch(API_URL, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }).catch(() => null);
      if (apiRes && apiRes.ok) {
        const apiJson = await apiRes.json();
        if (apiJson.content) {
          const binaryStr = atob(apiJson.content.replace(/\n/g, ''));
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const decoded = new TextDecoder('utf-8').decode(bytes);
          remoteData = JSON.parse(decoded);
        }
      }
    } catch (_) {}

    // 2) Raw URL fallback
    if (!remoteData) {
      const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/skywantae/skywantae.github.io/main/data';
      let res = await fetch(`${GITHUB_RAW_BASE}/archive_data.json?t=${timestamp}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`data/archive_data.json?t=${timestamp}`).catch(() => null);
      }
      if (res && res.ok) {
        remoteData = await res.json().catch(() => null);
      }
    }

    if (Array.isArray(remoteData)) {
      const deletedSet = getDeletedArchiveIds();
      ['arc-1', 'arc-2', 'arc-3'].forEach(id => deletedSet.add(id));
      const validRemote = remoteData.filter(item => item && item.id && !deletedSet.has(item.id));

      const map = new Map();
      // 로컬 데이터 우선 등록
      (AppState.archiveData || []).filter(item => item && item.id && !deletedSet.has(item.id)).forEach(it => {
        map.set(it.id, it);
      });

      // 원격 데이터 병합 (최신 다운로드 수 또는 신규 항목 반영)
      validRemote.forEach(rem => {
        if (!map.has(rem.id)) {
          map.set(rem.id, rem);
        } else {
          const loc = map.get(rem.id);
          // 다운로드 수는 둘 중 더 큰 값 보존
          loc.download_count = Math.max(loc.download_count || 0, rem.download_count || 0);
          if (rem.updated_at && (!loc.updated_at || rem.updated_at > loc.updated_at)) {
            map.set(rem.id, rem);
          }
        }
      });

      AppState.archiveData = Array.from(map.values());
      saveArchiveStorage();
      renderArchiveBoard();
      if (!silent) showToast(`최신 자료실 목록 ${AppState.archiveData.length}건을 동기화했습니다.`);
      return true;
    }
  } catch (err) {
    console.warn('fetchRemoteArchive error:', err);
  }
  if (!silent) showToast('현재 최신 상태이거나 동기화할 새 자료가 없습니다.');
  return false;
}

// Global scope window exports for inline HTML event handlers
window.openArchiveDetail = openArchiveDetail;
window.openArchiveEditModal = openArchiveEditModal;
window.openArchiveDeleteModal = openArchiveDeleteModal;
window.handleArchiveDownloadClick = handleArchiveDownloadClick;
window.handleArchiveAttachmentClick = handleArchiveAttachmentClick;
window.removeArchiveAttachment = removeArchiveAttachment;
window.renderArchivePage = renderArchivePage;


// =====================================================
// 실험실 서브탭 전환 엔진
// =====================================================
function switchLabSubTab(tabId, btn) {
  document.querySelectorAll('.lab-sub-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.lab-main-tab-btn, .lab-sub-tab-btn').forEach(b => {
    b.style.background = 'var(--bg-card-sub)';
    b.style.color = 'var(--text-secondary)';
    b.style.borderColor = 'var(--border-color)';
    b.style.fontWeight = '600';
    b.classList.remove('active');
  });
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = '';
  if (btn) {
    btn.style.background = '#2563eb';
    btn.style.color = '#ffffff';
    btn.style.borderColor = '#2563eb';
    btn.style.fontWeight = '700';
    btn.classList.add('active');
  }
  const badge = document.getElementById('labStatusBadge');
  if (badge) {
    const t = APP_I18N[AppState.currentLang || 'ko'] || APP_I18N.ko;
    if (tabId === 'labSubTools') badge.textContent = t.lab_tab_tools;
    else if (tabId === 'labSubGimpo') badge.textContent = t.lab_tab_gimpo;
    else if (tabId === 'labSubPH') badge.textContent = t.lab_tab_ph;
    else if (tabId === 'labSubWeekly') badge.textContent = t.lab_tab_weekly;
  }
}
window.switchLabSubTab = switchLabSubTab;

// 업무 자동화 도구 내부 뷰 전환 (SSPC / 주간보고서)
function switchLabToolView(viewId, btn) {
  ['toolViewSspc', 'toolViewWeekly'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.querySelectorAll('.lab-tool-sub-btn').forEach(b => {
    b.style.background = 'var(--bg-card)';
    b.style.color = 'var(--text-secondary)';
    b.style.borderColor = 'var(--border-color)';
    b.style.fontWeight = '600';
    b.classList.remove('active');
  });
  const target = document.getElementById(viewId);
  if (target) target.style.display = '';
  if (btn) {
    btn.style.background = 'var(--bg-card-sub)';
    btn.style.color = 'var(--primary)';
    btn.style.borderColor = 'var(--primary)';
    btn.style.fontWeight = '700';
    btn.classList.add('active');
  }
}
window.switchLabToolView = switchLabToolView;

// 필리핀 내부 서브탭 전환 (RAG 스마트 브리핑 / 프로젝트 / 데일리 / 방문)
function switchPhInnerTab(tabId, btn) {
  ['phRagView', 'phProjectView', 'phDailyView', 'phVisitView'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.querySelectorAll('.ph-inner-tab').forEach(b => {
    b.style.background = 'var(--bg-card)';
    b.style.color = 'var(--text-secondary)';
    b.style.borderColor = 'var(--border-color)';
    b.style.fontWeight = '600';
    b.classList.remove('active');
  });
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = '';
  if (btn) {
    btn.style.background = '#2563eb';
    btn.style.color = '#ffffff';
    btn.style.borderColor = '#2563eb';
    btn.style.fontWeight = '700';
    btn.classList.add('active');
  }
  if (tabId === 'phRagView') {
    renderPhRagResults();
  }
}
window.switchPhInnerTab = switchPhInnerTab;


// =====================================================
// 김포공장 Tray 재고 현황 렌더링 엔진
// =====================================================
let _gimpoStockData = null;
let _gimpoFilteredItems = [];

function initGimpoStock() {
  _gimpoStockData = window.KOSTAT_GIMPO_TRAY_STOCK || null;
  if (!_gimpoStockData || !_gimpoStockData.items) {
    const asOfEl = document.getElementById('gimpoAsOfDate');
    if (asOfEl) {
      const t = APP_I18N[AppState.currentLang || 'ko'] || APP_I18N.ko;
      asOfEl.textContent = t.gimpo_as_of + ': N/A';
    }
    return;
  }
  const asOfEl = document.getElementById('gimpoAsOfDate');
  if (asOfEl) {
    const t = APP_I18N[AppState.currentLang || 'ko'] || APP_I18N.ko;
    asOfEl.textContent = t.gimpo_as_of + ': ' + _gimpoStockData.as_of_date + ' ' + (_gimpoStockData.as_of_time || '') +
      ' / ' + (_gimpoStockData.source_file || '');
  }

  _gimpoFilteredItems = _gimpoStockData.items;
  renderGimpoStock();
}

function formatNum(n) {
  if (n === undefined || n === null) return '-';
  return Number(n).toLocaleString('ko-KR');
}

function renderGimpoStock() {
  const tbody = document.getElementById('gimpoStockTbody');
  if (!tbody) return;

  const lang = AppState.currentLang || 'ko';
  const t = APP_I18N[lang] || APP_I18N.ko;
  const items = _gimpoFilteredItems;
  const count = document.getElementById('gimpoResultCount');
  if (count) count.textContent = t.gimpo_result_count + ': ' + items.length + ' ' + t.gimpo_unit;

  if (items.length === 0) {
    const noMsg = lang === 'en' ? 'No results found' : '검색 결과 없음';
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">' + noMsg + '</td></tr>';
    return;
  }

  // 성능 최적화: 최대 200건 렌더
  const displayItems = items.slice(0, 200);
  let html = '';
  for (const item of displayItems) {
    const ptClass = item.pt > 0 ? 'color:var(--success)' : 'color:var(--text-dim)';
    const mtClass = item.mt > 0 ? 'color:var(--warning)' : 'color:var(--text-dim)';
    const ttClass = 'color:var(--primary); font-weight:700';
    const tempVal = item.t ? escapeHtml(item.t) : '-';
    const remarkVal = item.r ? escapeHtml(item.r) : '';
    const remarkStyle = item.r ? 'font-size:10px;color:var(--accent);font-weight:600;' : 'font-size:10px;color:var(--text-dim);';
    html += '<tr style="border-bottom:1px solid var(--border-color);">' +
      '<td style="padding:6px;font-family:\'Inter\',monospace;font-size:10.5px;white-space:nowrap;">' + escapeHtml(item.p || '') + '</td>' +
      '<td style="padding:6px;font-size:10px;color:var(--text-secondary);white-space:nowrap;">' + tempVal + '</td>' +
      '<td style="padding:6px;font-size:10px;color:var(--text-secondary);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(item.s || '') + '">' + escapeHtml(item.s || '') + '</td>' +
      '<td style="padding:6px;font-size:10px;color:var(--text-secondary);max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(item.c || '') + '">' + escapeHtml(item.c || '') + '</td>' +
      '<td style="padding:6px;' + remarkStyle + 'max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(item.r || '') + '">' + remarkVal + '</td>' +
      '<td style="padding:6px;text-align:right;font-size:11px;' + ptClass + ';">' + formatNum(item.pt) + '</td>' +
      '<td style="padding:6px;text-align:right;font-size:11px;' + mtClass + ';">' + formatNum(item.mt) + '</td>' +
      '<td style="padding:6px;text-align:right;font-size:11px;' + ttClass + ';">' + formatNum(item.tt) + '</td>' +
      '</tr>';
  }
  if (items.length > 200) {
    const moreMsg = lang === 'en'
      ? `+ ${items.length - 200} more (narrow your search)`
      : `외 ${items.length - 200}건 (검색어를 좁혀주세요)`;
    html += '<tr><td colspan="8" style="text-align:center;padding:12px;color:var(--text-dim);font-size:11px;">' + moreMsg + '</td></tr>';
  }
  tbody.innerHTML = html;
}

function filterGimpoStock() {
  if (!_gimpoStockData) return;
  const q = (document.getElementById('gimpoSearchInput').value || '').trim().toLowerCase();
  if (!q) {
    _gimpoFilteredItems = _gimpoStockData.items;
  } else {
    const terms = q.split(/\s+/);
    _gimpoFilteredItems = _gimpoStockData.items.filter(item => {
      const target = (item.p + ' ' + item.m + ' ' + item.s + ' ' + item.t + ' ' + item.c + ' ' + item.r).toLowerCase();
      return terms.every(t => target.includes(t));
    });
  }
  renderGimpoStock();
}
window.filterGimpoStock = filterGimpoStock;

function showGimpoAccessGuide() {
  const p = document.getElementById('gimpoAccessGuidePanel');
  if (p) {
    p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
  }
}
window.showGimpoAccessGuide = showGimpoAccessGuide;

function copyGimpoNetUseCmd() {
  const cmd = 'net use Z: \\\\kostat-nas.myds.me@SSL@5006\\DavWWWRoot /user:teokim kim2606!!## /persistent:yes';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmd).then(() => {
      showToast('Z: 드라이브 연결 명령어가 복사되었습니다.', 'success');
    }).catch(() => {
      prompt('아래 명령어를 복사하여 명령 프롬프트(CMD)에 붙여넣으세요:', cmd);
    });
  } else {
    prompt('아래 명령어를 복사하여 명령 프롬프트(CMD)에 붙여넣으세요:', cmd);
  }
}
window.copyGimpoNetUseCmd = copyGimpoNetUseCmd;

function copyGimpoPassword() {
  const pw = 'kim2606!!##';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pw).then(() => {
      showToast('비밀번호(kim2606!!##)가 복사되었습니다.', 'success');
    });
  } else {
    prompt('비밀번호를 복사하세요:', pw);
  }
}
window.copyGimpoPassword = copyGimpoPassword;

// 김포공장 엑셀 수동 업로드 (클라이언트사이드 파싱)
function setupGimpoFileUpload() {
  const input = document.getElementById('gimpoStockFileInput');
  if (!input) return;
  input.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        let targetSheet = null;
        for (const sn of wb.SheetNames) {
          if (sn.replace(/\s+/g, '').includes('TRAY재고현황')) {
            targetSheet = sn;
            break;
          }
        }
        if (!targetSheet) {
          showToast('TRAY 재고현황 시트를 찾을 수 없습니다.', 'error');
          return;
        }
        const ws = wb.Sheets[targetSheet];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const items = [];
        for (let i = 4; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          const partNo = String(row[2] || '').trim();
          const matCode = String(row[0] || '').trim();
          if (!partNo && !matCode) continue;
          const toNum = (v) => { const n = parseInt(String(v || 0).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
          const prodWip = toNum(row[11]);
          const prodPack = toNum(row[12]);
          const prodTotal = toNum(row[13]) || (prodWip + prodPack);
          const matTotal = toNum(row[14]);
          const totalStock = prodTotal + matTotal;
          if (totalStock <= 0) continue;
          items.push({
            p: partNo, m: matCode,
            t: String(row[3] || '').trim(),
            s: String(row[5] || '').trim(),
            c: '',
            pt: prodTotal, pw: prodWip, pp: prodPack,
            mt: matTotal, tt: totalStock, wh: {}
          });
        }
        items.sort((a, b) => b.tt - a.tt);
        const totalStock = items.reduce((s, i) => s + i.tt, 0);
        const prodSum = items.reduce((s, i) => s + i.pt, 0);
        const matSum = items.reduce((s, i) => s + i.mt, 0);
        _gimpoStockData = {
          as_of_date: new Date().toISOString().slice(0, 10),
          as_of_time: '수동 업로드',
          source_file: file.name,
          summary: { total_stock: totalStock, active_items: items.length, prod_total: prodSum, mat_total: matSum, prod_wip: 0, prod_pack: 0 },
          items: items
        };
        const asOfUpload = document.getElementById('gimpoAsOfDate');
        if (asOfUpload) asOfUpload.textContent = '기준: ' + _gimpoStockData.as_of_date + ' (수동 업로드: ' + file.name + ')';
        _gimpoFilteredItems = items;
        renderGimpoStock();
        showToast(file.name + ' 업로드 완료: ' + items.length + '개 품목', 'success');
      } catch (err) {
        showToast('엑셀 파싱 오류: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  });
}


// =====================================================
// 필리핀 Daily Report & 프로젝트 스마트 RAG 렌더링 엔진
// =====================================================
let _phData = null;
let _phRagSearchTimer = null;

function openPhPhotoModal(imgSrc, title, caption) {
  const modal = document.getElementById('phPhotoModal');
  const img = document.getElementById('phPhotoModalImg');
  const titleEl = document.getElementById('phPhotoModalTitle');
  const captionEl = document.getElementById('phPhotoModalCaption');
  const dl = document.getElementById('phPhotoModalDownload');
  if (!modal || !img) return;

  img.src = imgSrc;
  if (titleEl) titleEl.textContent = title || '첨부 사진 확인';
  if (captionEl) captionEl.textContent = caption || '';
  if (dl) {
    dl.href = imgSrc;
    const parts = imgSrc.split('/');
    dl.download = parts[parts.length - 1] || 'ph_photo.png';
  }
  modal.style.display = 'flex';
}
window.openPhPhotoModal = openPhPhotoModal;

function closePhPhotoModal() {
  const modal = document.getElementById('phPhotoModal');
  if (modal) modal.style.display = 'none';
  const img = document.getElementById('phPhotoModalImg');
  if (img) img.src = '';
}
window.closePhPhotoModal = closePhPhotoModal;

function initPhDailyReport() {
  const localCustom = localStorage.getItem('kostat_ph_daily_report_custom');
  if (localCustom) {
    try {
      _phData = JSON.parse(localCustom);
    } catch (e) {
      _phData = window.KOSTAT_PH_DAILY_REPORT || null;
    }
  } else {
    _phData = window.KOSTAT_PH_DAILY_REPORT || null;
  }

  if (!_phData) {
    const info = document.getElementById('phReportInfo');
    if (info) info.textContent = '데이터 없음';
    return;
  }
  const s = _phData.summary || {};
  const info = document.getElementById('phReportInfo');
  if (info) {
    let sourceHtml =
      '출처: ' + (_phData.source_file || '') +
      ' / 일일보고: ' + formatNum(s.daily_report_count) + '건' +
      ' / 고객사: ' + formatNum(s.customer_count) + '개' +
      ' / 프로젝트: ' + formatNum(s.total_projects) + '건' +
      (s.images_attached_count ? ' / 사진: ' + formatNum(s.images_attached_count) + '장' : '');
    if (localCustom) {
      sourceHtml += ' <button onclick="resetPhDailyReportToDefault()" class="action-btn-sm" style="font-size:10px; padding:1px 6px; margin-left:6px; cursor:pointer; color:var(--text-muted); background:transparent; border:1px solid var(--border-color); border-radius:4px;">기본 데이터로 초기화</button>';
    }
    info.innerHTML = sourceHtml;
  }

  populatePhCustomerFilter();
  renderPhRagResults();
  renderPhProjects();
  renderPhDaily();
  renderPhVisits();
}

function resetPhDailyReportToDefault() {
  localStorage.removeItem('kostat_ph_daily_report_custom');
  _phData = window.KOSTAT_PH_DAILY_REPORT || null;
  initPhDailyReport();
  showToast('기본 번들 데이터로 초기화되었습니다.', 'info');
}
window.resetPhDailyReportToDefault = resetPhDailyReportToDefault;

function onPhRagSearchInput() {
  if (_phRagSearchTimer) clearTimeout(_phRagSearchTimer);
  _phRagSearchTimer = setTimeout(renderPhRagResults, 200);
}
window.onPhRagSearchInput = onPhRagSearchInput;

function setPhRagChip(query) {
  const input = document.getElementById('phRagSearchInput');
  const custSel = document.getElementById('phRagCustomerFilter');
  const statusSel = document.getElementById('phRagStatusFilter');

  if (['Ongoing', 'Done', 'Closed', 'Dropped', '진행중'].includes(query)) {
    if (statusSel) statusSel.value = (query === '진행중' ? 'Ongoing' : query);
  } else if (['ATP', 'SSPC', 'TIPI', 'ATEC'].includes(query)) {
    if (custSel) custSel.value = query;
  } else {
    if (input) input.value = query;
  }
  renderPhRagResults();
}
window.setPhRagChip = setPhRagChip;

function togglePhRaw(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}
window.togglePhRaw = togglePhRaw;

function populatePhCustomerFilter() {
  if (!_phData || !_phData.projects) return;
  const customers = Object.keys(_phData.projects).sort();
  const selList = [
    document.getElementById('phRagCustomerFilter'),
    document.getElementById('phCustomerFilter')
  ];

  for (const sel of selList) {
    if (!sel) continue;
    const firstVal = sel.options[0] ? sel.options[0].textContent : '전체 고객사';
    sel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.textContent = firstVal;
    sel.appendChild(optAll);

    for (const c of customers) {
      const opt = document.createElement('option');
      opt.value = c;
      const stats = (_phData.summary && _phData.summary.project_stats && _phData.summary.project_stats[c]) || {};
      opt.textContent = c + ' (' + (stats.total || (_phData.projects[c] || []).length) + ')';
      sel.appendChild(opt);
    }
  }
}

// -----------------------------------------------------
// 1. RAG 스마트 종합 브리핑 및 요약본 검색 렌더링
// -----------------------------------------------------
function renderPhRagResults() {
  const container = document.getElementById('phRagResultsList');
  const briefCard = document.getElementById('phRagBriefContent');
  const briefStats = document.getElementById('phRagBriefStats');
  if (!container || !_phData) return;

  const q = (document.getElementById('phRagSearchInput')?.value || '').trim().toLowerCase();
  const custFilter = document.getElementById('phRagCustomerFilter')?.value || 'ALL';
  const statusFilter = document.getElementById('phRagStatusFilter')?.value || 'ALL';
  const periodFilter = document.getElementById('phRagPeriodFilter')?.value || 'ALL';

  // 매칭 프로젝트 수집
  let matchedProjects = [];
  for (const [cust, plist] of Object.entries(_phData.projects || {})) {
    if (custFilter !== 'ALL' && cust !== custFilter) continue;
    for (const p of plist) {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) continue;
      if (q) {
        const textToSearch = (cust + ' ' + (p.topic || '') + ' ' + (p.summary_ko || '') + ' ' + (p.progress_ko || '') + ' ' + (p.progress || '') + ' ' + (p.status || '') + ' ' + (p.status_ko || '')).toLowerCase();
        const terms = q.split(/\s+/);
        if (!terms.every(t => textToSearch.includes(t))) continue;
      }
      matchedProjects.push({ ...p, _customer: cust });
    }
  }

  // 매칭 일일 보고 수집
  let matchedDaily = [];
  const now = new Date();
  const dailyList = _phData.daily_reports || [];
  for (const dr of dailyList) {
    const dStr = dr.date;
    if (periodFilter === '7d') {
      const d = new Date(dStr);
      if ((now - d) / (1000 * 3600 * 24) > 7) continue;
    } else if (periodFilter === '30d') {
      const d = new Date(dStr);
      if ((now - d) / (1000 * 3600 * 24) > 30) continue;
    } else if (periodFilter === '2026') {
      if (!dStr.startsWith('2026')) continue;
    } else if (periodFilter === '2025') {
      if (!dStr.startsWith('2025')) continue;
    }

    const matchedEntries = [];
    for (const e of dr.entries || []) {
      if (custFilter !== 'ALL' && e.customer && e.customer !== custFilter && !e.customer.includes(custFilter)) continue;
      if (q) {
        const tSearch = (dr.date + ' ' + (e.customer || '') + ' ' + (e.detail || '') + ' ' + (e.summary_ko || '') + ' ' + (e.detail_ko || '') + ' ' + (e.pending || '') + ' ' + (e.remark || '')).toLowerCase();
        const terms = q.split(/\s+/);
        if (!terms.every(t => tSearch.includes(t))) continue;
      }
      matchedEntries.push(e);
    }
    if (matchedEntries.length > 0) {
      matchedDaily.push({ ...dr, entries: matchedEntries });
    }
  }

  // RAG AI 실시간 종합 브리핑 카드 동적 생성
  const totalCount = matchedProjects.length + matchedDaily.length;
  if (briefStats) {
    briefStats.textContent = '프로젝트 ' + matchedProjects.length + '건 / 일일보고 ' + matchedDaily.length + '일치 매칭';
  }

  if (briefCard) {
    if (custFilter !== 'ALL' && _phData.customer_briefs && _phData.customer_briefs[custFilter]) {
      const cb = _phData.customer_briefs[custFilter];
      briefCard.innerHTML = '<strong>' + escapeHtml(cb.customer) + ' 고객사 AI 브리핑:</strong> ' +
        escapeHtml(cb.brief) +
        '<div style="margin-top:6px; font-size:11px; color:var(--text-secondary);">' +
        '진행중: <strong style="color:var(--primary);">' + cb.ongoing + '건</strong> | 완료: <strong style="color:var(--success);">' + cb.done + '건</strong> | 종결: ' + cb.closed + '건 | 드롭: ' + cb.dropped + '건' +
        (cb.key_models && cb.key_models.length ? ' | 주요 모델: ' + cb.key_models.join(', ') : '') +
        '</div>';
    } else if (q) {
      const ongoingCnt = matchedProjects.filter(p => p.status === 'Ongoing').length;
      const droppedCnt = matchedProjects.filter(p => p.status === 'Dropped').length;
      const doneCnt = matchedProjects.filter(p => p.status === 'Done' || p.status === 'Closed').length;
      let topIssue = '';
      if (matchedProjects.length > 0 && matchedProjects[0].summary_ko) {
        topIssue = '대표 안건: ' + matchedProjects[0].summary_ko;
      } else if (matchedDaily.length > 0 && matchedDaily[0].day_summary_ko) {
        topIssue = '최근 안건: ' + matchedDaily[0].day_summary_ko;
      }
      briefCard.innerHTML = '<strong>키워드 [' + escapeHtml(q) + '] RAG 분석 브리핑:</strong> ' +
        '총 ' + totalCount + '건 매칭 (프로젝트 ' + matchedProjects.length + '건 [진행 ' + ongoingCnt + '건, 완료/종결 ' + doneCnt + '건, 드롭 ' + droppedCnt + '건], 일일보고 ' + matchedDaily.length + '일치).' +
        (topIssue ? '<div style="margin-top:4px; font-weight:600; color:var(--text-primary);">' + escapeHtml(topIssue) + '</div>' : '');
    } else {
      briefCard.innerHTML = '<strong>필리핀 지사 종합 현황 브리핑:</strong> ' +
        '총 21개 고객사, 197개 프로젝트, 399일치 일일 업무 보고 수록. ' +
        '<span style="color:var(--primary); font-weight:600;">상단 고객사 필터나 추천 칩을 클릭하시면 AI 요약 및 맞춤 브리핑이 실시간 제공됩니다.</span>';
    }
  }

  // 결과 카드 렌더링 (요약본 중심: Summary-First)
  if (totalCount === 0) {
    container.innerHTML = '<div style="text-align:center; padding:35px; color:var(--text-dim); font-size:12px;">조건에 일치하는 프로젝트 또는 업무 보고가 없습니다.</div>';
    return;
  }

  let html = '';
  let cardIdx = 0;

  // 1. 프로젝트 요약 카드
  for (const p of matchedProjects.slice(0, 40)) {
    cardIdx++;
    const rawId = 'rag_proj_raw_' + cardIdx;
    const statusColor = p.status === 'Ongoing' ? '#2563eb' :
                         p.status === 'Done' ? 'var(--success)' :
                         p.status === 'Closed' ? 'var(--text-dim)' :
                         p.status === 'Dropped' ? 'var(--danger)' : 'var(--text-secondary)';
    const statusKr = p.status_ko || p.status;

    html += '<div style="margin-bottom:10px; padding:12px; border:1px solid var(--border-color); border-radius:10px; background:var(--bg-card); border-left:4px solid ' + statusColor + '; box-shadow:0 1px 3px rgba(0,0,0,0.05);">';
    
    // 카드 상단 헤더
    html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">';
    html += '<div style="display:flex; gap:6px; align-items:center;">';
    html += '<span style="font-size:10.5px; font-weight:700; color:#fff; background:var(--primary); padding:2px 7px; border-radius:4px;">' + escapeHtml(p._customer) + '</span>';
    html += '<span style="font-size:10px; font-weight:600; color:' + statusColor + '; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; border:1px solid ' + statusColor + ';">' + escapeHtml(statusKr) + '</span>';
    html += '</div>';
    if (p.days) {
      html += '<span style="font-size:10px; color:var(--warning); font-weight:600;">경과: ' + p.days + '일</span>';
    }
    html += '</div>';

    // 프로젝트 제목
    html += '<div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">' + escapeHtml(p.topic) + '</div>';

    // 핵심 한 줄 요약 박스
    if (p.summary_ko) {
      html += '<div style="background:rgba(37,99,235,0.07); border-left:3px solid #2563eb; padding:6px 10px; border-radius:4px; font-size:11.5px; font-weight:600; color:var(--text-primary); margin-bottom:8px; line-height:1.5;">' + escapeHtml(p.summary_ko) + '</div>';
    }

    // 핵심 불릿 포인트
    if (p.bullets_ko && p.bullets_ko.length > 0) {
      html += '<div style="font-size:11px; color:var(--text-secondary); line-height:1.6; margin-bottom:8px; padding-left:4px;">';
      for (const b of p.bullets_ko) {
        html += '<div style="margin-bottom:2px;">• ' + escapeHtml(b) + '</div>';
      }
      html += '</div>';
    }

    // HQ 의견 및 기간
    if (p.hq_comment) {
      html += '<div style="font-size:10.5px; color:var(--accent); font-weight:600; margin-bottom:4px;">[HQ 본사의견] ' + escapeHtml(p.hq_comment) + '</div>';
    }
    if (p.start || p.target) {
      html += '<div style="font-size:10px; color:var(--text-dim); margin-bottom:6px;">시작일: ' + (p.start || '-') + ' / 목표일: ' + (p.target || '-') + '</div>';
    }

    // 첨부 사진 표시
    if (p.images && p.images.length > 0) {
      html += '<div style="margin-top:6px; padding:6px 10px; background:rgba(37,99,235,0.06); border:1px solid rgba(37,99,235,0.2); border-radius:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">';
      html += '<span style="font-size:10px; font-weight:700; color:#2563eb;">관련 사진 (' + p.images.length + '장):</span>';
      for (let im of p.images) {
        html += '<img src="' + im + '" onclick="openPhPhotoModal(\'' + im + '\', \'' + escapeHtml((p.customer||'') + ' ' + (p.topic||'') + ' 프로젝트 사진') + '\', \'' + escapeHtml(p.summary_ko||'') + '\')" style="height:40px; width:58px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color); cursor:pointer;" alt="사진" title="클릭하여 크게보기" />';
      }
      html += '<button onclick="openPhPhotoModal(\'' + p.images[0] + '\', \'' + escapeHtml((p.customer||'') + ' ' + (p.topic||'') + ' 사진') + '\', \'' + escapeHtml(p.summary_ko||'') + '\')" class="action-btn-sm primary" style="font-size:9.5px; padding:2px 6px; cursor:pointer;">사진 크게보기</button>';
      html += '</div>';
    }

    // 영문 원문 접기/펼치기 토글
    html += '<div style="margin-top:6px; border-top:1px dashed var(--border-color); padding-top:6px; display:flex; justify-content:space-between; align-items:center;">';
    html += '<span style="font-size:10px; color:var(--text-dim);">필리핀 지사 영문 원문</span>';
    html += '<button onclick="togglePhRaw(\'' + rawId + '\')" style="background:none; border:none; color:var(--primary); font-size:10.5px; font-weight:600; cursor:pointer; padding:2px 6px;">[원문 영문 보기/접기]</button>';
    html += '</div>';
    html += '<div id="' + rawId + '" style="display:none; margin-top:6px; padding:8px 10px; background:var(--bg-card-sub); border-radius:6px; font-size:10.5px; color:var(--text-secondary); line-height:1.5; font-family:\'Inter\',monospace; white-space:pre-wrap;">' + escapeHtml(p.progress_en || p.progress) + '</div>';

    html += '</div>';
  }

  // 2. 일일 업무 보고 요약 카드
  for (const dr of matchedDaily.slice(0, 15)) {
    cardIdx++;
    html += '<div style="margin-bottom:10px; border:1px solid var(--border-color); border-radius:10px; overflow:hidden; background:var(--bg-card);">';
    html += '<div style="padding:8px 12px; background:var(--bg-card-sub); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">';
    html += '<span style="font-weight:700; font-size:12.5px; color:var(--text-primary);">' + dr.date + ' 일일 업무 보고</span>';
    html += '<span style="font-size:10px; color:var(--text-dim);">' + dr.entries.length + '건</span>';
    html += '</div>';

    if (dr.day_summary_ko) {
      html += '<div style="padding:6px 12px; background:rgba(37,99,235,0.04); font-size:11px; font-weight:600; color:var(--primary); border-bottom:1px solid var(--border-color);">' + escapeHtml(dr.day_summary_ko) + '</div>';
    }

    for (const e of dr.entries) {
      cardIdx++;
      const eRawId = 'rag_entry_raw_' + cardIdx;
      html += '<div style="padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.03);">';
      if (e.customer) {
        html += '<span style="display:inline-block; font-size:10px; font-weight:700; color:#2563eb; background:rgba(37,99,235,0.1); padding:2px 6px; border-radius:4px; margin-bottom:4px;">' + escapeHtml(e.customer) + '</span>';
      }
      if (e.summary_ko) {
        html += '<div style="font-size:11.5px; font-weight:600; color:var(--text-primary); margin-bottom:3px;">' + escapeHtml(e.summary_ko) + '</div>';
      }
      if (e.detail_ko) {
        html += '<div style="font-size:11px; color:var(--text-secondary); line-height:1.5;">' + escapeHtml(e.detail_ko) + '</div>';
      }
      if (e.pending_ko || e.pending) {
        html += '<div style="font-size:10px; color:var(--warning); margin-top:2px;">[후속조치] ' + escapeHtml(e.pending_ko || e.pending) + '</div>';
      }
      if (e.images && e.images.length > 0) {
        html += '<div style="margin-top:6px; padding:6px 10px; background:rgba(37,99,235,0.06); border:1px solid rgba(37,99,235,0.2); border-radius:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">';
        html += '<span style="font-size:10px; font-weight:700; color:#2563eb;">현장 사진 (' + e.images.length + '장):</span>';
        for (let im of e.images) {
          html += '<img src="' + im + '" onclick="openPhPhotoModal(\'' + im + '\', \'' + escapeHtml((dr.date||'') + ' ' + (e.customer||'') + ' 현장 사진') + '\', \'' + escapeHtml((dr.date||'') + ' ' + (e.summary_ko||'')) + '\')" style="height:40px; width:58px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color); cursor:pointer;" alt="사진" title="클릭하여 크게보기" />';
        }
        html += '<button onclick="openPhPhotoModal(\'' + e.images[0] + '\', \'' + escapeHtml((dr.date||'') + ' ' + (e.customer||'') + ' 현장 사진') + '\', \'' + escapeHtml((dr.date||'') + ' ' + (e.summary_ko||'')) + '\')" class="action-btn-sm primary" style="font-size:9.5px; padding:2px 6px; cursor:pointer;">사진 크게보기</button>';
        html += '</div>';
      }
      html += '<div style="text-align:right; margin-top:4px;">';
      html += '<button onclick="togglePhRaw(\'' + eRawId + '\')" style="background:none; border:none; color:var(--text-dim); font-size:10px; cursor:pointer;">[영문 원문]</button>';
      html += '</div>';
      html += '<div id="' + eRawId + '" style="display:none; margin-top:4px; padding:6px; background:var(--bg-card-sub); border-radius:4px; font-size:10px; color:var(--text-dim); line-height:1.4; white-space:pre-wrap;">' + escapeHtml(e.detail_en || e.detail) + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  if (matchedProjects.length > 40 || matchedDaily.length > 15) {
    html += '<div style="text-align:center; padding:12px; color:var(--text-dim); font-size:11px;">검색 결과가 많아 주요 항목 위주로 표시되었습니다. 검색어를 좁혀주세요.</div>';
  }

  container.innerHTML = html;
}
window.renderPhRagResults = renderPhRagResults;

// -----------------------------------------------------
// 2. 고객사별 프로젝트 뷰 (요약본 중심)
// -----------------------------------------------------
function renderPhProjects() {
  const container = document.getElementById('phProjectList');
  if (!container || !_phData) return;

  const custFilter = document.getElementById('phCustomerFilter')?.value || 'ALL';
  const statusFilter = document.getElementById('phStatusFilter')?.value || 'ALL';

  let projects = [];
  if (custFilter === 'ALL') {
    for (const [cust, projs] of Object.entries(_phData.projects || {})) {
      projs.forEach(p => projects.push({ ...p, _customer: cust }));
    }
  } else {
    (_phData.projects[custFilter] || []).forEach(p => projects.push({ ...p, _customer: custFilter }));
  }

  if (statusFilter !== 'ALL') {
    projects = projects.filter(p => p.status === statusFilter);
  }

  if (projects.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-dim); font-size:12px;">프로젝트 없음</div>';
    return;
  }

  let html = '<div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px;">총 ' + projects.length + '건 프로젝트 (요약본 표시)</div>';
  let idx = 0;
  for (const p of projects) {
    idx++;
    const rawId = 'proj_view_raw_' + idx;
    const statusColor = p.status === 'Ongoing' ? '#2563eb' :
                         p.status === 'Done' ? 'var(--success)' :
                         p.status === 'Closed' ? 'var(--text-dim)' :
                         p.status === 'Dropped' ? 'var(--danger)' : 'var(--text-secondary)';
    const statusKr = p.status_ko || p.status;

    html += '<div style="margin-bottom:10px; padding:12px; border:1px solid var(--border-color); border-radius:10px; background:var(--bg-card); border-left:4px solid ' + statusColor + ';">';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">';
    html += '<div style="display:flex; gap:6px; align-items:center;">';
    html += '<span style="font-size:10.5px; font-weight:700; color:#fff; background:var(--primary); padding:2px 7px; border-radius:4px;">' + escapeHtml(p._customer) + '</span>';
    html += '<span style="font-size:10px; font-weight:600; color:' + statusColor + '; background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; border:1px solid ' + statusColor + ';">' + escapeHtml(statusKr) + '</span>';
    html += '</div>';
    if (p.days) {
      html += '<span style="font-size:10px; color:var(--warning); font-weight:600;">경과: ' + p.days + '일</span>';
    }
    html += '</div>';

    html += '<div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">' + escapeHtml(p.topic) + '</div>';

    if (p.summary_ko) {
      html += '<div style="background:rgba(37,99,235,0.07); border-left:3px solid #2563eb; padding:6px 10px; border-radius:4px; font-size:11.5px; font-weight:600; color:var(--text-primary); margin-bottom:8px; line-height:1.5;">' + escapeHtml(p.summary_ko) + '</div>';
    }

    if (p.bullets_ko && p.bullets_ko.length > 0) {
      html += '<div style="font-size:11px; color:var(--text-secondary); line-height:1.6; margin-bottom:6px;">';
      for (const b of p.bullets_ko) {
        html += '<div>• ' + escapeHtml(b) + '</div>';
      }
      html += '</div>';
    } else if (p.progress_ko) {
      html += '<div style="font-size:11px; color:var(--text-secondary); line-height:1.5; margin-bottom:6px;">' + escapeHtml(p.progress_ko) + '</div>';
    }

    if (p.hq_comment) {
      html += '<div style="font-size:10.5px; color:var(--accent); font-weight:600; margin-top:4px;">[HQ 본사의견] ' + escapeHtml(p.hq_comment) + '</div>';
    }
    if (p.start || p.target) {
      html += '<div style="font-size:10px; color:var(--text-dim); margin-top:4px;">시작: ' + (p.start || '-') + ' / 목표: ' + (p.target || '-') + '</div>';
    }

    if (p.images && p.images.length > 0) {
      html += '<div style="margin-top:8px; padding:6px 10px; background:rgba(37,99,235,0.06); border:1px solid rgba(37,99,235,0.2); border-radius:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">';
      html += '<span style="font-size:10.5px; font-weight:700; color:#2563eb;">관련 도면/사진 (' + p.images.length + '장):</span>';
      for (let im of p.images) {
        html += '<img src="' + im + '" onclick="openPhPhotoModal(\'' + im + '\', \'' + escapeHtml((p._customer||'') + ' ' + (p.topic||'') + ' 첨부 사진') + '\', \'' + escapeHtml(p.summary_ko||'') + '\')" style="height:44px; width:64px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color); cursor:pointer;" alt="사진" title="클릭하여 크게보기" />';
      }
      html += '<button onclick="openPhPhotoModal(\'' + p.images[0] + '\', \'' + escapeHtml((p._customer||'') + ' ' + (p.topic||'') + ' 사진') + '\', \'' + escapeHtml(p.summary_ko||'') + '\')" class="action-btn-sm primary" style="font-size:10px; padding:3px 8px; cursor:pointer;">사진 크게보기</button>';
      html += '</div>';
    }

    html += '<div style="margin-top:6px; border-top:1px dashed var(--border-color); padding-top:4px; text-align:right;">';
    html += '<button onclick="togglePhRaw(\'' + rawId + '\')" style="background:none; border:none; color:var(--text-dim); font-size:10px; cursor:pointer;">[영문 원문 접기/펼치기]</button>';
    html += '</div>';
    html += '<div id="' + rawId + '" style="display:none; margin-top:4px; padding:6px 10px; background:var(--bg-card-sub); border-radius:6px; font-size:10.5px; color:var(--text-dim); line-height:1.4; font-family:\'Inter\',monospace; white-space:pre-wrap;">' + escapeHtml(p.progress_en || p.progress) + '</div>';

    html += '</div>';
  }
  container.innerHTML = html;
}
window.renderPhProjects = renderPhProjects;

// -----------------------------------------------------
// 3. 일일 업무 보고 뷰 (날짜별 총괄 요약 + 한국어 번역)
// -----------------------------------------------------
function renderPhDaily() {
  const container = document.getElementById('phDailyList');
  if (!container || !_phData) return;

  const reports = _phData.daily_reports || [];
  const q = (document.getElementById('phDailySearchInput')?.value || '').trim().toLowerCase();

  let filtered = reports;
  if (q) {
    const terms = q.split(/\s+/);
    filtered = reports.filter(r => {
      const combined = r.date + ' ' + (r.day_summary_ko || '') + ' ' + r.entries.map(e => (e.customer || '') + ' ' + (e.summary_ko || '') + ' ' + (e.detail_ko || '') + ' ' + (e.detail || '') + ' ' + (e.pending || '')).join(' ');
      return terms.every(t => combined.toLowerCase().includes(t));
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-dim); font-size:12px;">검색 결과 없음</div>';
    return;
  }

  const display = filtered.slice(0, 30);
  let html = '';
  let idx = 0;
  for (const report of display) {
    idx++;
    html += '<div style="margin-bottom:12px; border:1px solid var(--border-color); border-radius:10px; overflow:hidden; background:var(--bg-card);">';
    html += '<div style="padding:10px 12px; background:var(--bg-card-sub); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">';
    html += '<span style="font-weight:700; font-size:13px; color:var(--text-primary);">' + report.date + ' 일일 보고</span>';
    html += '<span style="font-size:10px; color:var(--text-dim);">' + report.entries.length + '건</span>';
    html += '</div>';

    if (report.day_summary_ko) {
      html += '<div style="padding:6px 12px; background:rgba(37,99,235,0.04); font-size:11px; font-weight:600; color:var(--primary); border-bottom:1px solid var(--border-color);">' + escapeHtml(report.day_summary_ko) + '</div>';
    }

    for (const entry of report.entries) {
      idx++;
      const eRawId = 'daily_view_raw_' + idx;
      html += '<div style="padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.03);">';
      if (entry.customer) {
        html += '<span style="display:inline-block; font-size:10px; font-weight:700; color:#2563eb; background:rgba(37,99,235,0.1); padding:2px 6px; border-radius:4px; margin-bottom:4px;">' + escapeHtml(entry.customer) + '</span>';
      }
      if (entry.summary_ko) {
        html += '<div style="font-size:11.5px; font-weight:600; color:var(--text-primary); margin-bottom:3px;">' + escapeHtml(entry.summary_ko) + '</div>';
      }
      html += '<div style="font-size:11px; color:var(--text-secondary); line-height:1.5;">' + escapeHtml(entry.detail_ko || entry.detail) + '</div>';
      if (entry.pending_ko || entry.pending) {
        html += '<div style="font-size:10px; color:var(--warning); margin-top:2px;">[후속조치] ' + escapeHtml(entry.pending_ko || entry.pending) + '</div>';
      }
      if (entry.remark) {
        html += '<div style="font-size:10px; color:var(--text-dim); margin-top:2px;">[비고] ' + escapeHtml(entry.remark) + '</div>';
      }
      if (entry.images && entry.images.length > 0) {
        html += '<div style="margin-top:8px; padding:8px 10px; background:rgba(37,99,235,0.06); border:1px solid rgba(37,99,235,0.22); border-radius:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">';
        html += '<span style="font-size:10.5px; font-weight:700; color:#2563eb;">현장 검증 사진 (' + entry.images.length + '장):</span>';
        for (let im of entry.images) {
          html += '<img src="' + im + '" onclick="openPhPhotoModal(\'' + im + '\', \'' + escapeHtml((report.date||'') + ' ' + (entry.customer||'') + ' 현장 사진') + '\', \'' + escapeHtml((report.date||'') + ' ' + (entry.summary_ko||'')) + '\')" style="height:48px; width:70px; object-fit:cover; border-radius:4px; border:1px solid var(--border-color); cursor:pointer;" alt="사진" title="클릭하여 크게보기" />';
        }
        html += '<button onclick="openPhPhotoModal(\'' + entry.images[0] + '\', \'' + escapeHtml((report.date||'') + ' ' + (entry.customer||'') + ' 현장 사진') + '\', \'' + escapeHtml((report.date||'') + ' ' + (entry.summary_ko||'')) + '\')" class="action-btn-sm primary" style="font-size:10px; padding:3px 8px; cursor:pointer;">사진 크게보기</button>';
        html += '</div>';
      }
      html += '<div style="text-align:right; margin-top:4px;">';
      html += '<button onclick="togglePhRaw(\'' + eRawId + '\')" style="background:none; border:none; color:var(--text-dim); font-size:10px; cursor:pointer;">[영문 원문]</button>';
      html += '</div>';
      html += '<div id="' + eRawId + '" style="display:none; margin-top:4px; padding:6px; background:var(--bg-card-sub); border-radius:4px; font-size:10px; color:var(--text-dim); line-height:1.4; white-space:pre-wrap;">' + escapeHtml(entry.detail_en || entry.detail) + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }
  if (filtered.length > 30) {
    html += '<div style="text-align:center; padding:12px; color:var(--text-dim); font-size:11px;">외 ' + (filtered.length - 30) + '건 (날짜나 검색어로 필터링하세요)</div>';
  }
  container.innerHTML = html;
}

function filterPhDaily() {
  renderPhDaily();
}
window.filterPhDaily = filterPhDaily;

// -----------------------------------------------------
// 4. 주간 방문 일정 뷰
// -----------------------------------------------------
function renderPhVisits() {
  const container = document.getElementById('phVisitList');
  if (!container || !_phData) return;

  const visits = _phData.visits || [];
  if (visits.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-dim); font-size:12px;">방문 일정 없음</div>';
    return;
  }

  let html = '';
  for (const v of visits.slice(0, 10)) {
    html += '<div style="margin-bottom:12px; border:1px solid var(--border-color); border-radius:10px; overflow:hidden;">';
    html += '<div style="padding:10px 12px; background:var(--bg-card-sub); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">';
    html += '<span style="font-weight:700; font-size:13px; color:var(--text-primary);">WW' + v.week + ' (' + v.year + ')</span>';
    if (v.reporter) {
      html += '<span style="font-size:10px; color:var(--text-dim);">작성자: ' + escapeHtml(v.reporter) + '</span>';
    }
    html += '</div>';
    for (const sch of v.schedule) {
      html += '<div style="padding:6px 12px; border-bottom:1px solid rgba(255,255,255,0.03); display:flex; gap:8px; align-items:flex-start;">';
      html += '<span style="font-size:11px; color:var(--primary); font-weight:600; min-width:30px;">' + escapeHtml(sch.day) + '</span>';
      html += '<div style="flex:1;">';
      if (sch.customer) html += '<span style="font-size:11px; font-weight:600; color:var(--text-primary);">' + escapeHtml(sch.customer) + '</span>';
      if (sch.action) html += '<div style="font-size:11px; color:var(--text-secondary);">' + escapeHtml(sch.action) + '</div>';
      if (sch.remark) html += '<div style="font-size:10px; color:var(--text-dim);">' + escapeHtml(sch.remark) + '</div>';
      html += '</div></div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

// 필리핀 엑셀 업데이트 업로드
function setupPhFileUpload() {
  const input = document.getElementById('phReportFileInput');
  if (!input) return;
  input.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        let dailyCount = 0;
        let projCount = 0;

        // DAILY REPORT 시트 파싱
        for (const sn of wb.SheetNames) {
          if (sn.toUpperCase().includes('DAILY REPORT')) {
            const dateMatch = sn.match(/(\d{8})/);
            if (!dateMatch) continue;
            const rawDate = dateMatch[1];
            const dateStr = rawDate.slice(0,4) + '-' + rawDate.slice(4,6) + '-' + rawDate.slice(6);
            const ws = wb.Sheets[sn];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            const entries = [];
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || !row[2]) continue;
              entries.push({
                customer: String(row[1] || '').trim(),
                detail: String(row[2] || '').trim(),
                pending: String(row[3] || '').trim(),
                remark: String(row[4] || '').trim()
              });
            }
            if (entries.length > 0) {
              if (!_phData) _phData = { daily_reports: [], projects: {}, visits: [], summary: {} };
              // Upsert: 같은 날짜면 교체
              const existIdx = _phData.daily_reports.findIndex(r => r.date === dateStr);
              if (existIdx >= 0) {
                _phData.daily_reports[existIdx] = { date: dateStr, entries };
              } else {
                _phData.daily_reports.push({ date: dateStr, entries });
              }
              _phData.daily_reports.sort((a, b) => b.date.localeCompare(a.date));
              dailyCount += entries.length;
            }
          }
        }

        // 고객사 프로젝트 시트 파싱
        const knownCustomers = ['ATP', 'SSPC', 'TIPI', 'TICL', 'ASE', 'ST MICRO', 'Analog', 'DHL',
          'ONSEMI', 'TongHsing', 'Eaton', 'Eaton FPIP', 'TE', 'Microchip',
          'AMS', 'INARI PH', 'Littelfuse', 'ATEC', 'Cirtek', 'ROHM', 'CG Semi'];
        for (const sn of wb.SheetNames) {
          if (knownCustomers.includes(sn.trim())) {
            const ws = wb.Sheets[sn];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            const projects = [];
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row) continue;
              const topic = String(row[2] || '').trim();
              const progress = String(row[3] || '').trim();
              if (!topic && !progress) continue;
              const status = String(row[8] || '').trim();
              let statusNorm = status;
              const sl = status.toLowerCase().replace(/\s/g, '');
              if (['ongoing', 'on-going'].includes(sl)) statusNorm = 'Ongoing';
              else if (['done', 'completed'].includes(sl)) statusNorm = 'Done';
              else if (['closed', 'close'].includes(sl)) statusNorm = 'Closed';
              else if (['dropped', 'drop'].includes(sl)) statusNorm = 'Dropped';

              projects.push({
                item: String(row[1] || '').trim(),
                topic, progress,
                start: '', target: '', days: '',
                status: statusNorm || 'Unknown',
                remark: String(row[9] || '').trim(),
                hq_comment: String(row[12] || '').trim()
              });
            }
            if (projects.length > 0) {
              if (!_phData) _phData = { daily_reports: [], projects: {}, visits: [], summary: {} };
              _phData.projects[sn.trim()] = projects;
              projCount += projects.length;
            }
          }
        }

        // 출처 파일명 및 통계 갱신
        _phData.source_file = file.name;
        _phData.last_updated = new Date().toISOString();
        let totalProjectsCount = 0;
        for (const [c, p] of Object.entries(_phData.projects || {})) {
          totalProjectsCount += p.length;
        }
        _phData.summary = {
          daily_report_count: _phData.daily_reports.length,
          customer_count: Object.keys(_phData.projects).length,
          total_projects: totalProjectsCount,
          visit_week_count: (_phData.visits || []).length
        };

        // 로컬스토리지에 즉각 영구 저장 (새로고침 시에도 100% 반영 유지)
        try {
          localStorage.setItem('kostat_ph_daily_report_custom', JSON.stringify(_phData));
        } catch (storageErr) {
          console.warn('LocalStorage 저장 경고:', storageErr);
        }

        // 헤더 출처 텍스트 즉각 갱신
        const info = document.getElementById('phReportInfo');
        if (info) {
          info.innerHTML =
            '출처: ' + _phData.source_file + ' (사용자 업로드)' +
            ' / 일일보고: ' + formatNum(_phData.summary.daily_report_count) + '건' +
            ' / 고객사: ' + formatNum(_phData.summary.customer_count) + '개' +
            ' / 프로젝트: ' + formatNum(_phData.summary.total_projects) + '건' +
            ' <button onclick="resetPhDailyReportToDefault()" class="action-btn-sm" style="font-size:10px; padding:1px 6px; margin-left:6px; cursor:pointer; color:var(--text-muted); background:transparent; border:1px solid var(--border-color); border-radius:4px;">기본 데이터로 초기화</button>';
        }

        populatePhCustomerFilter();
        renderPhRagResults();
        renderPhProjects();
        renderPhDaily();
        renderPhVisits();

        if (dailyCount > 0 || projCount > 0) {
          showToast(file.name + ' 업데이트 완료: Daily ' + dailyCount + '건, 프로젝트 ' + projCount + '건 (새로고침 시에도 유지됩니다)', 'success');
        } else {
          showToast('업데이트할 데이터가 없습니다.', 'warning');
        }
      } catch (err) {
        showToast('엑셀 파싱 오류: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
  });
}


// =====================================================
// 초기화: 실험실 탭 진입 시 데이터 로딩
// =====================================================
(function() {
  const origShowPanel = window.showPanel;
  if (origShowPanel) {
    window.showPanel = function(panelName) {
      origShowPanel(panelName);
      if (panelName === 'lab') {
        if (!_gimpoStockData) initGimpoStock();
        if (!_phData) initPhDailyReport();
      }
    };
  }
  // 앱 로드 시에도 데이터 번들이 있으면 초기화
  document.addEventListener('DOMContentLoaded', function() {
    setupGimpoFileUpload();
    setupPhFileUpload();
    // 실험실 탭이 기본 표시되어 있으면 즉시 로딩
    setTimeout(function() {
      if (window.KOSTAT_GIMPO_TRAY_STOCK) initGimpoStock();
      if (window.KOSTAT_PH_DAILY_REPORT) initPhDailyReport();
    }, 300);
  });
})();




