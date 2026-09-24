import { GasAdapter } from './adapters/GasAdapter.js';
import { MockAdapter } from './adapters/MockAdapter.js';
import { Parser } from './core/Parser.js';
import { ConflictDetector } from './core/ConflictDetector.js';
import { Storage } from './core/Storage.js';
import { TimetableView } from './ui/TimetableView.js';
import { TicketView } from './ui/TicketView.js';
import { FilterModal } from './ui/FilterModal.js';
import { SpecPopup } from './ui/SpecPopup.js';
import { HideShowsModal } from './ui/HideShowsModal.js';

// アプリケーション状態
let config = {};
let allShows = [];
let selectedIds = [];
let activeDay = '1日目';
let currentTypeFilter = 'ALL';
let heatmapData = {};
let heatmapDebounceTimer = null;
const hiddenShowTitles = new Set();
const unlockedShows = new Set();
const unlockedUrls = {};

// UIマネージャーのインスタンス
let timetableView;
let ticketView;
let filterModal;
let specPopup;
let hideShowsModal;

// Stepper状態
let currentDayIdx = 0;
let dayList = [];

function applyData(rawData) {
  if (rawData.heatmap) heatmapData = rawData.heatmap;
  if (rawData.easterEgg) window.easterEggData = rawData.easterEgg;

  // パース・正規化
  config = Parser.normalizeConfig(rawData.config || {});
  allShows = (rawData.shows || []).map((s, idx) => Parser.normalizeShow(s, idx));

  // UIコンポーネントの初期化
  initUIComponents();
  initAppDOM();
  timetableView.syncScrollbars();

  // 保存済みプランの復元
  const savedPlan = Storage.loadPlan(config.date || 'default');
  if (savedPlan && savedPlan.length > 0) {
    selectedIds = savedPlan.filter(id => allShows.some(s => s.id === id));
    updateUI();
  }
}

/**
 * アプリケーションの初期化
 */
async function bootstrap() {
  let isRenderedFromCache = false;

  // 1. キャッシュがあれば即座に初期化・描画（0秒化）
  try {
    const cachedData = Storage.loadTimetableCache();
    if (cachedData && cachedData.shows && cachedData.config) {
      applyData(cachedData);
      isRenderedFromCache = true;
    }
  } catch (err) {
    console.warn('Cache load error:', err);
  }

  // 2. ネットワークから最新データを取得
  const params = new URLSearchParams(window.location.search);
  const apiUrlParam = params.get('api');
  
  const adapter = (apiUrlParam || window.DEFAULT_API_URL)
    ? new GasAdapter(apiUrlParam || window.DEFAULT_API_URL)
    : new MockAdapter('./mock_data.json');

  try {
    const rawData = await adapter.fetchData();
    Storage.saveTimetableCache(rawData);

    if (!isRenderedFromCache) {
      applyData(rawData);
    } else {
      // キャッシュ描画済みの場合は最新公演情報（完売など）を安全に更新
      if (rawData.heatmap) heatmapData = rawData.heatmap;
      if (rawData.easterEgg) window.easterEggData = rawData.easterEgg;
      allShows = (rawData.shows || []).map((s, idx) => Parser.normalizeShow(s, idx));
      config = { ...config, ...Parser.normalizeConfig(rawData.config || {}) };
      if (typeof filterShows === 'function') {
        filterShows(activeDay);
      }
    }
  } catch (err) {
    if (!isRenderedFromCache) {
      console.error('Bootstrap Error:', err);
      showError('データの読み込みに失敗しました。時間をおいて再読み込みしてください。');
    } else {
      console.warn('Background sync failed:', err);
    }
  }
}

function initUIComponents() {
  timetableView = new TimetableView(config, toggleShow, promptLock);
  ticketView = new TicketView();
  specPopup = new SpecPopup();
  specPopup.setShows(allShows);

  filterModal = new FilterModal(() => {
    filterShows(activeDay);
  });
  filterModal.setContext(allShows, activeDay);

  hideShowsModal = new HideShowsModal(() => {
    filterShows(activeDay);
    updateUI();
  });
  hideShowsModal.setShows(allShows);
}

