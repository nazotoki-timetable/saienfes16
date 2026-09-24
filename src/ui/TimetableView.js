import { Parser } from '../core/Parser.js';

/**
 * メインタイムテーブル（ガントチャート風グリッド）の描画 & スクロール同期
 */
export class TimetableView {
  constructor(config, onToggleShowCallback, onPromptLockCallback) {
    this.config = config;
    this.onToggleShow = onToggleShowCallback;
    this.onPromptLock = onPromptLockCallback;
    this.HEADER_OFFSET = 254;
    this.PIXELS_PER_HOUR = 70;
    this.colors = [
      { text: "text-blue-800", bg: "bg-blue-100", border: "border-blue-200", accent: "text-blue-500", phaseBg: "bg-blue-300", phaseText: "text-blue-900" },
      { text: "text-indigo-800", bg: "bg-indigo-100", border: "border-indigo-200", accent: "text-indigo-500", phaseBg: "bg-indigo-300", phaseText: "text-indigo-900" },
      { text: "text-emerald-800", bg: "bg-emerald-100", border: "border-emerald-200", accent: "text-emerald-500", phaseBg: "bg-emerald-300", phaseText: "text-emerald-900" },
      { text: "text-orange-800", bg: "bg-orange-100", border: "border-orange-200", accent: "text-orange-500", phaseBg: "bg-orange-300", phaseText: "text-orange-900" },
      { text: "text-pink-800", bg: "bg-pink-100", border: "border-pink-200", accent: "text-pink-500", phaseBg: "bg-pink-300", phaseText: "text-pink-900" }
    ];
  }

