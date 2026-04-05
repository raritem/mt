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
  const lbStage   = document.getElementById('lb-stage');
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

  // Touch state
  let touchStartX = 0, touchStartY = 0;

  // Touch engine state (physics)
  let _gesture     = 'idle';
  let _startX = 0, _startY = 0, _startTime = 0;
  let _prevX  = 0, _prevY  = 0, _prevTime  = 0;
  let _velX   = 0, _velY   = 0;
  let _panTx0 = 0, _panTy0 = 0;
  let _pinchDist0  = 0, _pinchScale0 = 1;
  let _pinchCx = 0, _pinchCy = 0;
  let _pinchStartCx = 0, _pinchStartCy = 0; // начальный центр щипка
  let _pinchPan0x = 0, _pinchPan0y = 0;     // начальный pan при старте щипка
  let _cancelInertia = null, _cancelSpring = null;

  // Double-tap state
  let _lastTapTime = 0, _lastTapX = 0, _lastTapY = 0;

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
    // Явно сбрасываем gesture чтобы следующий тач не думал что мы в pan
    _gesture = 'idle';
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

  // ════════════════════════════════════════════════════════════════
  // PHYSICS ENGINE v3 — Apple-accurate
  //
  // 1. INERTIA: UIScrollView точная формула
  //      p(t) = p0 + v0·τ·(1 - e^(-t/τ)),  τ = 325ms
  //    Per-frame: v[n+1] = v[n] * decayPerFrame,  decay = e^(-16/325) ≈ 0.9516
  //    Остановка: если палец не двигался >100ms до touchend → v=0
  //    (Apple отслеживает именно "finger still on screen", а не скорость)
  //
  // 2. SPRING: critically-damped, аналитическое решение
  //    x(t) = target + (x0-target)·(1+k·t)·e^(-k·t)  где k=8 (1/s)
  //    Per-frame lerp: x += (target-x)·(1-exp(-k·dt))
  //    Нет velocity propagation → нет осцилляций
  //
  // 3. RUBBER-BAND: Apple-formula
  //    x' = x - (x-limit)·(1 - 1/(|x-limit|/C + 1)),  C=120px
  //    За пределами сопротивление растёт по гиперболе
  //
  // 4. PINCH rubber-band на scale:
  //    rawScale → resistedScale через ту же гиперболу
  // ════════════════════════════════════════════════════════════════

  // Decay per 16ms frame: e^(-16/200) — τ=200ms как в iOS UIScrollView
  // (было 325ms — слишком долгая инерция, объект уходил далеко)
  const DECAY_PER_FRAME = 0.9231;
  // Spring stiffness: 1 - e^(-20*0.016) ≈ 0.274 — быстрый iOS-щелчок
  // (было k=8/0.119 — пружина была в ~2.5x медленнее)
  const SPRING_K = 0.274;
  // Rubber-band constant (px) — большое значение = мягче, дальше тянется
  const RB_C = 180;
  // Минимальная скорость для запуска инерции (px/frame)
  const INERTIA_MIN_VEL = 2.0;
  // Если палец не двигался дольше (ms) — инерции нет
  const STILL_THRESHOLD_MS = 80;

  // Настоящая Apple rubber-band формула (из Twitter @chpwn + подтверждена Яндексом):
  // f(x, d, c) = (x * d * c) / (d + c * x)
  // x — расстояние от края, d — размер контейнера, c = 0.55 (константа Apple)
  // В нашем случае d = viewport width/height
  const RB_APPLE_C = 0.55;
  function _rb(val, lo, hi) {
    if (val >= lo && val <= hi) return val;
    if (val < lo) {
      const x   = lo - val;          // расстояние от нижнего края (положительное)
      const d   = window.innerWidth; // используем viewport как d
      const res = (x * d * RB_APPLE_C) / (d + RB_APPLE_C * x);
      return lo - res;
    }
    const x   = val - hi;
    const d   = window.innerWidth;
    const res = (x * d * RB_APPLE_C) / (d + RB_APPLE_C * x);
    return hi + res;
  }

  // Friction при выходе за пределы масштаба — точно как в PhotoSwipe v5:
  // UPPER_ZOOM_FRICTION = 0.05  (выше max — очень жёстко)
  // LOWER_ZOOM_FRICTION = 0.15  (ниже min — чуть мягче)
  // currZoomLevel = limit + (curr - limit) * FRICTION
  function _rbScale(s, lo, hi) {
    if (s >= lo && s <= hi) return s;
    if (s < lo) return lo - (lo - s) * 0.15;
    return hi + (s - hi) * 0.05;
  }

  // Возвращает true если изображение при текущем масштабе занимает
  // всю высоту экрана (тогда pan вертикальный, иначе — swipe-to-close)
  function _imgFillsHeight() {
    const imgH = lbImg.offsetHeight * scale;
    return imgH >= window.innerHeight - 2; // 2px допуск на погрешность
  }

  // Применяем трансформ напрямую (без clamp)
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

  // Spring — точная копия PhotoSwipe v5 SpringEaser.easeFrame()
  // dampingRatio=1 (critically damped, нет осцилляций)
  // naturalFrequency=40 (PhotoSwipe использует именно 40 для zoom/pan)
  function _springTo(targetSc, targetTx, targetTy, onDone) {
    let cancelled = false;
    const DAMPING   = 1;
    const FREQUENCY = 40;
    // Состояние: displacement и velocity для каждой оси
    let dSc = scale - targetSc, vSc = 0;
    let dTx = tx    - targetTx, vTx = 0;
    let dTy = ty    - targetTy, vTy = 0;
    let prevTime = Date.now();

    function easeFrame(delta, vel, dt) {
      // Critically-damped (dampingRatio=1): per-frame точная формула
      const dtSec = dt / 1000;
      const pow  = Math.E ** (-DAMPING * FREQUENCY * dtSec);
      const coef = vel + FREQUENCY * delta;
      const newDelta = (delta + coef * dtSec) * pow;
      const newVel   = newDelta * (-FREQUENCY) + coef * pow;
      return { delta: newDelta, vel: newVel };
    }

    function step() {
      if (cancelled) return;
      const now = Date.now();
      const dt  = Math.min(now - prevTime, 64); // cap at 64ms
      prevTime  = now;

      const rSc = easeFrame(dSc, vSc, dt);
      const rTx = easeFrame(dTx, vTx, dt);
      const rTy = easeFrame(dTy, vTy, dt);
      dSc = rSc.delta; vSc = rSc.vel;
      dTx = rTx.delta; vTx = rTx.vel;
      dTy = rTy.delta; vTy = rTy.vel;

      scale = targetSc + dSc;
      tx    = targetTx + dTx;
      ty    = targetTy + dTy;
      _applyRaw(scale, tx, ty);

      // Условие остановки как в PhotoSwipe: |delta| < 1px и |vel| < 50px/s
      if (Math.abs(dSc) < 0.001 && Math.abs(vSc) < 0.05
       && Math.abs(dTx) < 1     && Math.abs(vTx) < 50
       && Math.abs(dTy) < 1     && Math.abs(vTy) < 50) {
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

  // Инерция — точная формула UIScrollView
  function _inertia(initVx, initVy) {
    let cancelled = false;
    let vx = initVx, vy = initVy;
    function step() {
      if (cancelled) return;
      vx *= DECAY_PER_FRAME;
      vy *= DECAY_PER_FRAME;
      const b  = _panBounds(scale);
      tx += vx; ty += vy;
      // Rubber-band за границей (позиция), скорость гасим пропорционально
      const rbTx = _rb(tx, b.minX, b.maxX);
      const rbTy = _rb(ty, b.minY, b.maxY);
      if (rbTx !== tx) { vx *= 0.5; }
      if (rbTy !== ty) { vy *= 0.5; }
      tx = rbTx; ty = rbTy;
      _applyRaw(scale, tx, ty);
      if (Math.abs(vx) < 0.15 && Math.abs(vy) < 0.15) {
        // Spring обратно к границам если вышли
        const clTx = Math.max(b.minX, Math.min(b.maxX, tx));
        const clTy = Math.max(b.minY, Math.min(b.maxY, ty));
        if (Math.abs(tx - clTx) > 0.2 || Math.abs(ty - clTy) > 0.2) {
          _cancelSpring = _springTo(scale, clTx, clTy);
        }
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    return () => { cancelled = true; };
  }

    function _stopAnimation() {
    if (_cancelInertia) { _cancelInertia(); _cancelInertia = null; }
    if (_cancelSpring)  { _cancelSpring();  _cancelSpring  = null; }
  }

  // ── Close-drag ───────────────────────────────────────────────
  function _applyCloseDrag(dy) {
    const p  = Math.min(1, dy / 350);
    lbWrap.style.transition = 'none';
    // Более явное уменьшение: от 1.0 до 0.70 (было 0.82)
    lbWrap.style.transform  = `translateY(${dy}px) scale(${1 - p * 0.30})`;
    lb.style.background     = `rgba(0,0,0,${1 - p * 0.92})`;
  }

  function _resetCloseDrag(animate) {
    lbWrap.style.transition = animate
      ? 'transform 0.22s cubic-bezier(0.34,1.4,0.64,1)'
      : 'none';
    lbWrap.style.transform = '';
    lb.style.transition = animate ? 'background 0.22s ease' : 'none';
    lb.style.background = '';
    if (animate) setTimeout(() => {
      lbWrap.style.transition = lb.style.transition = '';
    }, 240);
  }

  function _commitClose(vy, currentDy) {
    // iOS-анимация закрытия: фиксированная длительность,
    // кривая ease-in (разгон как падение под гравитацией).
    // В горизонтальном режиме экран короче по вертикали —
    // используем innerHeight чтобы duration был одинаковым.
    const duration = 200;
    lbWrap.style.transition = `transform ${duration}ms cubic-bezier(0.55,0,1,1)`;
    lbWrap.style.transform  = `translateY(${window.innerHeight}px) scale(0.9)`;
    lb.style.transition     = `background ${duration}ms ease-in`;
    lb.style.background     = 'rgba(0,0,0,0)';
    setTimeout(() => {
      lbWrap.style.transition = lbWrap.style.transform =
      lb.style.transition     = lb.style.background    = '';
      close();
    }, duration + 10);
  }

  // ── touchstart ───────────────────────────────────────────────
  // Вешаем на lb-stage, а не на lb — чтобы кнопки (close, arrows, zoom)
  // не блокировались preventDefault на мобилке
  lbStage.addEventListener('touchstart', (e) => {
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
      // Запоминаем начальный центр и pan — для PhotoSwipe pan-формулы
      _pinchStartCx = m.x; _pinchStartCy = m.y;
      _pinchPan0x   = tx;  _pinchPan0y   = ty;
      _gesture = 'pinch';
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

      // Double-tap детектим здесь — работает при любом scale
      const now      = e.timeStamp;
      const timeDiff = now - _lastTapTime;
      const distDiff = Math.hypot(t.clientX - _lastTapX, t.clientY - _lastTapY);
      _lastTapTime = now;
      _lastTapX = t.clientX;
      _lastTapY = t.clientY;

      if (timeDiff < 300 && timeDiff > 0 && distDiff < 40) {
        // Double-tap подтверждён — сбрасываем чтобы тройной не триггерил
        _lastTapTime = 0;
        _gesture = 'doubletap';
        return;
      }

      if (scale > 1 && _imgFillsHeight()) {
        _gesture = 'pan';
      } else {
        _gesture = 'deciding';
      }
    }
  }, { passive: false });

  // ── touchmove ────────────────────────────────────────────────
  lbStage.addEventListener('touchmove', (e) => {
    e.preventDefault();

    // PINCH
    if (_gesture === 'pinch' && e.touches.length >= 2) {
      const a = e.touches[0], b = e.touches[1];
      const p1 = { x: a.clientX, y: a.clientY };
      const p2 = { x: b.clientX, y: b.clientY };
      const curDist  = _dist(p1, p2);
      const rawScale = _pinchScale0 * (curDist / _pinchDist0);
      const newScale = _rbScale(rawScale, ZOOM_MIN, ZOOM_MAX);

      // Pan по формуле PhotoSwipe _calculatePanForZoomLevel:
      // pan = zoomPoint - (startZoomPoint - startPan) * zoomFactor
      // Это единственная формула которая не даёт смещения при оверзуме
      const m = _mid(p1, p2);
      const zoomFactor = newScale / _pinchScale0;
      tx = m.x - (_pinchStartCx - _pinchPan0x) * zoomFactor;
      ty = m.y - (_pinchStartCy - _pinchPan0y) * zoomFactor;

      scale = newScale;
      _applyRaw(scale, tx, ty);
      return;
    }

    if (e.touches.length !== 1) return;
    const t  = e.touches[0];
    const cx = t.clientX, cy = t.clientY;
    const dx = cx - _startX, dy = cy - _startY;
    const dt = Math.max(e.timeStamp - _prevTime, 1);

    // Velocity: среднее последних 3 фреймов (баланс стабильности и отзывчивости)
    const rawVx = (cx - _prevX) / dt * 16;
    const rawVy = (cy - _prevY) / dt * 16;
    _velX = _velX * 0.5 + rawVx * 0.5;
    _velY = _velY * 0.5 + rawVy * 0.5;
    _prevX = cx; _prevY = cy; _prevTime = e.timeStamp;

    // PAN при зуме с Apple rubber-band у стен
    if (_gesture === 'pan') {
      const b = _panBounds(scale);
      if (_imgFillsHeight()) {
        // Изображение занимает всю высоту — двигаем и по X и по Y
        tx = _rb(_panTx0 + dx, b.minX, b.maxX);
        ty = _rb(_panTy0 + dy, b.minY, b.maxY);
      } else {
        // Изображение НЕ занимает всю высоту (landscape/широкое фото):
        // двигаем ТОЛЬКО по X. Вертикаль — только через swipe-to-close.
        tx = _rb(_panTx0 + dx, b.minX, b.maxX);
        ty = 0;
      }
      _applyRaw(scale, tx, ty);
      return;
    }

    // Определяем жест
    if (_gesture === 'deciding' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      if (scale > 1 && !_imgFillsHeight()) {
        // Зумировано, но не на всю высоту:
        // горизонт → pan-x, вниз → closing
        _gesture = Math.abs(dx) >= Math.abs(dy) ? 'pan' : 'closing';
      } else if (scale > 1) {
        // На всю высоту — pan по обеим осям
        _gesture = 'pan';
      } else if (_imgFillsHeight()) {
        // scale==1, изображение на весь экран (portrait) — вниз закрывает
        _gesture = (Math.abs(dy) > Math.abs(dx) && dy > 0) ? 'closing' : 'nav';
      } else {
        // scale==1, не на весь экран (landscape) — любой вниз закрывает
        _gesture = Math.abs(dx) > Math.abs(dy) ? 'nav' : 'closing';
      }
    }

    if (_gesture === 'closing') _applyCloseDrag(Math.max(0, dy));
  }, { passive: false });

  // ── touchend ─────────────────────────────────────────────────
  lbStage.addEventListener('touchend', (e) => {

    // PINCH end — spring к ближайшему допустимому масштабу
    if (_gesture === 'pinch') {
      const tSc = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));

      if (tSc <= 1.05) {
        // Сброс к scale=1: центрируем
        _cancelSpring = _springTo(1, 0, 0, resetZoom);
      } else {
        // Пересчёт tx/ty: зажимаем в допустимые границы для tSc.
        // НЕ пересчитываем через логические координаты — это и давало смещение,
        // потому что scale был искажён rubber-band.
        // Просто клампим текущий tx/ty к границам нового масштаба.
        const b   = _panBounds(tSc);
        const tTx = Math.max(b.minX, Math.min(b.maxX, tx));
        const tTy = Math.max(b.minY, Math.min(b.maxY, ty));
        _cancelSpring = _springTo(tSc, tTx, tTy, () => applyTransform());
      }
      _gesture = 'idle';
      return;
    }

    const t  = e.changedTouches[0];
    const dx = t.clientX - _startX;
    const dy = t.clientY - _startY;
    const dt = Math.max(e.timeStamp - _startTime, 1);

    // PAN end — инерция только если палец двигался до самого отпускания
    if (_gesture === 'pan') {
      const b  = _panBounds(scale);

      // Apple: инерции нет если палец "завис" перед отпусканием
      const stillMs = e.timeStamp - _prevTime;
      const moving  = stillMs < STILL_THRESHOLD_MS;
      const speed   = moving
        ? Math.sqrt(_velX * _velX + _velY * _velY)
        : 0;

      if (speed >= INERTIA_MIN_VEL) {
        // Если высота не заполнена — инерция только по X
        const inVx = _velX;
        const inVy = _imgFillsHeight() ? _velY : 0;
        _cancelInertia = _inertia(inVx, inVy);
      } else {
        const clTx = Math.max(b.minX, Math.min(b.maxX, tx));
        const clTy = Math.max(b.minY, Math.min(b.maxY, ty));
        if (Math.abs(tx - clTx) > 0.2 || Math.abs(ty - clTy) > 0.2) {
          _cancelSpring = _springTo(scale, clTx, clTy);
        }
      }

    // CLOSING
    } else if (_gesture === 'closing') {
      const vy = dy / dt * 1000;
      (dy > 80 || vy > 280) ? _commitClose(vy, dy) : _resetCloseDrag(true);

    // NAV
    } else if (_gesture === 'nav' && scale <= 1) {
      const vx = dx / dt * 1000;
      if (Math.abs(dx) > 40 || Math.abs(vx) > 300) {
        dx < 0 ? next() : prev();
      }

    // DOUBLETAP — детектируется в touchstart, выполняется в touchend
    } else if (_gesture === 'doubletap') {
      const tapX = e.changedTouches[0].clientX;
      const tapY = e.changedTouches[0].clientY;
      _stopAnimation();
      if (scale > 1.05) {
        _cancelSpring = _springTo(1, 0, 0, resetZoom);
      } else {
        const TARGET = 2.5;
        const vw = window.innerWidth, vh = window.innerHeight;
        const lx = (tapX - vw/2 - tx) / scale;
        const ly = (tapY - vh/2 - ty) / scale;
        const tTxRaw = tapX - vw/2 - lx * TARGET;
        const tTyRaw = tapY - vh/2 - ly * TARGET;
        const b   = _panBounds(TARGET);
        const tTx = Math.max(b.minX, Math.min(b.maxX, tTxRaw));
        const tTy = Math.max(b.minY, Math.min(b.maxY, tTyRaw));
        _cancelSpring = _springTo(TARGET, tTx, tTy, () => applyTransform());
      }

    // DECIDING — одиночный тап (ничего не делаем)
    } else if (_gesture === 'deciding') {
      // одиночный тап — no-op
    }

    _gesture = 'idle';
  });

  lbStage.addEventListener('touchcancel', () => {
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