function showError(msg) {
  const loading = document.getElementById('loading-msg');
  if (loading) loading.classList.add('hidden');
  const errDiv = document.getElementById('error-msg');
  if (errDiv) {
    errDiv.innerText = msg;
    errDiv.classList.remove('hidden');
  }
}

function initAppDOM() {
  // CSS変数の更新
  if (config.mainColor) document.documentElement.style.setProperty('--main-color', config.mainColor);
  if (config.accentColor) document.documentElement.style.setProperty('--accent-color', config.accentColor);

  // メンテナンスモード
  if (config.isMaintenance) {
    document.getElementById('maintenance-screen')?.classList.remove('hidden');
    document.getElementById('app-container')?.classList.add('hidden');
    document.getElementById('selection-bar')?.classList.add('hidden');
    const mMsg = document.getElementById('maintenance-message');
    if (mMsg) mMsg.innerText = config.maintenanceMessage;
    return;
  }

  // タイトルとロゴ
  const fesTitleEl = document.getElementById('fes-title');
  const fesSubtitleEl = document.getElementById('fes-subtitle');
  if (fesTitleEl) fesTitleEl.innerText = config.title;
  if (fesSubtitleEl) {
    if (config.subtitle) {
      fesSubtitleEl.innerText = config.subtitle;
      fesSubtitleEl.style.display = 'block';
    } else {
      fesSubtitleEl.style.display = 'none';
    }
  }

  const finalLogoUrl = config.logoUrl || '';
  const logoEl = document.getElementById('modal-fes-logo');
  const modalTitleEl = document.getElementById('modal-fes-title');
  if (logoEl && modalTitleEl) {
    const modalTitle = config.title.includes('タイムテーブル')
      ? config.title.replace('タイムテーブル', 'My ハシゴテーブル')
      : `${config.title} My ハシゴテーブル`;

    if (finalLogoUrl) {
      logoEl.src = finalLogoUrl;
      logoEl.classList.remove('hidden');
      modalTitleEl.classList.add('hidden');
      logoEl.onerror = () => {
        logoEl.classList.add('hidden');
        modalTitleEl.classList.remove('hidden');
        modalTitleEl.innerText = modalTitle;
      };
      ticketView.preloadLogo(finalLogoUrl).then(b64 => {
        if (b64) ticketView.cachedLogoBase64 = b64;
      });
    } else {
      logoEl.classList.add('hidden');
      modalTitleEl.classList.remove('hidden');
      modalTitleEl.innerText = modalTitle;
    }
  }

  const hashtagEl = document.getElementById('modal-hashtag');
  if (hashtagEl) hashtagEl.innerText = config.hashtag;

  const modalDateEl = document.getElementById('modal-fes-date');
  if (modalDateEl) modalDateEl.innerText = ticketView.formatFesDate(config.displayDate || config.date);

  if (config.headerUrl) {
    const processed = Parser.convertDriveUrl(config.headerUrl);
    const hBg = document.getElementById('header-bg');
    if (hBg) hBg.style.backgroundImage = `url('${processed}')`;
  }

  document.getElementById('loading-msg')?.classList.add('hidden');

  // 日程タブの生成
  const dayTabsContainer = document.getElementById('day-tabs-container');
  if (config.numDays >= 2 && dayTabsContainer) {
    let tabsHtml = '';
    const days = [];
    for (let i = 1; i <= config.numDays; i++) {
      days.push({ value: `${i}日目`, label: config.dayLabels[i - 1] || `${i}日目` });
    }
    days.forEach((dayObj, i) => {
      tabsHtml += `<button onclick="filterShows('${dayObj.value}')" id="day-tab-${dayObj.value}" class="day-tab-btn px-3 py-2.5 md:px-4 rounded-full text-[11px] font-black transition-all whitespace-nowrap ${i === 0 ? 'bg-main text-white shadow-md' : 'text-slate-500 hover:bg-white/60'}">${dayObj.label}</button>`;
    });
    dayTabsContainer.innerHTML = tabsHtml;
    dayTabsContainer.classList.remove('hidden');
    activeDay = days[0].value;
    initPlayfulStepper();
  } else {
    activeDay = '1日目';
  }

  // タイプフィルター
  const filterContainer = document.getElementById('filter-buttons-container');
  const hasDayShow = allShows.some(s => s.reserveType.includes('当日受付') || s.reserveType.startsWith('当日'));
  if (hasDayShow && filterContainer) {
    filterContainer.innerHTML = `
      <button onclick="applyTypeFilter('ALL')" id="filter-btn-ALL" class="filter-btn active-filter bg-main text-white shadow-md px-3 py-2.5 md:px-4 rounded-full text-[11px] font-black transition-all whitespace-nowrap">すべて</button>
      <button onclick="applyTypeFilter('事前予約')" id="filter-btn-PRE" class="filter-btn text-slate-500 hover:bg-white/60 px-3 py-2.5 md:px-4 rounded-full text-[11px] font-black transition-all whitespace-nowrap">事前予約</button>
      <button onclick="applyTypeFilter('当日受付(ファミレス式)')" id="filter-btn-DAY" class="filter-btn text-slate-500 hover:bg-white/60 px-3 py-2.5 md:px-4 rounded-full text-[11px] font-black transition-all whitespace-nowrap">当日受付</button>
    `;
    filterContainer.classList.remove('hidden');
  }

  // 時間軸
  const axis = document.getElementById('time-axis');
  if (axis) {
    axis.innerHTML = '';
    for (let i = config.startHour; i <= config.endHour; i++) {
      axis.innerHTML += `<div style="height:${timetableView.PIXELS_PER_HOUR}px" class="flex items-start justify-center pt-1 border-t border-slate-100/50 text-slate-400 font-bold text-sm">${i}:00</div>`;
    }
  }

  // グリッド背景刻み
  const stepPx = config.stepMin * (timetableView.PIXELS_PER_HOUR / 60);
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `.venue-col { background-size: 100% ${stepPx}px !important; }`;
  document.head.appendChild(styleEl);

  filterShows(activeDay);
}

