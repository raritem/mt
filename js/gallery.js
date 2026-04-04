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
  // TOUCH ENGINE — iOS-quality pinch/pan/inertia/rubber-band
  //
  // Жесты (определяются по первым 8px, не конфликтуют):
  //   'deciding' → ждём пока движение не достигнет порога
  //   'closing'  → свайп вниз при scale=1 (drag-to-close)
  //   'nav'      → горизонтальный свайп при scale=1 (навигация)
  //   'pan'      → 1 палец при scale>1 (перемещение с инерцией)
  //   'pinch'    → 2 пальца (зум с rubber-band за пределами)
  //
  // Rubber-band: за пределами лимитов сопротивление 0.55
  // Инерция: rAF-анимация с экспоненциальным затуханием
  // Отскок: spring при выходе за границы после инерции/pinch
  // ══════════════════════════════════════════════════════════════

  // ── Вспомогательные ──────────────────────────────────────────
  function _dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  function _mid(a, b)  { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  // Rubber-band: Apple-style сопротивление за пределами [min,max]
  function _rubberBand(val, min, max) {
    if (val >= min && val <= max) return val;
    const limit = val < min ? min : max;
    const over  = val - limit;
    return limit + over * 0.45;
  }

  // Применяем трансформ напрямую (без clamp — для rubber-band)
  function _applyRaw(sc, x, y) {
    lbImg.style.transform = `translate(${x}px,${y}px) scale(${sc})`;
    lbWrap.classList.toggle('zoomed', sc > 1);
  }

  // Границы pan для заданного масштаба
  function _panBounds(sc) {
    const bw = lbImg.offsetWidth  * sc;
    const bh = lbImg.offsetHeight * sc;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mx = Math.max(0, (bw - vw)  / 2);
    const my = Math.max(0, (bh - vh) / 2);
    return { minX: -mx, maxX: mx, minY: -my, maxY: my };
  }

  // ── Critically-damped spring (нет осцилляций, 1 плавный приход) ──
  // Используем экспоненциальную интерполяцию — как CSS ease-out,
  // но прерываемую и с корректным velocity при старте.
  // factor ≈ 0.72 даёт ~300ms до settlment при 60fps, без перелёта.
  function _springTo(targetSc, targetTx, targetTy, onDone) {
    let cancelled = false;
    // Critically damped: позиция = target + (start-target)*exp(-k*t)
    // Реализуем через per-frame lerp с фиксированным коэффициентом.
    // factor 0.78 = ~критическое затухание, ноль осцилляций.
    const F = 0.78;

    function step() {
      if (cancelled) return;

      const dSc = targetSc - scale;
      const dTx = targetTx - tx;
      const dTy = targetTy - ty;

      scale += dSc * (1 - F);
      tx    += dTx * (1 - F);
      ty    += dTy * (1 - F);

      _applyRaw(scale, tx, ty);

      // Критерий остановки
      if (Math.abs(dSc) < 0.0008 && Math.abs(dTx) < 0.15 && Math.abs(dTy) < 0.15) {
        scale = targetSc; tx = targetTx; ty = targetTy;
        _applyRaw(scale, tx, ty);
        if (onDone) onDone();
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    return () => { cancelled = true; };
  }

  // ── Инерция — точная модель iOS ────────────────────────────────
  // iOS использует decay функцию: p(t) = p0 + v0 * (1 - exp(-t/τ)) * τ
  // Реализуем через per-frame: v *= decayFactor каждые 16ms.
  // decayFactor 0.95 → τ ≈ 300ms (соответствует UIScrollView).
  //
  // Velocity-cutoff: если скорость при touchend < MIN_VEL — инерции нет.
  // Это решает проблему «плывёт при медленном свайпе».
  //
  // За границей: inertia продолжается с rubber-band затуханием,
  // после остановки — _springTo возвращает без осцилляций.
  const INERTIA_MIN_VEL = 2.5; // px/frame — порог для запуска инерции

  function _inertia(initVx, initVy) {
    let cancelled = false;
    let vx = initVx, vy = initVy;

    // iOS-style decay: быстро в начале, плавно в конце
    // decayPerFrame для 60fps: 0.95 → τ≈300ms
    const DECAY = 0.95;
    // За границей скорость дополнительно гасится
    const BOUNDARY_DAMP = 0.6;

    function step() {
      if (cancelled) return;

      vx *= DECAY;
      vy *= DECAY;

      const b = _panBounds(scale);

      // Обновляем позицию
      let nx = tx + vx;
      let ny = ty + vy;

      // За границей — rubber-band (позиция) + гасим скорость
      const overX = nx < b.minX ? nx - b.minX : nx > b.maxX ? nx - b.maxX : 0;
      const overY = ny < b.minY ? ny - b.minY : ny > b.maxY ? ny - b.maxY : 0;

      if (overX !== 0) {
        // Rubber-band: чем дальше за границу — тем сильнее сопротивление
        nx = (nx < b.minX ? b.minX : b.maxX) + overX * 0.4;
        vx *= BOUNDARY_DAMP; // гасим скорость у стены
      }
      if (overY !== 0) {
        ny = (ny < b.minY ? b.minY : b.maxY) + overY * 0.4;
        vy *= BOUNDARY_DAMP;
      }

      tx = nx; ty = ny;
      _applyRaw(scale, tx, ty);

      // Стоп: скорость упала до нуля
      if (Math.abs(vx) < 0.15 && Math.abs(vy) < 0.15) {
        // Если вышли за границу — spring обратно (без осцилляций)
        const clTx = Math.max(b.minX, Math.min(b.maxX, tx));
        const clTy = Math.max(b.minY, Math.min(b.maxY, ty));
        if (Math.abs(tx - clTx) > 0.3 || Math.abs(ty - clTy) > 0.3) {
          _cancelSpring = _springTo(scale, clTx, clTy);
        }
        return;
      }

      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    return () => { cancelled = true; };
  }

  // ── Состояние touch ──────────────────────────────────────────
  let _gesture   = 'idle';
  let _startX    = 0, _startY = 0, _startTime = 0;
  let _prevX     = 0, _prevY  = 0, _prevTime  = 0;
  let _velX      = 0, _velY   = 0;
  let _pinchDist0 = 0, _pinchScale0 = 1;
  let _pinchCx    = 0, _pinchCy    = 0;
  let _panTx0     = 0, _panTy0     = 0;
  let _cancelInertia = null, _cancelSpring = null;

  function _stopAnimation() {
    if (_cancelInertia) { _cancelInertia(); _cancelInertia = null; }
    if (_cancelSpring)  { _cancelSpring();  _cancelSpring  = null; }
  }

  // ── Close-drag ───────────────────────────────────────────────
  function _applyCloseDrag(dy) {
    const p  = Math.min(1, dy / 350);
    lbWrap.style.transition = 'none';
    lbWrap.style.transform  = `translateY(${dy}px) scale(${1 - p * 0.18})`;
    lb.style.background     = `rgba(0,0,0,${1 - p * 0.92})`;
  }

  function _resetCloseDrag(animate) {
    lbWrap.style.transition = animate
      ? 'transform 0.36s cubic-bezier(0.34,1.56,0.64,1)'
      : 'none';
    lbWrap.style.transform = '';
    lb.style.transition = animate ? 'background 0.32s ease' : 'none';
    lb.style.background = '';
    if (animate) setTimeout(() => {
      lbWrap.style.transition = lb.style.transition = '';
    }, 380);
  }

  function _commitClose() {
    lbWrap.style.transition = 'transform 0.28s cubic-bezier(0.4,0,1,1)';
    lbWrap.style.transform  = `translateY(${window.innerHeight}px) scale(0.85)`;
    lb.style.transition     = 'background 0.28s ease';
    lb.style.background     = 'rgba(0,0,0,0)';
    setTimeout(() => {
      lbWrap.style.transition = lbWrap.style.transform =
      lb.style.transition     = lb.style.background    = '';
      close();
    }, 280);
  }

  // ── touchstart ───────────────────────────────────────────────
  lb.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _stopAnimation();

    if (e.touches.length >= 2) {
      const a = e.touches[0], b = e.touches[1];
      const p1 = { x: a.clientX, y: a.clientY };
      const p2 = { x: b.clientX, y: b.clientY };
      _pinchDist0  = _dist(p1, p2);
      _pinchScale0 = scale;
      const m = _mid(p1, p2);
      _pinchCx = m.x; _pinchCy = m.y;
      _gesture = 'pinch';
      // Сбросить close-drag если был
      lbWrap.style.transition = lbWrap.style.transform =
      lb.style.transition     = lb.style.background    = '';
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      _startX = _prevX = t.clientX;
      _startY = _prevY = t.clientY;
      _startTime = _prevTime = e.timeStamp;
      _velX = _velY = 0;
      _panTx0 = tx; _panTy0 = ty;
      _gesture = scale > 1 ? 'pan' : 'deciding';
    }
  }, { passive: false });

  // ── touchmove ────────────────────────────────────────────────
  lb.addEventListener('touchmove', (e) => {
    e.preventDefault();

    // PINCH
    if (_gesture === 'pinch' && e.touches.length >= 2) {
      const a = e.touches[0], b = e.touches[1];
      const p1 = { x: a.clientX, y: a.clientY };
      const p2 = { x: b.clientX, y: b.clientY };
      const curDist  = _dist(p1, p2);
      const rawScale = _pinchScale0 * (curDist / _pinchDist0);

      // Rubber-band за пределами: Apple-style сопротивление
      const OVER_MIN = ZOOM_MIN * 0.65;
      const OVER_MAX = ZOOM_MAX * 1.35;
      const newScale = Math.max(OVER_MIN, Math.min(OVER_MAX, rawScale));

      // Зум в центр щипка
      const vw = window.innerWidth, vh = window.innerHeight;
      const lx = (_pinchCx - vw/2 - tx) / scale;
      const ly = (_pinchCy - vh/2 - ty) / scale;
      scale = newScale;
      tx = _pinchCx - vw/2 - lx * scale;
      ty = _pinchCy - vh/2 - ly * scale;

      // Pan центра щипка
      const m = _mid(p1, p2);
      tx += m.x - _pinchCx;
      ty += m.y - _pinchCy;
      _pinchCx = m.x; _pinchCy = m.y;

      _applyRaw(scale, tx, ty);
      return;
    }

    if (e.touches.length !== 1) return;
    const t  = e.touches[0];
    const cx = t.clientX, cy = t.clientY;
    const dx = cx - _startX, dy = cy - _startY;
    const dt = Math.max(e.timeStamp - _prevTime, 1);

    // EMA velocity для инерции
    const alpha = 0.4;
    _velX = _velX * (1 - alpha) + ((cx - _prevX) / dt * 16) * alpha;
    _velY = _velY * (1 - alpha) + ((cy - _prevY) / dt * 16) * alpha;
    _prevX = cx; _prevY = cy; _prevTime = e.timeStamp;

    // PAN при зуме с rubber-band у стен
    if (_gesture === 'pan') {
      const b = _panBounds(scale);
      tx = _rubberBand(_panTx0 + dx, b.minX, b.maxX);
      ty = _rubberBand(_panTy0 + dy, b.minY, b.maxY);
      _applyRaw(scale, tx, ty);
      return;
    }

    // Определяем жест
    if (_gesture === 'deciding' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      _gesture = (Math.abs(dy) > Math.abs(dx) && dy > 0) ? 'closing' : 'nav';
    }

    if (_gesture === 'closing') _applyCloseDrag(Math.max(0, dy));
  }, { passive: false });

  // ── touchend ─────────────────────────────────────────────────
  lb.addEventListener('touchend', (e) => {

    // PINCH end — spring к ближайшему допустимому масштабу
    if (_gesture === 'pinch') {
      const tSc = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));

      if (tSc <= 1.05) {
        // Сброс к scale=1: центрируем
        _cancelSpring = _springTo(1, 0, 0, resetZoom);
      } else {
        // Пересчёт tx/ty под целевой масштаб:
        // Логическая точка под центром экрана остаётся на месте.
        const vw = window.innerWidth, vh = window.innerHeight;
        const lx = (vw/2 - tx) / scale;  // логические координаты центра
        const ly = (vh/2 - ty) / scale;
        const tTxRaw = vw/2 - lx * tSc;
        const tTyRaw = vh/2 - ly * tSc;
        const b   = _panBounds(tSc);
        const tTx = Math.max(b.minX, Math.min(b.maxX, tTxRaw));
        const tTy = Math.max(b.minY, Math.min(b.maxY, tTyRaw));
        _cancelSpring = _springTo(tSc, tTx, tTy, () => applyTransform());
      }
      _gesture = 'idle';
      return;
    }

    const t  = e.changedTouches[0];
    const dx = t.clientX - _startX;
    const dy = t.clientY - _startY;
    const dt = Math.max(e.timeStamp - _startTime, 1);

    // PAN end — инерция только при реально быстром свайпе
    if (_gesture === 'pan') {
      const b  = _panBounds(scale);

      // Velocity-cutoff: если последнее движение было >80ms назад
      // (палец "завис") — считаем скорость нулём. Как iOS.
      const timeSinceLastMove = e.timeStamp - _prevTime;
      const effectiveVx = timeSinceLastMove > 80 ? 0 : _velX;
      const effectiveVy = timeSinceLastMove > 80 ? 0 : _velY;

      const speed = Math.sqrt(effectiveVx * effectiveVx + effectiveVy * effectiveVy);

      if (speed >= INERTIA_MIN_VEL) {
        // Запускаем инерцию — она сама справится с границами
        _cancelInertia = _inertia(effectiveVx, effectiveVy);
      } else {
        // Нет инерции — просто spring к границам если вышли
        const clTx = Math.max(b.minX, Math.min(b.maxX, tx));
        const clTy = Math.max(b.minY, Math.min(b.maxY, ty));
        if (Math.abs(tx - clTx) > 0.3 || Math.abs(ty - clTy) > 0.3) {
          _cancelSpring = _springTo(scale, clTx, clTy);
        }
      }

    // CLOSING
    } else if (_gesture === 'closing') {
      const vy = dy / dt * 1000;
      (dy > 100 || vy > 450) ? _commitClose() : _resetCloseDrag(true);

    // NAV
    } else if (_gesture === 'nav' && scale <= 1) {
      const vx = dx / dt * 1000;
      if (Math.abs(dx) > 40 || Math.abs(vx) > 300) {
        dx < 0 ? next() : prev();
      }
    }

    _gesture = 'idle';
  });

  lb.addEventListener('touchcancel', () => {
    if (_gesture === 'closing') _resetCloseDrag(true);
    _stopAnimation();
    _gesture = 'idle';
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
