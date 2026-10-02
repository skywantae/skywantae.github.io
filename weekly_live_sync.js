/**
 * KOSTAT ERP Mobile WebApp - Weekly Report Live Sync Module (Firestore Realtime)
 * 
 * 기능: Firestore onSnapshot 기반 실시간 동시 열람 및 양방향 동기화
 * 대상 컬렉션/문서: weekly_reports/live
 */

(function () {
  'use strict';

  const WeeklyLiveSync = {
    db: null,
    unsubscribe: null,
    isLocalUpdating: false,
    updateTimer: null,
    lastRemoteTimestamp: 0,
    callbacks: [],

    init: function () {
      if (typeof firebase === 'undefined' || !firebase.firestore) return;
      this.db = firebase.firestore();
      this.subscribeLiveDoc();
    },

    // Firestore 실시간 변경 리스너 구독
    subscribeLiveDoc: function () {
      if (!this.db) return;
      const self = this;

      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }

      const docRef = this.db.collection('weekly_reports').doc('live');
      this.unsubscribe = docRef.onSnapshot(function (doc) {
        if (!doc.exists) return;
        const data = doc.data();
        if (!data) return;

        // 로컬에서 방금 업데이트를 요청한 직후의 에코 이벤트는 스킵
        if (self.isLocalUpdating) {
          return;
        }

        // 원격 데이터가 들어오면 등록된 콜백들에게 통지
        self.notifyCallbacks(data);
      }, function (err) {
        console.warn('[WeeklyLiveSync] Snapshot listen error:', err);
      });
    },

    // 실시간 데이터 변경 콜백 등록
    onDataChanged: function (callback) {
      if (typeof callback === 'function') {
        this.callbacks.push(callback);
      }
    },

    notifyCallbacks: function (data) {
      this.callbacks.forEach(function (cb) {
        try { cb(data); } catch (e) { console.error('[WeeklyLiveSync callback error]', e); }
      });
    },

    // 로컬 변경사항을 Firestore에 실시간 반영 (디바운스 500ms)
    pushLiveUpdate: function (reportPayload) {
      if (!this.db) return;
      const self = this;

      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
      }

      this.updateTimer = setTimeout(function () {
        self.isLocalUpdating = true;
        const user = (window.KostatAuth && window.KostatAuth.currentUser) || {};
        const profile = (window.KostatAuth && window.KostatAuth.userProfile) || {};

        const docRef = self.db.collection('weekly_reports').doc('live');
        const updateData = {
          content: reportPayload,
          lastEditorName: profile.name || user.email || '익명',
          lastEditorEmail: user.email || '',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        docRef.set(updateData, { merge: true }).then(function () {
          setTimeout(function () {
            self.isLocalUpdating = false;
          }, 300);
        }).catch(function (err) {
          self.isLocalUpdating = false;
          console.error('[WeeklyLiveSync] pushLiveUpdate error:', err);
        });
      }, 500);
    }
  };

  if (typeof window !== 'undefined') {
    window.WeeklyLiveSync = WeeklyLiveSync;
    document.addEventListener('DOMContentLoaded', function () {
      WeeklyLiveSync.init();
    });
  }
})();