// ==========================================
// --- ステッパー（DAYセレクター） ---
// ==========================================
function initPlayfulStepper() {
  const dayTabs = document.querySelectorAll('#day-tabs-container .day-tab-btn');
  if (!dayTabs || dayTabs.length === 0) return;
  dayList = [];
  dayTabs.forEach((tab, i) => {
    dayList.push({
      value: `${i + 1}日目`,
      badge: `DAY ${i + 1}`,
      label: tab.innerText.trim(),
      origBtn: tab
    });
  });
  updateStepperUI();
}

function stepDay(delta) {
  if (dayList.length <= 1) return;
  currentDayIdx += delta;
  if (currentDayIdx < 0) currentDayIdx = 0;
  if (currentDayIdx >= dayList.length) currentDayIdx = dayList.length - 1;

  updateStepperUI();

  if (dayList[currentDayIdx]) {
    filterShows(dayList[currentDayIdx].value);
  }
}

function updateStepperUI() {
  if (dayList.length === 0) return;
  const cur = dayList[currentDayIdx];
  const badgeEl = document.getElementById('stepper-day-badge');
  const labelEl = document.getElementById('stepper-day-label');
  const prevBtn = document.getElementById('day-prev-btn');
  const nextBtn = document.getElementById('day-next-btn');
  const dotsEl = document.getElementById('stepper-dots');

  if (badgeEl) badgeEl.innerText = cur.badge;
  if (labelEl) labelEl.innerText = cur.label;
  if (prevBtn) prevBtn.disabled = (currentDayIdx === 0);
  if (nextBtn) nextBtn.disabled = (currentDayIdx === dayList.length - 1);

  if (dotsEl) {
    dotsEl.innerHTML = dayList.map((_, i) =>
      `<span class="dot ${i === currentDayIdx ? 'active' : ''}"></span>`
    ).join('');
  }
}

