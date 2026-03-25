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

  // ── Touch swipe ───────────────────────────────────────────────
  lb.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });

  lb.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (Math.abs(dx) > 50 && dy < 80 && scale <= 1) {
      if (dx < 0) next(); else prev();
    }
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
    document.body.style.overflow = 'hidden';
    hideUI();
  }

  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
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
