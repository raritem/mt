/* ================================================================
   WoT Shop — Лайтбокс v6
   Архитектура: PhotoSwipe-style
   • Единый scrollX — источник истины для позиции карусели
   • Spring-анимация через rAF (никаких CSS transitions на треке)
   • 3 слота holders — рециклинг без пересоздания DOM
   • Pointer Events — единый код для мыши и тача
   ================================================================ */
'use strict';

window.LightBox = (() => {

  // ── DOM ──────────────────────────────────────────────────────
  const lb        = document.getElementById('lightbox');
  const lbBg      = document.getElementById('lb-bg');
  const lbClose   = document.getElementById('lb-close');
  const lbBack    = document.getElementById('lb-back');
  const lbPrev    = document.getElementById('lb-prev');
  const lbNext    = document.getElementById('lb-next');
  const lbStage   = document.getElementById('lb-stage');
  const lbTrack   = document.getElementById('lb-track');
  const lbZoomIn  = document.getElementById('lb-zoom-in');
  const lbZoomOut = document.getElementById('lb-zoom-out');
  const lbCounter = document.getElementById('lb-counter');
  const lbThumbs  = document.getElementById('lb-thumbnails');
  const lbTnRow   = document.getElementById('lb-tn-row');

  // ── Данные ───────────────────────────────────────────────────
  let images    = [];
  let current   = 0;   // «потенциальный» индекс (меняется при свайпе)
  let committed = 0;   // «зафиксированный» — после завершения анимации

  // ── 3 слота карусели ─────────────────────────────────────────
  // holders[0]=prev, holders[1]=current, holders[2]=next
  const holders = []; // [{el, img, dataIndex}]

  // ── Прокрутка карусели ───────────────────────────────────────
  let scrollX   = 0;   // текущая X-позиция (0 = центр виден)
  let targetX   = 0;   // цель spring-анимации
  let velScroll = 0;   // скорость (px/frame)
  let slideW    = 0;   // ширина одного слота
  let rafId     = 0;   // rAF handle

  // Spring (critically damped, как PhotoSwipe mainScroll)
  // k = 1 - e^(-2π * freq/fps * damp)
  const SPRING_K = 1 - Math.exp(-2 * Math.PI * 30 / 60);

  // ── Зум ─────────────────────────────────────────────────────
  let zScale = 1, zTx = 0, zTy = 0;
  const ZOOM_MIN = 1, ZOOM_MAX = 6, ZOOM_STEP = 0.35;
  let zoomRaf = null, zoomSpringTarget = null;

  // ── Pointer-жест ─────────────────────────────────────────────
  let gesture    = 'idle';
  let ptrs       = [];
  let ptrSX      = 0, ptrSY = 0, ptrST = 0;
  let ptrPX      = 0, ptrPY = 0, ptrPT = 0;
  let ptrVX      = 0, ptrVY = 0;
  let panTx0     = 0, panTy0 = 0;
  let pinchD0    = 0, pinchSc0 = 1, pinchCX = 0, pinchCY = 0;
  let navBaseX   = 0; // scrollX при начале nav-жеста
  let tapTimer   = null, tapX = 0, tapY = 0;
  let mouseDown  = false, mouseSX = 0, mouseSY = 0;

  // Close-drag
  let closeDragOn = false;

  // UI auto-hide
  let hideTimer = null, uiOn = false, thumbHover = false;

  // ═══════════════════════════════════════════════════════════════
  //  УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════

  const imgSrc = p => (typeof assetUrl === 'function') ? assetUrl(p) : ROOT + p;
  const dist   = (a,b) => Math.hypot(b.x-a.x, b.y-a.y);
  const mid    = (a,b) => ({x:(a.x+b.x)/2, y:(a.y+b.y)/2});
  const clamp  = (v,lo,hi) => Math.max(lo, Math.min(hi, v));

  // Apple rubber-band: limit + over / (|over|/C + 1)
  function rb(val, lo, hi, C) {
    C = C || 180;
    if (val >= lo && val <= hi) return val;
    if (val < lo) { const o = val-lo; return lo + o/(Math.abs(o)/C+1); }
    const o = val-hi; return hi + o/(o/C+1);
  }
  function rbScale(s, lo, hi) {
    if (s>=lo && s<=hi) return s;
    if (s<lo) { const o=s-lo; return lo+o/(Math.abs(o)/0.5+1); }
    const o=s-hi; return hi+o/(o/4+1);
  }

  // ═══════════════════════════════════════════════════════════════
  //  UI SHOW/HIDE
  // ═══════════════════════════════════════════════════════════════

  function showUI() {
    clearTimeout(hideTimer);
    if (!uiOn) { uiOn=true; lb.classList.add('ui-visible'); }
    hideTimer = setTimeout(() => { if (!thumbHover) hideUI(); }, 2500);
  }
  function hideUI() {
    if (thumbHover) return;
    clearTimeout(hideTimer); uiOn=false; lb.classList.remove('ui-visible');
  }
  lbThumbs.addEventListener('mouseenter', () => { thumbHover=true;  clearTimeout(hideTimer); });
  lbThumbs.addEventListener('mouseleave', () => { thumbHover=false; hideTimer=setTimeout(hideUI,1000); });
  lb.addEventListener('mousemove', showUI, {passive:true});
  lb.addEventListener('mouseleave', () => { clearTimeout(hideTimer); if(!thumbHover) hideUI(); });

  // ═══════════════════════════════════════════════════════════════
  //  КАРУСЕЛЬ: HOLDERS
  // ═══════════════════════════════════════════════════════════════

  function buildHolders() {
    lbTrack.innerHTML = '';
    holders.length = 0;
    for (let i = 0; i < 3; i++) {
      const el  = document.createElement('div');
      el.className = 'lb-slide-holder';
      const img = document.createElement('img');
      img.className = 'lb-slide-img';
      img.draggable = false;
      img.alt = '';
      el.appendChild(img);
      lbTrack.appendChild(el);
      holders.push({ el, img, dataIndex: -1 });
    }
  }

  function loadHolder(h, idx) {
    h.dataIndex = idx;
    const src = (idx >= 0 && idx < images.length) ? imgSrc(images[idx]) : '';
    h.img.src = src || '';
    h.el.style.visibility = src ? '' : 'hidden';
  }

  // Позиция держателя: translateX = (slot) * slideW, где slot = -1,0,+1
  // holders[0]→slot-1, holders[1]→slot0, holders[2]→slot+1
  // При рециклинге слоты переназначаются через holderSlot[]
  let holderSlots = [-1, 0, 1]; // holderSlots[i] = слот для holders[i]

  function repositionHolders() {
    holders.forEach((h, i) => {
      h.el.style.transform = `translateX(${holderSlots[i] * slideW}px)`;
    });
  }

  function rebuildAll() {
    holderSlots = [-1, 0, 1];
    holders.forEach((h, i) => {
      loadHolder(h, current + holderSlots[i]);
      h.el.style.transform = `translateX(${holderSlots[i] * slideW}px)`;
    });
    applyTrackX(0);
    velScroll = 0;
    committed = current;
    updateCounterUI();
  }

  // ═══════════════════════════════════════════════════════════════
  //  КАРУСЕЛЬ: ПРОКРУТКА
  // ═══════════════════════════════════════════════════════════════

  function updateSlideW() {
    slideW = lbStage.offsetWidth || window.innerWidth;
  }

  // Применить позицию трека: translateX(-slideW + scrollX)
  // При scrollX=0 → центральный слот виден
  // При scrollX=-slideW → правый (next) слот виден
  // При scrollX=+slideW → левый (prev) слот виден
  function applyTrackX(x) {
    scrollX = x;
    lbTrack.style.transform = `translateX(${-slideW + x}px)`;
  }

  function stopRaf() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  // Spring-шаг
  function springStep() {
    const diff  = targetX - scrollX;
    velScroll   = velScroll * (1 - SPRING_K) + diff * SPRING_K;
    const newX  = scrollX + velScroll;
    applyTrackX(newX);

    if (Math.abs(diff) < 0.5 && Math.abs(velScroll) < 0.5) {
      applyTrackX(targetX);
      velScroll = 0;
      rafId = 0;
      onScrollSettled();
      return;
    }
    rafId = requestAnimationFrame(springStep);
  }

  function animateTo(tx, vel) {
    stopRaf();
    targetX   = tx;
    velScroll = vel || 0;
    rafId = requestAnimationFrame(springStep);
  }

  // Вызывается когда spring остановился
  function onScrollSettled() {
    const diff = committed - current;
    if (diff === 0) {
      // Snap-back — ничего не делаем, просто сбрасываем в 0
      applyTrackX(0); return;
    }

    // Перераспределяем слоты, не трогая DOM-порядок
    const dir   = diff > 0 ? -1 : 1; // dir>0: листали вперёд
    const steps = Math.min(Math.abs(diff), 3);

    if (Math.abs(diff) >= 3) {
      // Прыжок — полный перестрой
      committed = current;
      rebuildAll();
      return;
    }

    for (let s = 0; s < steps; s++) {
      if (dir > 0) {
        // Листали вперёд: бывший «prev» становится «next»
        // holders в порядке [prev, curr, next] — recycleForward:
        // holder с наименьшим слотом получает maxSlot+1
        const minI = holderSlots.indexOf(Math.min(...holderSlots));
        const maxSlot = Math.max(...holderSlots);
        holderSlots[minI] = maxSlot + 1;
        loadHolder(holders[minI], current + maxSlot + 1);
        holders[minI].el.style.transform = `translateX(${holderSlots[minI] * slideW}px)`;
      } else {
        // Листали назад: бывший «next» становится «prev»
        const maxI = holderSlots.indexOf(Math.max(...holderSlots));
        const minSlot = Math.min(...holderSlots);
        holderSlots[maxI] = minSlot - 1;
        loadHolder(holders[maxI], current + minSlot - 1);
        holders[maxI].el.style.transform = `translateX(${holderSlots[maxI] * slideW}px)`;
      }
    }

    committed = current;

    // Нормализуем слоты: сдвигаем все на -minSlot, чтобы min=−1
    const minSlot = Math.min(...holderSlots);
    const shift   = -1 - minSlot; // сколько добавить чтобы min стал -1
    if (shift !== 0) {
      holderSlots = holderSlots.map(s => s + shift);
      // Пересчитываем позиции
      holders.forEach((h, i) => {
        h.el.style.transform = `translateX(${holderSlots[i] * slideW}px)`;
      });
    }

    // Сбрасываем трек в центр без анимации
    applyTrackX(0);
    updateCounterUI();
  }

  // Навигация к конкретному слайду
  function goTo(newIdx, velX) {
    if (newIdx < 0 || newIdx >= images.length) {
      animateTo(0, velX); return;
    }
    const dir = newIdx > current ? 1 : -1;
    current = newIdx;
    animateTo(-slideW * dir, velX);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ЗУМ
  // ═══════════════════════════════════════════════════════════════

  function currImg() {
    // Находим holder со слотом 0
    const i = holderSlots.indexOf(0);
    return i >= 0 ? holders[i].img : null;
  }

  function zBounds(sc) {
    const img = currImg();
    if (!img) return {minX:0,maxX:0,minY:0,maxY:0};
    const mx = Math.max(0, (img.offsetWidth*sc  - window.innerWidth)  / 2);
    const my = Math.max(0, (img.offsetHeight*sc - window.innerHeight) / 2);
    return {minX:-mx,maxX:mx,minY:-my,maxY:my};
  }

  function applyZoom(sc, x, y, el) {
    zScale=sc; zTx=x; zTy=y;
    const img = currImg();
    if (!img) return;
    img.style.transform = (sc===1&&x===0&&y===0) ? '' : `translate(${x}px,${y}px) scale(${sc})`;
    const holder = holders[holderSlots.indexOf(0)];
    if (holder) holder.el.classList.toggle('zoomed', sc > 1);
  }

  function resetZoom() {
    applyZoom(1, 0, 0);
    gesture = 'idle';
  }

  function clampZoom() {
    if (zScale <= 1) { zTx=0; zTy=0; return; }
    const b = zBounds(zScale);
    zTx = clamp(zTx, b.minX, b.maxX);
    zTy = clamp(zTy, b.minY, b.maxY);
  }

  function zoomAt(delta, cx, cy) {
    const vpCx = cx ?? window.innerWidth/2;
    const vpCy = cy ?? window.innerHeight/2;
    const prev = zScale;
    zScale = parseFloat(clamp(zScale+delta, ZOOM_MIN, ZOOM_MAX).toFixed(3));
    if (zScale === prev) return;
    const vw=window.innerWidth, vh=window.innerHeight;
    const lx=(vpCx-vw/2-zTx)/prev, ly=(vpCy-vh/2-zTy)/prev;
    zTx=vpCx-vw/2-lx*zScale;
    zTy=vpCy-vh/2-ly*zScale;
    clampZoom();
    applyZoom(zScale,zTx,zTy);
  }

  function imgFillsH() {
    const img = currImg();
    return img ? img.offsetHeight * zScale >= window.innerHeight - 2 : false;
  }

  function stopZoomAnim() {
    if (zoomRaf) { zoomRaf(); zoomRaf=null; }
    zoomSpringTarget = null;
  }

  function springZoomTo(tSc, tTx, tTy, done) {
    stopZoomAnim();
    zoomSpringTarget = tSc;
    let cancelled=false;
    const s0=zScale,x0=zTx,y0=zTy,t0=performance.now();
    const d = Math.max(Math.abs(tSc-s0)*200, Math.hypot(tTx-x0,tTy-y0));
    const dur = clamp(d*0.6, 200, 380);
    function step(now) {
      if (cancelled) return;
      const t = Math.min((now-t0)/dur, 1);
      const e = t===1 ? 1 : 1-Math.pow(2,-10*t);
      applyZoom(s0+(tSc-s0)*e, x0+(tTx-x0)*e, y0+(tTy-y0)*e);
      if (t>=1) { applyZoom(tSc,tTx,tTy); if(done) done(); return; }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    zoomRaf = () => { cancelled=true; };
  }

  function inertiaZoom(vx, vy) {
    stopZoomAnim();
    const DECAY=0.9231;
    let cancelled=false;
    let lvx=vx, lvy=vy;
    function step() {
      if (cancelled) return;
      lvx*=DECAY; lvy*=DECAY;
      const b=zBounds(zScale);
      zTx=rb(zTx+lvx,b.minX,b.maxX);
      zTy=rb(zTy+lvy,b.minY,b.maxY);
      applyZoom(zScale,zTx,zTy);
      if (Math.abs(lvx)<0.15&&Math.abs(lvy)<0.15) {
        const clx=clamp(zTx,b.minX,b.maxX), cly=clamp(zTy,b.minY,b.maxY);
        if (Math.abs(zTx-clx)>0.2||Math.abs(zTy-cly)>0.2) springZoomTo(zScale,clx,cly);
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    zoomRaf = () => { cancelled=true; };
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLOSE-DRAG
  // ═══════════════════════════════════════════════════════════════

  function applyCloseDrag(dy) {
    closeDragOn = true;
    const p = Math.min(1, dy/350);
    // Пишем поверх applyTrackX (трек уже имеет -slideW от applyTrackX=0)
    lbTrack.style.transform = `translateX(${-slideW}px) translateY(${dy}px) scale(${1-p*0.30})`;
    lb.style.background = `rgba(0,0,0,${1-p*0.92})`;
  }

  function resetCloseDrag(animate) {
    closeDragOn = false;
    if (animate) {
      lbTrack.style.transition = 'transform 0.22s cubic-bezier(0.34,1.4,0.64,1)';
      lb.style.transition = 'background 0.22s ease';
    } else {
      lbTrack.style.transition = '';
    }
    lbTrack.style.transform = '';
    lb.style.background = '';
    if (animate) setTimeout(() => { lbTrack.style.transition=lb.style.transition=''; }, 240);
  }

  function commitClose() {
    closeDragOn = false;
    lbTrack.style.transition = 'transform 200ms cubic-bezier(0.55,0,1,1)';
    lbTrack.style.transform  = `translateX(${-slideW}px) translateY(${window.innerHeight}px) scale(0.9)`;
    lb.style.transition = 'background 200ms ease-in';
    lb.style.background = 'rgba(0,0,0,0)';
    setTimeout(() => {
      lbTrack.style.transition=lbTrack.style.transform='';
      lb.style.transition=lb.style.background='';
      close();
    }, 210);
  }

  // ═══════════════════════════════════════════════════════════════
  //  POINTER EVENTS
  // ═══════════════════════════════════════════════════════════════

  function getPtr(id) { return ptrs.find(p=>p.id===id); }
  function addPtr(e)  { ptrs.push({id:e.pointerId, x:e.clientX, y:e.clientY}); }
  function updPtr(e)  { const p=getPtr(e.pointerId); if(p){p.x=e.clientX;p.y=e.clientY;} }
  function delPtr(e)  { ptrs=ptrs.filter(p=>p.id!==e.pointerId); }

  lbStage.addEventListener('pointerdown', onPD, {passive:false});
  lbStage.addEventListener('pointermove', onPM, {passive:false});
  lbStage.addEventListener('pointerup',     onPU, {passive:false});
  lbStage.addEventListener('pointercancel', onPU, {passive:false});

  function onPD(e) {
    if (e.pointerType==='mouse' && e.button!==0) return;
    e.preventDefault();
    lbStage.setPointerCapture(e.pointerId);
    addPtr(e);

    // Прерываем анимацию зума
    if (zoomRaf && zoomSpringTarget===1) { stopZoomAnim(); resetZoom(); }
    else stopZoomAnim();
    zoomSpringTarget = null;

    if (ptrs.length===2) {
      const p1=ptrs[0], p2=ptrs[1];
      pinchD0=dist(p1,p2); pinchSc0=zScale;
      const m=mid(p1,p2); pinchCX=m.x; pinchCY=m.y;
      gesture='pinch';
      // Останавливаем nav-анимацию — фиксируем текущую позицию
      stopRaf();
      applyTrackX(scrollX);
      return;
    }

    if (ptrs.length===1) {
      ptrSX=ptrPX=e.clientX; ptrSY=ptrPY=e.clientY;
      ptrST=ptrPT=e.timeStamp; ptrVX=ptrVY=0;
      panTx0=zTx; panTy0=zTy;
      navBaseX=scrollX;

      // Double-tap
      if (tapTimer) {
        clearTimeout(tapTimer); tapTimer=null;
        if (Math.hypot(e.clientX-tapX, e.clientY-tapY) < 30) { gesture='doubletap'; return; }
      }
      tapX=e.clientX; tapY=e.clientY;

      gesture = (zScale>1 && imgFillsH()) ? 'pan' : 'deciding';
    }
  }

  function onPM(e) {
    if (!getPtr(e.pointerId)) return;
    e.preventDefault();
    updPtr(e);

    // PINCH
    if (gesture==='pinch' && ptrs.length>=2) {
      const p1=ptrs[0], p2=ptrs[1];
      const curD=dist(p1,p2);
      const rawSc=pinchSc0*(curD/pinchD0);
      const newSc=rbScale(rawSc,ZOOM_MIN,ZOOM_MAX);
      const vw=window.innerWidth,vh=window.innerHeight;
      const prev=zScale;
      const lx=(pinchCX-vw/2-zTx)/prev, ly=(pinchCY-vh/2-zTy)/prev;
      zScale=newSc;
      zTx=pinchCX-vw/2-lx*zScale;
      zTy=pinchCY-vh/2-ly*zScale;
      const m=mid(p1,p2);
      zTx+=m.x-pinchCX; zTy+=m.y-pinchCY;
      pinchCX=m.x; pinchCY=m.y;
      applyZoom(zScale,zTx,zTy);
      return;
    }

    if (ptrs.length!==1) return;
    const cx=e.clientX,cy=e.clientY;
    const dx=cx-ptrSX, dy=cy-ptrSY;
    const dt=Math.max(e.timeStamp-ptrPT, 1);
    const rvx=(cx-ptrPX)/dt*16, rvy=(cy-ptrPY)/dt*16;
    ptrVX=ptrVX*0.5+rvx*0.5; ptrVY=ptrVY*0.5+rvy*0.5;
    ptrPX=cx; ptrPY=cy; ptrPT=e.timeStamp;

    if (gesture==='pan') {
      const b=zBounds(zScale);
      zTx=rb(panTx0+dx,b.minX,b.maxX);
      zTy=imgFillsH() ? rb(panTy0+dy,b.minY,b.maxY) : 0;
      applyZoom(zScale,zTx,zTy);
      return;
    }

    if (gesture==='deciding' && (Math.abs(dx)>8||Math.abs(dy)>8)) {
      if (zScale>1&&!imgFillsH()) gesture=Math.abs(dx)>=Math.abs(dy)?'pan':'closing';
      else if (zScale>1) gesture='pan';
      else if (imgFillsH()) gesture=(Math.abs(dy)>Math.abs(dx)&&dy>0)?'closing':'nav';
      else gesture=Math.abs(dx)>Math.abs(dy)?'nav':'closing';
      if (gesture==='pan') { panTx0=zTx; panTy0=zTy; }
    }

    if (gesture==='closing') { applyCloseDrag(Math.max(0,dy)); return; }

    if (gesture==='nav') {
      let navX=navBaseX+dx;
      // Rubber-band у краёв
      if ((dx>0&&current===0)||(dx<0&&current===images.length-1)) {
        navX=navBaseX+dx*0.20;
      }
      stopRaf();
      applyTrackX(navX);
    }
  }

  function onPU(e) {
    const isCancel=(e.type==='pointercancel');
    delPtr(e);

    if (gesture==='pinch') {
      if (ptrs.length<2) {
        const tSc=clamp(zScale,ZOOM_MIN,ZOOM_MAX);
        if (tSc<=1.05) springZoomTo(1,0,0,resetZoom);
        else {
          const b=zBounds(tSc);
          springZoomTo(tSc,clamp(zTx,b.minX,b.maxX),clamp(zTy,b.minY,b.maxY));
        }
        gesture=ptrs.length===1?'deciding':'idle';
      }
      return;
    }

    if (ptrs.length>0) return;

    const dx=e.clientX-ptrSX, dy=e.clientY-ptrSY;
    const dt=Math.max(e.timeStamp-ptrPT,1);

    if (gesture==='pan') {
      if (Math.hypot(dx,dy)<10) { tapTimer=setTimeout(()=>{tapTimer=null;},300); }
      const still=dt; const speed=still<80?Math.hypot(ptrVX,ptrVY):0;
      if (speed>=2.0) inertiaZoom(ptrVX, imgFillsH()?ptrVY:0);
      else { const b=zBounds(zScale); const clx=clamp(zTx,b.minX,b.maxX),cly=clamp(zTy,b.minY,b.maxY); if(Math.abs(zTx-clx)>0.2||Math.abs(zTy-cly)>0.2) springZoomTo(zScale,clx,cly); }
    }
    else if (gesture==='closing') {
      isCancel ? resetCloseDrag(true) : ((dy>80||dy/dt*1000>280)?commitClose():resetCloseDrag(true));
    }
    else if (gesture==='nav') {
      if (isCancel) { animateTo(0,0); gesture='idle'; return; }
      const vx=ptrVX*60;
      const threshold=slideW*0.3;
      if (Math.abs(dx)>threshold||Math.abs(vx)>300) {
        if      (dx<0&&current<images.length-1) goTo(current+1, ptrVX);
        else if (dx>0&&current>0)               goTo(current-1, ptrVX);
        else                                     animateTo(0, ptrVX);
      } else {
        animateTo(0, ptrVX);
      }
    }
    else if (gesture==='doubletap') {
      if (zScale>1.05) springZoomTo(1,0,0,resetZoom);
      else {
        const T=2.5,vw=window.innerWidth,vh=window.innerHeight;
        const lx=(e.clientX-vw/2-zTx)/zScale, ly=(e.clientY-vh/2-zTy)/zScale;
        const tTx=e.clientX-vw/2-lx*T, tTy=e.clientY-vh/2-ly*T;
        const b=zBounds(T); springZoomTo(T,clamp(tTx,b.minX,b.maxX),clamp(tTy,b.minY,b.maxY));
      }
    }
    else if (gesture==='deciding') {
      if (Math.hypot(dx,dy)<10) tapTimer=setTimeout(()=>{tapTimer=null;},300);
    }

    if (gesture==='nav'||gesture==='closing') { if(tapTimer){clearTimeout(tapTimer);tapTimer=null;} }
    gesture='idle';
  }

  // ═══════════════════════════════════════════════════════════════
  //  МЫШЬ: drag при зуме + wheel
  // ═══════════════════════════════════════════════════════════════

  lbStage.addEventListener('mousedown', e => {
    if (zScale<=1||e.button!==0) return;
    mouseDown=true; mouseSX=e.clientX-zTx; mouseSY=e.clientY-zTy;
    lbStage.style.cursor='grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    zTx=e.clientX-mouseSX; zTy=e.clientY-mouseSY; clampZoom(); applyZoom(zScale,zTx,zTy);
  });
  document.addEventListener('mouseup', () => { if(mouseDown){mouseDown=false;lbStage.style.cursor='';} });

  lb.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.deltaY<0?ZOOM_STEP:-ZOOM_STEP,e.clientX,e.clientY);
  }, {passive:false});

  lbStage.addEventListener('dblclick', e => {
    if (zScale>1) springZoomTo(1,0,0,resetZoom);
    else zoomAt(ZOOM_STEP*2,e.clientX,e.clientY);
  });

  // ═══════════════════════════════════════════════════════════════
  //  COUNTER / THUMBNAILS
  // ═══════════════════════════════════════════════════════════════

  function updateCounterUI() {
    lbCounter.textContent = (current+1)+' / '+images.length;
    lbPrev.disabled = current===0;
    lbNext.disabled = current===images.length-1;
    if (!lbTnRow) return;
    Array.from(lbTnRow.children).forEach((t,i)=>t.classList.toggle('active',i===current));
    const at=lbTnRow.children[current];
    if (at) at.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  function renderThumbs() {
    if (!lbTnRow) return;
    lbTnRow.innerHTML='';
    images.forEach((src,i) => {
      const tn=document.createElement('div');
      tn.className='lb-tn'+(i===current?' active':'');
      tn.innerHTML=`<img src="${imgSrc(src)}" alt="" loading="lazy">`;
      tn.addEventListener('click', ()=>{
        if (i===current) return;
        current=i; committed=i; rebuildAll(); hideUI();
      });
      lbTnRow.appendChild(tn);
    });
  }

  function prev() { if(current>0){goTo(current-1);hideUI();} }
  function next() { if(current<images.length-1){goTo(current+1);hideUI();} }

  function setImages(imgs) { images=imgs||[]; }

  function open(imgs, idx) {
    if (imgs) images=imgs;
    current=idx||0; committed=current;
    stopZoomAnim(); stopRaf();
    resetZoom();
    scrollX=0; targetX=0; velScroll=0;
    updateSlideW();
    rebuildAll();
    renderThumbs();
    lb.classList.add('open');
    if (!document.body.classList.contains('qv-open')) document.body.style.overflow='hidden';
    hideUI();
  }

  function close() {
    stopRaf(); stopZoomAnim();
    lb.classList.remove('open');
    if (!document.body.classList.contains('qv-open')) document.body.style.overflow='';
    resetZoom(); clearTimeout(hideTimer); hideUI();
  }

  window.addEventListener('resize', () => {
    if (!lb.classList.contains('open')) return;
    updateSlideW(); repositionHolders(); applyTrackX(0);
  });

  lbClose.addEventListener('click', close);
  if (lbBack) lbBack.addEventListener('click', close);
  lbBg.addEventListener('click', e=>{ if(e.target===lbBg) close(); });
  lbPrev.addEventListener('click', prev);
  lbNext.addEventListener('click', next);
  lbZoomIn.addEventListener('click',  ()=>zoomAt( ZOOM_STEP));
  lbZoomOut.addEventListener('click', ()=>zoomAt(-ZOOM_STEP));

  document.addEventListener('keydown', e=>{
    if (!lb.classList.contains('open')) return;
    switch(e.key){
      case 'ArrowLeft':  case 'ArrowUp':    prev();  break;
      case 'ArrowRight': case 'ArrowDown':  next();  break;
      case 'Escape':                         close(); break;
      case '+': case '=': zoomAt( ZOOM_STEP,window.innerWidth/2,window.innerHeight/2); break;
      case '-':           zoomAt(-ZOOM_STEP,window.innerWidth/2,window.innerHeight/2); break;
    }
  });

  // Инициализация
  buildHolders();

  return { setImages, open, close, prev, next };

})();