// ==========================================
// --- フィルター・表示切り替え ---
// ==========================================
function filterShows(day) {
  activeDay = day;
  filterModal.setContext(allShows, activeDay);
  filterModal.updateTriggerBtn();

  // DAYタブのスタイル更新
  document.querySelectorAll('.day-tab-btn').forEach(btn => {
    btn.classList.remove('bg-main', 'text-white', 'shadow-md');
    btn.classList.add('text-slate-500', 'hover:bg-white/60');
  });
  const currentTab = document.getElementById(`day-tab-${day}`);
  if (currentTab) {
    currentTab.classList.remove('text-slate-500', 'hover:bg-white/60');
    currentTab.classList.add('bg-main', 'text-white', 'shadow-md');
  }

  // ステッパーとのインデックス同期
  const foundIdx = dayList.findIndex(d => d.value === day);
  if (foundIdx !== -1 && foundIdx !== currentDayIdx) {
    currentDayIdx = foundIdx;
    updateStepperUI();
  }

  // 対象公演の抽出（日程・非表示・フィルターモーダル）
  const targetShows = allShows.filter(s => {
    if (s.day !== day) return false;
    if (hiddenShowTitles.has(s.title)) return false;
    return filterModal.doesShowMatchFilter(s);
  });

  timetableView.render(targetShows, heatmapData, unlockedShows, unlockedUrls, selectedIds);
  applyTypeFilter(currentTypeFilter);
  updateUI();
}

function applyTypeFilter(type) {
  currentTypeFilter = type;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('bg-main', 'text-white', 'shadow-md');
    btn.classList.add('text-slate-500', 'hover:bg-white/60');
  });
  const activeBtn = document.getElementById(type === 'ALL' ? 'filter-btn-ALL' : (type === '事前予約' ? 'filter-btn-PRE' : 'filter-btn-DAY'));
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-500', 'hover:bg-white/60');
    activeBtn.classList.add('bg-main', 'text-white', 'shadow-md');
  }

  document.querySelectorAll('.venue-col').forEach(col => {
    const res = col.getAttribute('data-reservation') || '';
    let show = true;
    if (type === '事前予約') show = res === '事前予約';
    else if (type === '当日受付(ファミレス式)') show = res.includes('当日受付') || res.startsWith('当日');
    col.style.display = show ? '' : 'none';
  });

  const topScrollContent = document.getElementById('top-scrollbar-content');
  const container = document.getElementById('table-container');
  if (topScrollContent && container) {
    setTimeout(() => {
      topScrollContent.style.width = container.scrollWidth + 'px';
    }, 100);
  }
}

// ==========================================
// --- 公演選択とハシゴ管理 ---
// ==========================================
function toggleShow(id, event) {
  if (event) event.stopPropagation();
  const show = allShows.find(s => s.id === id);
  if (!show) return;

  if (show.isSoldOut && !config.allowSoldOutSelect) return;

  const card = document.getElementById(`card-${id}`);
  const idx = selectedIds.indexOf(id);

  if (idx > -1) {
    selectedIds.splice(idx, 1);
    if (card) card.classList.remove('selected-card');
  } else {
    selectedIds.push(id);
    if (card) card.classList.add('selected-card');
  }

  Storage.savePlan(config.date || 'default', selectedIds);
  updateUI();

  // ヒートマップ送信（デバウンス）
  clearTimeout(heatmapDebounceTimer);
  heatmapDebounceTimer = setTimeout(() => sendHeatmapData(), 3000);
}

function updateUI() {
  const showsMap = new Map(allShows.map(s => [s.id, s]));
  const { conflictIds, hasConflict } = ConflictDetector.findConflicts(selectedIds, showsMap, config.allowZeroMinTransfer);

  // 全カードの重複スタイル更新
  allShows.forEach(s => {
    const card = document.getElementById(`card-${s.id}`);
    if (card) {
      if (conflictIds.has(s.id)) {
        card.classList.add('conflict');
      } else {
        card.classList.remove('conflict');
      }
    }
  });

  const conflictWarn = document.getElementById('conflict-warning');
  if (conflictWarn) conflictWarn.classList.toggle('hidden', !hasConflict);

  const bar = document.getElementById('selection-bar');
  if (bar) {
    bar.classList.toggle('translate-y-64', selectedIds.length === 0);
    bar.classList.toggle('translate-y-0', selectedIds.length > 0);
  }

  // 選択中アイテムの描画
  const container = document.getElementById('selected-items');
  if (container) {
    container.innerHTML = selectedIds.map(sid => {
      const s = showsMap.get(sid);
      if (!s) return '';
      const displayTime = s.reserveType === '当日受付(ファミレス式)' ? '随時' : s.startTime;
      const isConflict = conflictIds.has(sid);
      const conflictBorder = isConflict ? 'border-red-500 bg-red-50 text-red-700' : 'border-main/20 bg-white text-main';

      return `
        <div class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold shadow-sm ${conflictBorder}">
          <span class="font-black">${displayTime}</span>
          <span class="max-w-[120px] truncate">${s.title}</span>
          <button onclick="toggleShow('${sid}', event)" class="hover:text-red-500 flex items-center ml-1">
            <span class="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>`;
    }).join('');
  }

  const countBadge = document.getElementById('selection-count');
  if (countBadge) countBadge.innerText = `${selectedIds.length}公演選択中`;
}

