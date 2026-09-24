/**
 * LocalStorageの管理クラス（選択状態・ユーザーID・プランの永続化）
 */
export class Storage {
  static getHeatmapUserId() {
    try {
      let uid = localStorage.getItem('heatmap_user_id');
      if (!uid) {
        uid = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('heatmap_user_id', uid);
      }
      return uid;
    } catch (e) {
      return 'user_temp_' + Math.random().toString(36).substr(2, 9);
    }
  }

  static savePlan(eventId, selectedIds) {
    try {
      localStorage.setItem(`plan_${eventId}`, JSON.stringify(selectedIds));
    } catch (e) {
      console.warn('Failed to save plan to localStorage:', e);
    }
  }

  static saveTimetableCache(data) {
    try {
      localStorage.setItem('saiensai16_timetable_cache', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save timetable cache:', e);
    }
  }

  static loadTimetableCache() {
    try {
      const raw = localStorage.getItem('saiensai16_timetable_cache');
      if (!raw) return null;
      const cleanJson = raw.trim().replace(/^\uFEFF/, '');
      return JSON.parse(cleanJson);
    } catch (e) {
      console.warn('Failed to load timetable cache:', e);
      return null;
    }
  }
}