  render(shows, heatmapData = {}, unlockedShows = new Set(), unlockedUrls = {}, selectedIds = []) {
    const container = document.getElementById('table-container');
    if (container) container.classList.remove('hidden');

    const grid = document.getElementById('timetable-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const titles = [...new Set(shows.map(s => s.title || s['公演名']))].filter(Boolean);
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const titleSizeClass = isIOS ? "text-[11px]" : "text-[13px]";
    const infoSizeClass = isIOS ? "text-[8.5px]" : "text-[9.5px]";
    const cSize = isIOS ? "text-[7px]" : "text-[8px]";
    const headerHeightClass = isIOS ? "h-[258px]" : "h-[244px]";
    const currentHeaderOffset = isIOS ? 268 : 254;

    const colHtmls = [];

    titles.forEach((title, index) => {
      const groupShows = shows.filter(s => (s.title || s['公演名']) === title);
      const base = groupShows[0];
      const c = this.colors[index % this.colors.length];
      const columnHeight = (this.config.endHour - this.config.startHour + 1) * this.PIXELS_PER_HOUR + currentHeaderOffset;

      const imageUrl = base.visualThumbnail || Parser.convertDriveUrl(base['公演ビジュアルURL'] || base['ビジュアルURL'], true);
      const isHeaderNoise = base.noiseEffect === true || String(base.noiseEffect).toUpperCase() === 'TRUE';

      const groupKey = String(base.id || index);
      const isGroupUnlocked = unlockedShows.has(groupKey);
      const hasLockConfig = (base.password || base['_encryptedData'] || '') !== '' || String(base['南京錠パスワード'] || '') === 'LOCKED_FLAG';
      const lockPassword = String(base.password || base['_encryptedData'] || '');
      const hasLock = hasLockConfig && !isGroupUnlocked;

      const capacity = base.capacity || base['定員'] || '-';
      const durationDisplay = base.displayDuration || `${base.durationMin || 30}分`;
      const circle = base.groupName || base['団体名'] || '不明';

      const reserveUrl = isGroupUnlocked && unlockedUrls[groupKey] ? unlockedUrls[groupKey] : (base.reserveUrl || base['予約URL']);
      const isFamilyStyle = base.reserveType === '当日受付(ファミレス式)';

      let visualHtml = '';
      if (imageUrl) {
        if (isHeaderNoise) {
          visualHtml = `
            <div class="relative flex-shrink-0 program-visual border-0 bg-slate-50 p-0 w-auto h-auto shadow-none overflow-hidden rounded">
              <img src="${imageUrl}" class="h-[110px] w-auto max-w-[140px] object-contain rounded mystic-blur saturate-50" alt="visual">
              <div class="absolute inset-0 mystic-shimmer pointer-events-none"></div>
            </div>`;
        } else {
          visualHtml = `<img src="${imageUrl}" class="program-visual" alt="visual">`;
        }
      } else {
        visualHtml = `<div class="program-visual flex items-center justify-center text-[10px] text-slate-300 font-bold italic text-center leading-tight w-20">No Visual</div>`;
      }

      let titleHtml = `<h3 class="font-[900] ${titleSizeClass} leading-[1.3] text-main break-words whitespace-pre-wrap">${title}</h3>`;
      if (isHeaderNoise) {
        titleHtml = `<h3 class="font-[900] ${titleSizeClass} leading-[1.3] mystic-text break-words whitespace-pre-wrap select-none">${title}</h3>`;
      }

      const safeEncryptedForHeader = lockPassword.replace(/'/g, "\\'");

      let buttonHtml = `<div class="h-8"></div>`;
      if (isFamilyStyle) {
        buttonHtml = `<div class="w-full bg-orange-50 border border-orange-200 text-orange-600 text-[10px] font-bold py-1.5 rounded flex items-center justify-center uppercase tracking-tighter cursor-default">当日現地受付</div>`;
      } else if (hasLock) {
        buttonHtml = `<button onclick="promptLock('${groupKey}', '${safeEncryptedForHeader}')" class="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 transition-all uppercase tracking-tighter active:scale-95 shadow-sm"><span class="material-symbols-outlined text-[14px] text-accent">lock</span>LOCKED</button>`;
      } else if (isHeaderNoise) {
        buttonHtml = `<button disabled class="w-full bg-slate-50 border border-slate-200 text-slate-400 text-[11px] font-bold py-1.5 rounded flex items-center justify-center transition-all uppercase tracking-tighter cursor-not-allowed">LOCKED</button>`;
      } else if (reserveUrl) {
        buttonHtml = `<a href="${reserveUrl}" target="_blank" class="w-full bg-blue-50 border border-main/40 hover:bg-main/5 text-main text-[11px] font-bold py-1.5 rounded flex items-center justify-center transition-all uppercase tracking-tighter active:scale-95 shadow-sm">予約する</a>`;
      }

      let priceHtml = '';
      if (base.fee !== undefined && base.fee !== '') {
        const priceVal = base.fee;
        const priceText = isNaN(priceVal) ? priceVal : `${priceVal}円`;
        priceHtml = `
          <div class="flex items-center gap-1.5 text-slate-400 font-medium">
            <span>料金:</span> <span class="text-main font-black">${priceText}</span>
          </div>`;
      }

      let colHtml = `
      <div class="venue-col border-r border-slate-100" style="height:${columnHeight}px" data-reservation="${base.reserveType}">
        <div class="timetable-header sticky top-0 bg-white/95 backdrop-blur-md px-2 py-3 z-30 ${headerHeightClass} flex flex-col border-b border-slate-200 shadow-sm overflow-hidden text-left relative">
          ${isHeaderNoise ? '<div class="absolute inset-0 bg-white/40 backdrop-blur-[2px] pointer-events-none z-0"></div>' : ''}
          <div class="relative z-10 flex gap-2 items-start mb-2">
            <div class="w-[80px] flex-none">
              <div class="${cSize} font-black ${c.text} opacity-80 bg-white border ${c.border} px-1.5 py-0.5 rounded inline-block mb-1.5 tracking-widest leading-none break-words whitespace-pre-wrap">${circle}</div>
              ${titleHtml}
            </div>
            ${visualHtml}
          </div>

          <div onclick="toggleShowDetail(event, '${encodeURIComponent(title).replace(/'/g, "%27")}', this)"
            class="show-spec-card relative z-10 p-1.5 rounded-[4px] bg-[#faf9fd] hover:bg-[#f3e8ff]/50 border border-[#16131d]/20 hover:border-[#16131d]/40 transition-all cursor-pointer flex flex-col justify-between mb-2 select-none"
            title="タップで難易度・内容目安を表示">
            <div class="space-y-0.5 ${infoSizeClass} uppercase tracking-wider font-black">
              <div class="flex items-center gap-1.5 text-slate-400 font-medium"><span>定員:</span> <span class="text-main font-black">${capacity}</span></div>
              <div class="flex items-center gap-1.5 text-slate-400 font-medium"><span>所要:</span> <span class="text-main font-black">${durationDisplay}</span></div>
              ${priceHtml}
            </div>
            <div class="flex items-center justify-center pt-1 mt-0.5 border-t border-dashed border-[#dcd5e7]">
              <span class="material-symbols-outlined text-[15px] leading-none text-[#16131d]/60 group-hover:text-[#16131d]">keyboard_arrow_down</span>
            </div>
          </div>

          <div class="relative z-10 mt-auto mb-1.5 reserve-btn-area">
            ${buttonHtml}
          </div>
        </div>`;

      // スケジュールコマ
      groupShows.forEach(show => {
        const startStr = show.startTime || show['開始時間(hh:mm)'];
        if (!startStr || !startStr.includes(':')) return;

        const isSoldOut = show.isSoldOut;
        const soldOutClass = isSoldOut
          ? (this.config.allowSoldOutSelect ? "opacity-40 grayscale cursor-pointer" : "opacity-40 grayscale pointer-events-none shadow-none")
          : "cursor-pointer";
        const soldOutBadge = isSoldOut ? `<div class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"><span class="bg-slate-700 text-white text-[8px] font-black px-2 py-0.5 rounded shadow-lg transform -rotate-12 uppercase text-center tracking-widest">SOLD OUT</span></div>` : "";

        const showId = show.id;
        const currentShowCount = heatmapData[showId] || 0;
        const allCounts = Object.values(heatmapData);
        const maxCount = allCounts.length > 0 ? Math.max(...allCounts) : 1;
        const heatIntensity = maxCount > 0 ? Math.min(currentShowCount / maxCount, 1) : 0;

        const isCardNoise = show.noiseEffect === true || String(show.noiseEffect).toUpperCase() === 'TRUE';
        const isCardLockConfig = (show.password || show['_encryptedData'] || '') !== '' || String(show['南京錠パスワード'] || '') === 'LOCKED_FLAG';
        const isCardLock = isCardLockConfig && !isGroupUnlocked;

        const [h, m] = startStr.split(':').map(Number);
        const top = ((h - this.config.startHour) * 60 + m) * (this.PIXELS_PER_HOUR / 60) + currentHeaderOffset;

        let cardStyle = "";
        let timeDisplay = "";
        let phaseBlockHtml = "";

        const showDuration = show.durationMin || show['所要時間(分)'] || 0;
        let endT_min = (h * 60) + m + Number(showDuration);

        if (isFamilyStyle && showDuration === 0) {
          endT_min = (this.config.endHour + 1) * 60;
        }

        const pAcceptEnd = show['受付終了時間'] || '';
        let acceptEndMin = null;
        if (pAcceptEnd.includes(':')) {
          const [ah, am] = pAcceptEnd.split(':').map(Number);
          acceptEndMin = (ah * 60) + am;
        }

        const pTotalEnd = show['完全終了時間'] || '';
        let totalEndMin = null;
        if (pTotalEnd.includes(':')) {
          const [th, tm] = pTotalEnd.split(':').map(Number);
          totalEndMin = (th * 60) + tm;
        }

        if (totalEndMin !== null && acceptEndMin !== null) {
          if (totalEndMin <= acceptEndMin) {
            endT_min = Math.max(totalEndMin, acceptEndMin);
          } else {
            endT_min = totalEndMin;
            const phaseHeight = (totalEndMin - acceptEndMin) * (this.PIXELS_PER_HOUR / 60) - 1;
            if (phaseHeight > 0) {
              const rawPhaseName = show.finalPhaseTitle || show['最終フェーズ表示名'] || '受付終了';
              const phaseName = String(rawPhaseName).replace(/\n/g, '<br>');
              phaseBlockHtml = `
                <div class="absolute bottom-0 left-0 right-0 flex items-center justify-center p-1 ${c.phaseBg} border-t border-dashed border-white/60" style="height:${phaseHeight}px;">
                  <span class="text-[10px] font-black ${c.phaseText} leading-tight text-center drop-shadow-sm">${phaseName}</span>
                </div>`;
              cardStyle += `padding-bottom: ${phaseHeight + 16}px; `;
            }
          }
        } else if (totalEndMin !== null) {
          endT_min = totalEndMin;
        } else if (acceptEndMin !== null) {
          endT_min = acceptEndMin;
        }

        const height = Math.max(0, (endT_min - ((h * 60) + m)) * (this.PIXELS_PER_HOUR / 60) - 1);
        cardStyle += `top:${top}px; height:${height}px;`;

        const calcEndStr = `${Math.floor(endT_min / 60)}:${('0' + (endT_min % 60)).slice(-2)}`;
        const endStr = isFamilyStyle ? calcEndStr : (show.endTime || calcEndStr);
        const validStartStr = startStr || `${this.config.startHour}:00`;

        if (isFamilyStyle) {
          timeDisplay = `随時受付<br><span class="opacity-70 text-[9px]">(${validStartStr} - ${endStr})</span>`;
        } else {
          timeDisplay = `${validStartStr} - ${endStr}`;
        }

        if (currentShowCount > 0) {
          const hue = 60 - (heatIntensity * 60);
          const heatAlpha = (0.2 + (heatIntensity * 0.6)).toFixed(2);
          cardStyle += ` background-color: hsla(${hue}, 90%, 60%, ${heatAlpha}) !important; border-color: hsla(${hue}, 90%, 50%, ${heatAlpha}) !important;`;
        }

        const cardNoiseClass = isCardNoise ? "!bg-slate-300/40 backdrop-blur-md !border-slate-300 pointer-events-none overflow-hidden" : `${c.bg} ${c.border}`;
        const textNoiseClass = isCardNoise ? "mystic-text" : c.text.replace('800', '700');
        const cardNoiseLayer = isCardNoise ? `<div class="mystic-shimmer pointer-events-none rounded opacity-30"></div>` : "";
        const cardLockBadge = isCardLock && !isCardNoise ? `<div class="absolute -top-2 -left-2 bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center shadow-md z-20"><span class="material-symbols-outlined text-[12px] text-accent">lock</span></div>` : "";
        const lockedStateClass = isCardLock && !isCardNoise ? "card-locked-state" : "";

        const cardEncData = String(show.password || show['_encryptedData'] || '').replace(/'/g, "\\'");
        const onclickHandler = isCardLock ? `promptLock('${groupKey}', '${cardEncData}', event)` : `toggleShow('${showId}', event)`;
        const isSelected = selectedIds.includes(showId);
        const selectedCardClass = isSelected ? "selected-card" : "";

        colHtml += `
        <div onclick="${onclickHandler}" id="card-${showId}"
             style="${cardStyle}"
             class="absolute left-2 right-2 p-0.5 transition-all duration-300 flex flex-col items-center justify-center timetable-card border border-slate-200 ${soldOutClass} hover:brightness-95 ${cardNoiseClass} ${lockedStateClass} ${selectedCardClass}">
          ${cardNoiseLayer}
          ${soldOutBadge}
          ${cardLockBadge}
          <div class="font-black text-[11px] text-center leading-tight z-10 ${textNoiseClass}">${timeDisplay}</div>
          ${currentShowCount > 0 ? `<div class="absolute -top-2 -right-2 bg-red-600 text-white w-4 h-4 rounded-full flex items-center justify-center shadow-md animate-pulse z-20 tooltip-trigger" title="${currentShowCount}人がハシゴ予定！"><span class="material-symbols-outlined text-[10px]">mode_heat</span></div>` : ''}
          ${phaseBlockHtml}
        </div>`;
      });

      colHtmls.push(colHtml + `</div>`);
    });

    grid.innerHTML = colHtmls.join('');

    const topScrollWrapper = document.getElementById('top-scrollbar-wrapper');
    const topScrollContent = document.getElementById('top-scrollbar-content');
    if (topScrollWrapper && topScrollContent && container) {
      topScrollWrapper.classList.remove('hidden');
      setTimeout(() => {
        topScrollContent.style.width = container.scrollWidth + 'px';
      }, 300);
    }
  }

  syncScrollbars() {
    const topWrapper = document.getElementById('top-scrollbar-wrapper');
    const bottomWrapper = document.getElementById('table-container');
    if (!topWrapper || !bottomWrapper) return;

    let isSyncingTop = false;
    let isSyncingBottom = false;

    topWrapper.addEventListener('scroll', () => {
      if (!isSyncingTop) {
        isSyncingBottom = true;
        bottomWrapper.scrollLeft = topWrapper.scrollLeft;
      }
      isSyncingTop = false;
    });

    bottomWrapper.addEventListener('scroll', () => {
      if (!isSyncingBottom) {
        isSyncingTop = true;
        topWrapper.scrollLeft = bottomWrapper.scrollLeft;
      }
      isSyncingBottom = false;
    });
  }
}
