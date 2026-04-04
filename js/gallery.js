/* ================================================================
   WoT Shop — Лайтбокс v5
   • UI прячется через 2.5с, показывается при движении мыши
   • При навигации UI прячется немедленно
   • Зум в центр viewport (не в центр изображения)
   • Зум ограничен — нельзя выйти за границы
   ================================================================ */
'use strict';

window.LightBox = (() => {

  const lb        = document.getElementById('lightbox');
  const lbBg      = document.getElementById('lb-bg');
  const lbClose   = document.getElementById('lb-close');
  const lbBack    = document.getElementById('lb-back');
  const lbPrev    = document.getElementById('lb-prev');
  const lbNext    = document.getElementById('lb-next');
  const lbImg     = document.getElementById('lb-img');
  const lbWrap    = document.getElementById('lb-img-wrap');
  const lbZoomIn  = document.getElementById('lb-zoom-in');
  const lbZoomOut = document.getElementById('lb-zoom-out');
  const lbCounter = document.getElementById('lb-counter');
  const lbThumbs  = document.getElementById('lb-thumbnails');

  const lbTnRow   = document.getElementById('lb-tn-row');

  let images  = [];
  let current = 0;

  // Зум
  let scale  = 1;
  let tx = 0, ty = 0;
  const ZOOM_MIN = 1, ZOOM_MAX = 6, ZOOM_STEP = 0.35;

  // Drag
  let dragging = false, dragStartX = 0, dragStartY = 0;

  // Touch
  let touchStartX = 0, touchStartY = 0;

  // UI auto-hide
  let hideTimer = null;
  let uiVisible = false;
  let thumbsHovered = false;

  // ── UI show/hide ──────────────────────────────────────────────
  function showUI() {
    clearTimeout(hideTimer);
    if (!uiVisible) { uiVisible = true; lb.classList.add('ui-visible'); }
    hideTimer = setTimeout(() => { if (!thumbsHovered) hideUI(); }, 2500);
  }

  function hideUI() {
    if (thumbsHovered) return;
    clearTimeout(hideTimer);
    uiVisible = false;
    lb.classList.remove('ui-visible');
  }

  // Пока курсор над панелью навигации — не прячем UI
  lbThumbs.addEventListener('mouseenter', () => { thumbsHovered = true; clearTimeout(hideTimer); });
  lbThumbs.addEventListener('mouseleave', () => { thumbsHovered = false; hideTimer = setTimeout(hideUI, 1000); });

  lb.addEventListener('mousemove', showUI, { passive: true });
  lb.addEventListener('mouseleave', () => { clearTimeout(hideTimer); if (!thumbsHovered) hideUI(); });

  // ── Трансформация ─────────────────────────────────────────────
  function clamp() {
    if (scale <= 1) { tx = 0; ty = 0; return; }
    // Фактический размер img-элемента до масштаба
    const baseW = lbImg.offsetWidth;
    const baseH = lbImg.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = Math.max(0, (baseW * scale - vw)  / 2);
    const maxY = Math.max(0, (baseH * scale - vh) / 2);
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }

  function applyTransform() {
    clamp();
    lbImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    lbWrap.classList.toggle('zoomed', scale > 1);
  }

  function resetZoom() {
    scale = 1; tx = 0; ty = 0;
    lbImg.style.transform = '';
    lbWrap.classList.remove('zoomed');
  }

  // Зум относительно центра VIEWPORT (не изображения).
  // cx/cy — координаты точки в viewport (clientX/clientY).
  // Если не переданы — зуммируем в центр экрана.
  function zoomAt(delta, cx, cy) {
    const vpCx = cx != null ? cx : window.innerWidth  / 2;
    const vpCy = cy != null ? cy : window.innerHeight / 2;

    const prev = scale;
    scale = parseFloat(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale + delta)).toFixed(3));
    if (scale === prev) return;

    // Пересчёт смещения так чтобы точка vpCx/vpCy оставалась на месте.
    // При текущем transform: translate(tx,ty) scale(scale)
    // точка viewport (vpCx, vpCy) соответствует «логической» точке:
    //   lx = (vpCx - vw/2 - tx) / prev
    //   ly = (vpCy - vh/2 - ty) / prev
    // После смены масштаба tx/ty пересчитываем так чтобы lx,ly оставалась под vpCx,vpCy.
    const vw = window.innerWidth, vh = window.innerHeight;
    const lx = (vpCx - vw/2 - tx) / prev;
    const ly = (vpCy - vh/2 - ty) / prev;
    tx = vpCx - vw/2 - lx * scale;
    ty = vpCy - vh/2 - ly * scale;

    applyTransform();
  }

  // ── Drag ──────────────────────────────────────────────────────
  lbImg.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    dragging = true;
    dragStartX = e.clientX - tx;
    dragStartY = e.clientY - ty;
    lbImg.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    tx = e.clientX - dragStartX;
    ty = e.clientY - dragStartY;
    applyTransform();
  });

  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; lbImg.style.cursor = ''; }
  });

  // ── Wheel ─────────────────────────────────────────────────────
  lb.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP, e.clientX, e.clientY);
  }, { passive: false });

  // ── Double click ──────────────────────────────────────────────
  lbImg.addEventListener('dblclick', (e) => {
    if (scale > 1) resetZoom();
    else { zoomAt(ZOOM_STEP * 2, e.clientX, e.clientY); }
    applyTransform();
  });

  // ══════════════════════════════════════════════════════════════
  // TOUCH — pinch-zoom, pan, swipe-nav, swipe-down-to-close
  // Архитектура как у PhotoSwipe:
  //   1 палец, scale=1, нет жеста → определяем направление
  //     → вертикаль вниз = close-drag
  //     → горизонталь    = навигация (на touchend)
  //   1 палец, scale>1  → pan (перемещение по изображению)
  //   2 пальца           → pinch-zoom с сохранением центра
  // touch-action:none на лайтбоксе даёт нам полный контроль
  // ══════════════════════════════════════════════════════════════

  // Состояние одного касания
  let _t1 = null, _t2 = null;          // активные касания {id, x, y}
  let _gesture = 'idle';               // 'idle'|'deciding'|'nav'|'pan'|'pinch'|'closing'
  let _startX = 0, _startY = 0;
  let _startTime = 0;
  // Pinch
  let _pinchStartDist = 0;
  let _pinchStartScale = 1;
  let _pinchCx = 0, _pinchCy = 0;     // центр щипка в viewport
  // Pan (при зуме)
  let _panStartTx = 0, _panStartTy = 0;
  // Close-drag
  let _closeBaseY = 0;

  function _dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
  function _mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  // Визуальный drag-to-close
  function _applyCloseDrag(dy) {
    const progress = Math.min(1, Math.abs(dy) / 320);
    const sc = 1 - progress * 0.18;
    // Не трогаем transform через zoomAt/applyTransform — работаем со wrap
    lbWrap.style.transition = 'none';
    lbWrap.style.transform  = `translateY(${dy}px) scale(${sc})`;
    lb.style.background     = `rgba(0,0,0,${1 - progress * 0.92})`;
  }

  function _resetCloseDrag(animate) {
    const dur = animate ? '0.32s' : '0s';
    const ease = 'cubic-bezier(0.34,1.56,0.64,1)'; // spring
    lbWrap.style.transition = animate ? `transform ${dur} ${ease}` : 'none';
    lbWrap.style.transform  = '';
    lb.style.transition     = animate ? `background ${dur} ease` : 'none';
    lb.style.background     = '';
    if (animate) setTimeout(() => {
      lbWrap.style.transition = '';
      lb.style.transition     = '';
    }, 340);
  }

  function _commitClose() {
    lbWrap.style.transition = 'transform 0.26s cubic-bezier(0.4,0,1,1)';
    lbWrap.style.transform  = `translateY(${window.innerHeight}px) scale(0.88)`;
    lb.style.transition     = 'background 0.26s ease';
    lb.style.background     = 'rgba(0,0,0,0)';
    setTimeout(() => {
      lbWrap.style.transition = '';
      lbWrap.style.transform  = '';
      lb.style.transition     = '';
      lb.style.background     = '';
      close();
    }, 260);
  }

  lb.addEventListener('touchstart', (e) => {
    e.preventDefault(); // предотвращаем зум страницы

    if (e.touches.length === 1) {
      const t = e.touches[0];
      _t1 = { id: t.identifier, x: t.clientX, y: t.clientY };
      _t2 = null;
      _startX    = t.clientX;
      _startY    = t.clientY;
      _startTime = e.timeStamp;

      if (scale > 1) {
        // При зуме — начинаем pan
        _gesture   = 'pan';
        _panStartTx = tx;
        _panStartTy = ty;
      } else {
        _gesture = 'deciding';
      }
    }

    if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      _t1 = { id: t1.identifier, x: t1.clientX, y: t1.clientY };
      _t2 = { id: t2.identifier, x: t2.clientX, y: t2.clientY };
      _pinchStartDist  = _dist(_t1, _t2);
      _pinchStartScale = scale;
      const m = _mid(_t1, _t2);
      _pinchCx = m.x; _pinchCy = m.y;
      _gesture = 'pinch';

      // Если был close-drag — сбрасываем
      if (_gesture === 'closing') _resetCloseDrag(false);
    }
  }, { passive: false });

  lb.addEventListener('touchmove', (e) => {
    e.preventDefault();

    // ── Pinch ──────────────────────────────────────────────────
    if (e.touches.length === 2 && _gesture === 'pinch') {
      const ta = e.touches[0], tb = e.touches[1];
      const cur1 = { x: ta.clientX, y: ta.clientY };
      const cur2 = { x: tb.clientX, y: tb.clientY };
      const curDist = _dist(cur1, cur2);
      const ratio   = curDist / _pinchStartDist;
      const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, _pinchStartScale * ratio));

      // Зум в центр щипка
      const vw = window.innerWidth, vh = window.innerHeight;
      const lx = (_pinchCx - vw/2 - tx) / scale;
      const ly = (_pinchCy - vh/2 - ty) / scale;
      scale = newScale;
      tx = _pinchCx - vw/2 - lx * scale;
      ty = _pinchCy - vh/2 - ly * scale;
      applyTransform();

      // Pan во время pinch (смещение центра)
      const newMid = _mid(cur1, cur2);
      tx += newMid.x - _pinchCx;
      ty += newMid.y - _pinchCy;
      _pinchCx = newMid.x; _pinchCy = newMid.y;
      applyTransform();
      return;
    }

    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - _startX;
    const dy = t.clientY - _startY;

    // ── Pan при зуме ───────────────────────────────────────────
    if (_gesture === 'pan') {
      tx = _panStartTx + dx;
      ty = _panStartTy + dy;
      applyTransform();
      return;
    }

    // ── Определение жеста ──────────────────────────────────────
    if (_gesture === 'deciding' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
        _gesture    = 'closing';
        _closeBaseY = _startY;
      } else if (Math.abs(dx) >= Math.abs(dy)) {
        _gesture = 'nav';
      } else {
        _gesture = 'nav'; // вверх — тоже nav (заблокируем)
      }
    }

    // ── Close drag ─────────────────────────────────────────────
    if (_gesture === 'closing') {
      _applyCloseDrag(Math.max(0, dy));
    }
  }, { passive: false });

  lb.addEventListener('touchend', (e) => {
    if (_gesture === 'pinch') {
      // Если после pinch scale < 1.05 — сбрасываем в 1
      if (scale < 1.05) resetZoom();
      _gesture = 'idle';
      return;
    }

    const changedT = e.changedTouches[0];
    const dx = changedT.clientX - _startX;
    const dy = changedT.clientY - _startY;
    const dt = e.timeStamp - _startTime;
    const vy = dy / Math.max(dt, 1) * 1000; // px/s вертикальная скорость

    if (_gesture === 'closing') {
      if (dy > 100 || vy > 450) {
        _commitClose();
      } else {
        _resetCloseDrag(true);
      }
    } else if (_gesture === 'nav' && scale <= 1) {
      const vx = dx / Math.max(dt, 1) * 1000;
      if (Math.abs(dx) > 40 || Math.abs(vx) > 300) {
        if (dx < 0) next(); else prev();
      }
    }

    _gesture = 'idle';
    _t1 = _t2 = null;
  });

  lb.addEventListener('touchcancel', () => {
    if (_gesture === 'closing') _resetCloseDrag(true);
    _gesture = 'idle';
    _t1 = _t2 = null;
  });

  // ── Рендер ────────────────────────────────────────────────────
  function render(dir, fromThumbs) {
    const src = (typeof assetUrl === 'function')
      ? assetUrl(images[current])
      : (ROOT + images[current]);
    lbCounter.textContent = (current + 1) + ' / ' + images.length;
    lbPrev.disabled = current === 0;
    lbNext.disabled = current === images.length - 1;

    resetZoom();
    // При навигации стрелками/клавишами прячем UI, при навигации через панель — нет
    if (!fromThumbs) hideUI();

    if (dir) {
      lbWrap.classList.remove('lb-slide-in-right', 'lb-slide-in-left');
      lbImg.style.opacity = '0';
      setTimeout(() => {
        lbImg.src = src;
        lbImg.onload = () => {
          lbImg.style.opacity = '1';
          void lbWrap.offsetWidth;
          lbWrap.classList.add(dir === 'next' ? 'lb-slide-in-right' : 'lb-slide-in-left');
          setTimeout(() => lbWrap.classList.remove('lb-slide-in-right', 'lb-slide-in-left'), 280);
        };
      }, 110);
    } else {
      lbImg.src = src;
      lbImg.style.opacity = '1';
    }

    // Миниатюры
    if (lbTnRow) {
      Array.from(lbTnRow.children).forEach((t, i) => t.classList.toggle('active', i === current));
      const at = lbTnRow.children[current];
      if (at) at.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function renderThumbs() {
    if (!lbTnRow) return;
    lbTnRow.innerHTML = '';
    images.forEach((src, i) => {
      const tn = document.createElement('div');
      tn.className = 'lb-tn' + (i === current ? ' active' : '');
      const u = (typeof assetUrl === 'function') ? assetUrl(src) : (ROOT + src);
      tn.innerHTML = `<img src="${u}" alt="" loading="lazy">`;
      tn.addEventListener('click', () => {
        if (i === current) return;
        const dir = i > current ? 'next' : 'prev';
        current = i;
        render(dir, true); // fromThumbs=true → не прячем UI
      });
      lbTnRow.appendChild(tn);
    });
  }

  function prev() { if (current > 0) { current--; render('prev'); } }
  function next() { if (current < images.length - 1) { current++; render('next'); } }

  // ── Public API ─────────────────────────────────────────────────
  function setImages(imgs) { images = imgs || []; }

  function open(imgs, idx) {
    if (imgs) images = imgs;
    current = idx || 0;
    resetZoom();
    render();
    renderThumbs();
    lb.classList.add('open');
    // Если QuickView уже заблокировал скролл через position:fixed — не трогаем body
    if (!document.body.classList.contains('qv-open')) {
      document.body.style.overflow = 'hidden';
    }
    hideUI();
  }

  function close() {
    lb.classList.remove('open');
    // Восстанавливаем только если QuickView не держит блокировку
    if (!document.body.classList.contains('qv-open')) {
      document.body.style.overflow = '';
    }
    resetZoom();
    clearTimeout(hideTimer);
    hideUI();
  }

  // ── Кнопки ────────────────────────────────────────────────────
  lbClose.addEventListener('click', close);
  if (lbBack) lbBack.addEventListener('click', close);
  lbBg.addEventListener('click', (e) => { if (e.target === lbBg) close(); });
  lbPrev.addEventListener('click', prev);
  lbNext.addEventListener('click', next);
  lbZoomIn.addEventListener('click',  () => zoomAt( ZOOM_STEP));
  lbZoomOut.addEventListener('click', () => zoomAt(-ZOOM_STEP));

  // ── Клавиши — НЕ показывают UI ────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowUp':    prev();  break;
      case 'ArrowRight': case 'ArrowDown': next();  break;
      case 'Escape':                        close(); break;
      case '+': case '=': zoomAt( ZOOM_STEP, window.innerWidth/2, window.innerHeight/2); break;
      case '-':           zoomAt(-ZOOM_STEP, window.innerWidth/2, window.innerHeight/2); break;
    }
  });

  return { setImages, open, close, prev, next };
})();
