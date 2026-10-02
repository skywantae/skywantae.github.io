/**
 * KOSTAT ERP Mobile WebApp - Firebase Authentication & RBAC Authority Module
 * 
 * 최고 관리자: teokim@kostat.com
 * 기능: 사내 승인제 회원가입, 자동 로그인, 사용자별 탭 열람 권한 통제, 복수 관리자 지정
 */

(function () {
  'use strict';

  // 1. Firebase SDK Configuration
  const firebaseConfig = {
    apiKey: "AIzaSyDhycO_B02zQZoBVOMWO762Q0LFyY5N8dc",
    authDomain: "kostat-chatbot.firebaseapp.com",
    projectId: "kostat-chatbot",
    storageBucket: "kostat-chatbot.firebasestorage.app",
    messagingSenderId: "1042890487334",
    appId: "1:1042890487334:web:3ba9d88536a1d83b0718e7"
  };

  // 전역 초기화 여부 확인
  let app, auth, db;
  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
      } else {
        app = firebase.app();
      }
      auth = firebase.auth();
      db = firebase.firestore();

      // 자동 로그인 (영구 로컬 스토리지 세션 유지)
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(function (err) {
          console.warn('[Firebase] setPersistence error:', err);
        });
    } else {
      console.error('[Firebase] Firebase SDK is not loaded.');
    }
  } catch (e) {
    console.error('[Firebase] Init error:', e);
  }

  // 2. 전체 탭 목록 정의 (시스템 기준)
  const SYSTEM_TABS = [
    { id: 'viewShipPlan', name: '출하 계획', defaultAllowed: true },
    { id: 'viewQuotations', name: '견적서', defaultAllowed: true },
    { id: 'viewContractReviews', name: '계약검토서', defaultAllowed: false },
    { id: 'viewStock', name: '재고 현황리스트', defaultAllowed: true },
    { id: 'viewWeeklyReport', name: '주간보고서', defaultAllowed: true },
    { id: 'viewFeedback', name: '기능 요청', defaultAllowed: true },
    { id: 'viewChatbot', name: 'FAQ 챗봇', defaultAllowed: true },
    { id: 'viewFaq', name: '사내 FAQ', defaultAllowed: true },
    { id: 'viewArchive', name: '자료실', defaultAllowed: true },
    { id: 'viewLab', name: '실험실', defaultAllowed: false }
  ];

  // 최고 관리자 마스터 목록 (코드 레벨 영구 보호)
  const MASTER_SUPER_ADMINS = ['teokim@kostat.com'];

  // 기본 권한 탭 목록 추출
  function getDefaultTabs() {
    return SYSTEM_TABS.filter(function (t) { return t.defaultAllowed; }).map(function (t) { return t.id; });
  }

  // 전체 권한 탭 목록 추출
  function getAllTabs() {
    return SYSTEM_TABS.map(function (t) { return t.id; });
  }

  // 3. KostatAuth 전역 매니저 객체
  const KostatAuth = {
    app: app,
    auth: auth,
    db: db,
    systemTabs: SYSTEM_TABS,
    masterSuperAdmins: MASTER_SUPER_ADMINS,
    currentUser: null, // Firebase Auth User
    userProfile: null, // Firestore Document Data
    authListeners: [],

    // 초기화 및 인증 상태 리스너 등록
    init: function () {
      if (!auth || !db) return;
      const self = this;

      auth.onAuthStateChanged(function (user) {
        self.currentUser = user;
        if (user) {
          self.loadUserProfile(user.uid, user.email, function (profile) {
            self.userProfile = profile;
            self.notifyListeners();
          });
        } else {
          self.userProfile = null;
          self.notifyListeners();
        }
      });
    },

    // 인증 상태 변경 리스너 구독
    onAuthStateChanged: function (callback) {
      if (typeof callback === 'function') {
        this.authListeners.push(callback);
        // 이미 로드된 상태면 즉시 1회 호출
        if (this.currentUser !== undefined) {
          callback(this.currentUser, this.userProfile);
        }
      }
    },

    notifyListeners: function () {
      const user = this.currentUser;
      const profile = this.userProfile;
      this.authListeners.forEach(function (cb) {
        try { cb(user, profile); } catch (e) { console.error('[AuthListener error]', e); }
      });
    },

    // Firestore 프로필 로드 (마스터 관리자 자동 승인 처리 포함)
    loadUserProfile: function (uid, email, callback) {
      const self = this;
      const lowerEmail = (email || '').toLowerCase().trim();
      const isMaster = MASTER_SUPER_ADMINS.includes(lowerEmail);

      const userRef = db.collection('users').doc(uid);
      userRef.get().then(function (doc) {
        let profile = null;
        if (doc.exists) {
          profile = doc.data();
          // 마스터 관리자 영구 보호: 무조건 super_admin 및 approved 유지
          if (isMaster && (profile.role !== 'super_admin' || profile.status !== 'approved')) {
            profile.role = 'super_admin';
            profile.status = 'approved';
            profile.allowedTabs = getAllTabs();
            userRef.set(profile, { merge: true });
          }
        } else {
          // 신규 사용자 프로필 생성
          profile = {
            uid: uid,
            email: lowerEmail,
            name: (self.currentUser && self.currentUser.displayName) || lowerEmail.split('@')[0],
            department: isMaster ? '시스템 관리' : '미지정',
            role: isMaster ? 'super_admin' : 'user',
            status: isMaster ? 'approved' : 'pending',
            allowedTabs: isMaster ? getAllTabs() : getDefaultTabs(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          userRef.set(profile);
        }

        // 로그인 시간 갱신
        userRef.update({
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function () {});

        if (callback) callback(profile);
      }).catch(function (err) {
        console.error('[Firebase] loadUserProfile error:', err);
        if (isMaster) {
          const fallbackMaster = {
            uid: uid,
            email: lowerEmail,
            name: '마스터 관리자',
            department: '시스템 관리',
            role: 'super_admin',
            status: 'approved',
            allowedTabs: getAllTabs()
          };
          if (callback) callback(fallbackMaster);
        } else {
          if (callback) callback(null);
        }
      });
    },

    // 로그인 실행 (자동 로그인 rememberMe 지원)
    login: function (email, password, rememberMe) {
      if (!auth) return Promise.reject(new Error('Firebase Auth가 초기화되지 않았습니다.'));
      const persistence = (rememberMe !== false)
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;

      return auth.setPersistence(persistence).then(function () {
        return auth.signInWithEmailAndPassword(email.trim(), password);
      });
    },

    // 회원가입 실행 (사내 승인제: 가입 직후 status = pending)
    register: function (email, password, name, department) {
      if (!auth || !db) return Promise.reject(new Error('Firebase가 초기화되지 않았습니다.'));
      const self = this;
      const lowerEmail = email.toLowerCase().trim();
      const isMaster = MASTER_SUPER_ADMINS.includes(lowerEmail);

      return auth.createUserWithEmailAndPassword(lowerEmail, password).then(function (cred) {
        const user = cred.user;
        const profile = {
          uid: user.uid,
          email: lowerEmail,
          name: name.trim() || lowerEmail.split('@')[0],
          department: department.trim() || '미지정',
          role: isMaster ? 'super_admin' : 'user',
          status: isMaster ? 'approved' : 'pending',
          allowedTabs: isMaster ? getAllTabs() : getDefaultTabs(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Firebase Auth displayName 업데이트
        if (name) {
          user.updateProfile({ displayName: name.trim() }).catch(function () {});
        }

        return db.collection('users').doc(user.uid).set(profile).then(function () {
          self.userProfile = profile;
          return { user: user, profile: profile };
        });
      });
    },

    // 로그아웃 실행
    logout: function () {
      if (!auth) return Promise.resolve();
      const self = this;
      return auth.signOut().then(function () {
        self.currentUser = null;
        self.userProfile = null;
        self.notifyListeners();
      });
    },

    // 비밀번호 재설정 이메일 전송
    resetPassword: function (email) {
      if (!auth) return Promise.reject(new Error('Firebase Auth가 초기화되지 않았습니다.'));
      return auth.sendPasswordResetEmail(email.trim());
    },

    // 권한 확인 헬퍼 함수들
    isLoggedIn: function () {
      return !!this.currentUser;
    },

    isApproved: function () {
      if (!this.currentUser) return false;
      const email = (this.currentUser.email || '').toLowerCase().trim();
      if (MASTER_SUPER_ADMINS.includes(email)) return true;
      return this.userProfile && this.userProfile.status === 'approved';
    },

    isSuperAdmin: function () {
      if (!this.currentUser) return false;
      const email = (this.currentUser.email || '').toLowerCase().trim();
      if (MASTER_SUPER_ADMINS.includes(email)) return true;
      return this.userProfile && this.userProfile.role === 'super_admin';
    },

    isAdmin: function () {
      if (!this.currentUser) return false;
      if (this.isSuperAdmin()) return true;
      return this.userProfile && (this.userProfile.role === 'admin' || this.userProfile.role === 'super_admin');
    },

    // 특정 탭 열람 권한이 있는지 확인
    canAccessTab: function (tabTargetId) {
      if (!this.currentUser) return false;
      // 미승인 사용자는 어떠한 탭도 접근 불가
      if (!this.isApproved()) return false;
      // 관리자는 모든 탭 열람 가능
      if (this.isAdmin()) return true;

      // 일반 승인 사용자: allowedTabs 목록 검사
      if (this.userProfile && Array.isArray(this.userProfile.allowedTabs)) {
        return this.userProfile.allowedTabs.includes(tabTargetId);
      }
      return false;
    },

    // 관리자 기능: 전체 사용자 목록 실시간/단회 조회
    fetchUsers: function (callback) {
      if (!db) return Promise.reject(new Error('Firestore가 연결되지 않았습니다.'));
      if (!this.isAdmin()) return Promise.reject(new Error('관리자 권한이 필요합니다.'));

      return db.collection('users').orderBy('createdAt', 'desc').get().then(function (snapshot) {
        const users = [];
        snapshot.forEach(function (doc) {
          users.push(doc.data());
        });
        if (callback) callback(users);
        return users;
      });
    },

    // 관리자 기능: 사용자 권한 및 탭 설정 업데이트
    updateUserPermissions: function (targetUid, updates) {
      if (!db) return Promise.reject(new Error('Firestore가 연결되지 않았습니다.'));
      if (!this.isAdmin()) return Promise.reject(new Error('관리자 권한이 필요합니다.'));

      updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      updates.updatedBy = (this.currentUser && this.currentUser.email) || 'admin';

      return db.collection('users').doc(targetUid).update(updates);
    },

    // 관리자 기능: 사용자 삭제
    deleteUserRecord: function (targetUid) {
      if (!db) return Promise.reject(new Error('Firestore가 연결되지 않았습니다.'));
      if (!this.isAdmin()) return Promise.reject(new Error('관리자 권한이 필요합니다.'));

      return db.collection('users').doc(targetUid).delete();
    }
  };

  // 브라우저 로드 시 자동 초기화
  if (typeof window !== 'undefined') {
    window.KostatAuth = KostatAuth;
    document.addEventListener('DOMContentLoaded', function () {
      KostatAuth.init();
    });
  }
})();
