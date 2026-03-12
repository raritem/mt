/* ================================================================
   WoT Shop — Лайтбокс v3
   • UI (тулбар/миниатюры) скрывается через 2.5с, показывается при движении мыши
   • Стрелки остаются, их фон прячется вместе с UI
   • Зум ограничен — нельзя выйти за границы изображения
   • Миниатюры сверху, тулбар снизу
   • Плавный slide-in/out
   ================================================================ */

'use strict';

window.LightBox = (() => {

  const lb        = document.getElementById('lightbox');
  const lbBg      = document.getElementById('lb-bg');
  const lbClose   = document.getElementById('lb-close');
  const lbPrev    = document.getElementById('lb-prev');
  const lbNext    = document.getElementById('lb-next');
  const lbImg     = document.getElementById('lb-img');
  const lbWrap    = document.getElementById('lb-img-wrap');
  const lbZoomIn  = document.getElementById('lb-zoom-in');
  const lbZoomOut = document.getElementById('lb-zoom-out');
  const lbCounter = document.getElementById('lb-counter');
  const lbThumbs  = document.getElementById('lb-thumbnails');
  const lbToolbar = document.getElementById('lb-toolbar');

  // ── Состояние ─────────────────────────────────────────────────
  let images  = [];
  let current = 0;

  // Зум и позиция
  let scale  = 1;
  let tx     = 0;  // translate X
  let ty     = 0;  // translate Y

  const ZOOM_MIN  = 1;
  const ZOOM_MAX  = 6;
  const ZOOM_STEP = 0.35;

  // Drag
  let dragging   = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // Touch swipe
  let touchStartX = 0;
  let touchStartY = 0;

  // Auto-hide UI
  let hideTimer = null;
  let uiVisible = false;

  // ── Авто-скрытие UI ───────────────────────────────────────────
  function showUI() {
    if (!uiVisible) {
      uiVisible = true;
      lb.classList.add('ui-visible');
    }
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideUI, 2500);
  }

  function hideUI() {
    uiVisible = false;
    lb.classList.remove('ui-visible');
    clearTimeout(hideTimer);
  }

  // UI показывается только при движении мыши внутри лайтбокса
  lb.addEventListener('mousemove', showUI, { passive: true });
  // При уходе мыши скрываем сразу
  lb.addEventListener('mouseleave', () => { clearTimeout(hideTimer); hideUI(); });

  // ── Трансформация изображения ─────────────────────────────────
  //
  // Зум применяется к lbImg.style.transform.
  // После каждого изменения clampPosition() ограничивает tx/ty
  // так чтобы изображение не уходило за пределы экрана.
  //
  function applyTransform() {
    clampPosition();
    lbImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    lbWrap.classList.toggle('zoomed', scale > 1);
  }

  // Ограничение позиции — нельзя выйти за границы изображения
  function clampPosition() {
    if (scale <= 1) { tx = 0; ty = 0; return; }
    const rect = lbImg.getBoundingClientRect();

    // Размер изображения при текущем масштабе
    // getBoundingClientRect уже включает scale, но нам нужен «логический» размер
    const baseW = lbImg.naturalWidth  ? lbImg.offsetWidth  : lbImg.clientWidth;
    const baseH = lbImg.naturalHeight ? lbImg.offsetHeight : lbImg.clientHeight;
    const scaledW = baseW * scale;
    const scaledH = baseH * scale;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Максимальное смещение: половина разницы между масштабированным и viewport
    const maxX = Math.max(0, (scaledW - vw)  / 2);
    const maxY = Math.max(0, (scaledH - vh) / 2);

    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }

  function resetZoom() {
    scale = 1; tx = 0; ty = 0;
    lbImg.style.transform = '';
    lbWrap.classList.remove('zoomed');
  }

  function zoomIn(cx, cy) {
    if (scale >= ZOOM_MAX) return;
    const prev = scale;
    scale = Math.min(ZOOM_MAX, parseFloat((scale + ZOOM_STEP).toFixed(2)));

    // Зумируем относительно точки курсора
    if (cx != null) {
      const imgRect = lbImg.getBoundingClientRect();
      const ox = cx - (imgRect.left + imgRect.width  / 2);
      const oy = cy - (imgRect.top  + imgRect.height / 2);
      tx -= ox * (scale / prev - 1);
      ty -= oy * (scale / prev - 1);
    }
    applyTransform();
  }

  function zoomOut(cx, cy) {
    if (scale <= ZOOM_MIN) return;
    const prev = scale;
    scale = Math.max(ZOOM_MIN, parseFloat((scale - ZOOM_STEP).toFixed(2)));

    if (cx != null && scale > 1) {
      const imgRect = lbImg.getBoundingClientRect();
      const ox = cx - (imgRect.left + imgRect.width  / 2);
      const oy = cy - (imgRect.top  + imgRect.height / 2);
      tx -= ox * (scale / prev - 1);
      ty -= oy * (scale / prev - 1);
    }
    applyTransform();
  }

  // ── Drag (только при зуме) ────────────────────────────────────
  lbImg.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    dragging   = true;
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

  // ── Wheel zoom ─────────────────────────────────────────────────
  lb.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn(e.clientX, e.clientY);
    else              zoomOut(e.clientX, e.clientY);
  }, { passive: false });

  // ── Double click ──────────────────────────────────────────────
  lbImg.addEventListener('dblclick', (e) => {
    if (scale > 1) resetZoom();
    else { zoomIn(e.clientX, e.clientY); zoomIn(e.clientX, e.clientY); }
  });

  // ── Touch ─────────────────────────────────────────────────────
  lb.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });

  lb.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (Math.abs(dx) > 50 && dy < 80) {
      if (dx < 0) next(); else prev();
    }
  });

  // ── Рендер слайда ─────────────────────────────────────────────
  function render(dir) {
    const src = ROOT + images[current];
    lbCounter.textContent = (current + 1) + ' / ' + images.length;
    lbPrev.disabled = (current === 0);
    lbNext.disabled = (current === images.length - 1);

    resetZoom();

    if (dir) {
      lbWrap.classList.remove('lb-slide-in-right', 'lb-slide-in-left');
      lbImg.style.opacity = '0';
      setTimeout(() => {
        lbImg.src = src;
        lbImg.onload = () => {
          lbImg.style.opacity = '1';
          void lbWrap.offsetWidth;
          lbWrap.classList.add(dir === 'next' ? 'lb-slide-in-right' : 'lb-slide-in-left');
          setTimeout(() => lbWrap.classList.remove('lb-slide-in-right', 'lb-slide-in-left'), 300);
        };
      }, 110);
    } else {
      lbImg.src = src;
      lbImg.style.opacity = '1';
    }

    // Активная миниатюра
    Array.from(lbThumbs.children).forEach((tn, i) => tn.classList.toggle('active', i === current));
    const activeTn = lbThumbs.children[current];
    if (activeTn) activeTn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function renderThumbs() {
    lbThumbs.innerHTML = '';
    images.forEach((src, i) => {
      const tn = document.createElement('div');
      tn.className = 'lb-tn' + (i === current ? ' active' : '');
      tn.innerHTML = `<img src="${ROOT}${src}" alt="" loading="lazy">`;
      tn.addEventListener('click', () => {
        if (i === current) return;
        const dir = i > current ? 'next' : 'prev';
        current = i;
        render(dir);
      });
      lbThumbs.appendChild(tn);
    });
  }

  // ── Навигация ─────────────────────────────────────────────────
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
    hideUI(); // начинаем со скрытым UI
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
  lbBg.addEventListener('click',    close);
  lbPrev.addEventListener('click',  prev);
  lbNext.addEventListener('click',  next);
  lbZoomIn.addEventListener('click',  () => zoomIn());
  lbZoomOut.addEventListener('click', () => zoomOut());

  // ── Клавиши — навигация НЕ показывает UI ─────────────────────
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    switch (e.key) {
      case 'ArrowLeft':  case 'ArrowUp':   prev();      break;
      case 'ArrowRight': case 'ArrowDown': next();      break;
      case 'Escape':                        close();     break;
      case '+': case '=':                   zoomIn();    break;
      case '-':                             zoomOut();   break;
    }
  });

  return { setImages, open, close, prev, next };
})();