function clearSelection() {
  selectedIds.forEach(id => {
    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.classList.remove('selected-card', 'conflict');
    }
  });
  selectedIds = [];
  Storage.savePlan(config.date || 'default', selectedIds);
  updateUI();
}

// ==========================================
// --- ハシゴモーダル & 画像保存 ---
// ==========================================
function showHashigoTable() {
  ticketView.setContext(config, allShows, selectedIds);
  ticketView.show();
}

function closeModal() {
  ticketView.close();
}

async function downloadScheduleImage() {
  await ticketView.downloadImage();
}

async function shareScheduleImage() {
  await ticketView.shareImage();
}

// ==========================================
// --- ヒートマップ & イースターエッグ ---
// ==========================================
async function sendHeatmapData() {
  // 本番API_URLが存在する場合のみ送信
  const apiUrl = (new URLSearchParams(window.location.search)).get('api') || window.DEFAULT_API_URL;
  if (!apiUrl) return;

  const uid = Storage.getHeatmapUserId();
  try {
    await fetch(apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'heatmap',
        userId: uid,
        selectedIds: selectedIds
      })
    });
  } catch (e) {
    console.warn('Heatmap send error:', e);
  }
}

function promptLock(groupKey, encryptedData, event) {
  if (event) event.stopPropagation();
  const pass = prompt('南京錠を解除するパスワードを入力してください:');
  if (!pass) return;

  try {
    const decrypted = xorDecryptB64(encryptedData, pass);
    if (decrypted && decrypted.startsWith('http')) {
      unlockedShows.add(groupKey);
      unlockedUrls[groupKey] = decrypted;
      alert('ロックが解除されました！');
      filterShows(activeDay);
    } else {
      alert('パスワードが正しくありません。');
    }
  } catch (e) {
    alert('パスワードが正しくありません。');
  }
}

function xorDecryptB64(b64, key) {
  if (!b64 || !key) return '';
  const decoded = atob(b64);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ==========================================
// --- グローバル (window) へのバインド ---
// (HTML内のインライン onclick 属性との完全互換)
// ==========================================
window.toggleShow = toggleShow;
window.clearSelection = clearSelection;
window.showHashigoTable = showHashigoTable;
window.closeModal = closeModal;
window.downloadScheduleImage = downloadScheduleImage;
window.shareScheduleImage = shareScheduleImage;
window.filterShows = filterShows;
window.applyTypeFilter = applyTypeFilter;
window.stepDay = stepDay;
window.promptLock = promptLock;

// フィルターモーダル関連
window.openFilterModal = () => filterModal.open();
window.closeFilterModal = () => filterModal.close();
window.applyFilterModal = () => filterModal.apply();
window.resetFilterForm = () => filterModal.reset();
window.toggleDiffPicker = (e) => filterModal.toggleDiffPicker(e);
window.pickDifficulty = (n) => filterModal.pickDifficulty(n);
window.stepDifficulty = (d) => filterModal.stepDifficulty(d);
window.selectDifficulty = (d) => filterModal.selectDifficulty(d);
window.selectDiffOp = (op) => filterModal.selectDiffOp(op);

// 非表示モーダル関連
window.openHideShowsModal = () => hideShowsModal.open();
window.closeHideShowsModal = () => hideShowsModal.close();
window.applyHiddenShows = () => hideShowsModal.apply();
window.resetHideShowsModal = () => hideShowsModal.reset();

// スペックポップアップ関連
window.toggleShowDetail = (e, title, el) => specPopup.toggle(e, title, el);
window.closeShowDetail = () => specPopup.close();

// 起動
document.addEventListener('DOMContentLoaded', bootstrap);
