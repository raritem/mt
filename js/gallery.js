/* ================================================================
   WoT Shop — Лайтбокс (gallery.js)
   Fullscreen просмотр, zoom, drag, стрелки, миниатюры
   ================================================================ */

'use strict';

window.LightBox = (() => {
  // ── DOM ────────────────────────────────────────────────────────
  const lb        = document.getElementById('lightbox');
  const lbBg      = document.getElementById('lb-bg');
  const lbClose   = document.getElementById('lb-close');
  const lbPrev    = document.getElementById('lb-prev');
  const lbNext    = document.getElementById('lb-next');
  const lbImg     = document.getElementById('lb-img');
  const lbWrap    = document.getElementById('lb-img-wrap');
  const lbZoomIn  = document.getElementById('lb-zoom-in');
  const lbZoomOut = document.getElementById('lb-zoom-out');
  const lbReset   = document.getElementById('lb-zoom-reset');
  const lbCounter = document.getElementById('lb-counter');
  const lbThumbs  = document.getElementById('lb-thumbnails');

  // ── Состояние ──────────────────────────────────────────────────
  let images  = [];
  let current = 0;
  let scale   = 1;
  let posX    = 0;
  let posY    = 0;
  let dragging = false;
  let dragStartX = 0, dragStartY = 0;
  let lastPosX = 0, lastPosY = 0;

  // Для тачскрина — свайп
  let touchStartX = 0;
  let touchStartY = 0;

  // ── Public API ─────────────────────────────────────────────────

  function setImages(imgs) {
    images = imgs || [];
  }

  function open(imgs, idx) {
    if (imgs) images = imgs;
    current = idx || 0;
    resetZoom();
    render();
    renderThumbs();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    resetZoom();
  }

  // ── Рендер ────────────────────────────────────────────────────

  function render(dir) {
    const src = ROOT + images[current];
    lbCounter.textContent = (current + 1) + ' / ' + images.length;

    // Анимация перехода
    if (dir) {
      lbImg.classList.add('switching');
      setTimeout(() => {
        lbImg.src = src;
        lbImg.onload = () => {
          lbImg.classList.remove('switching');
          lbWrap.classList.remove('lb-slide-in-right', 'lb-slide-in-left');
          void lbWrap.offsetWidth;
          lbWrap.classList.add(dir === 'next' ? 'lb-slide-in-right' : 'lb-slide-in-left');
        };
      }, 150);
    } else {
      lbImg.src = src;
    }

    // Состояние стрелок
    lbPrev.disabled = (current === 0);
    lbNext.disabled = (current === images.length - 1);

    // Активная миниатюра
    Array.from(lbThumbs.children).forEach((tn, i) => {
      tn.classList.toggle('active', i === current);
    });

    // Скроллим к активной миниатюре
    const activeTn = lbThumbs.children[current];
    if (activeTn) {
      activeTn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    resetZoom();
  }

  function renderThumbs() {
    lbThumbs.innerHTML = '';
    images.forEach((src, i) => {
      const tn = document.createElement('div');
      tn.className = 'lb-tn' + (i === current ? ' active' : '');
      tn.innerHTML = `<img src="${ROOT}${src}" alt="" loading="lazy">`;
      tn.addEventListener('click', () => {
        const dir = i > current ? 'next' : 'prev';
        current = i;
        render(dir);
      });
      lbThumbs.appendChild(tn);
    });
  }

  // ── Навигация ─────────────────────────────────────────────────

  function prev() {
    if (current > 0) {
      current--;
      render('prev');
    }
  }

  function next() {
    if (current < images.length - 1) {
      current++;
      render('next');
    }
  }

  // ── Zoom ──────────────────────────────────────────────────────

  const ZOOM_MIN  = 1;
  const ZOOM_MAX  = 5;
  const ZOOM_STEP = 0.4;

  function applyTransform() {
    lbWrap.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    lbWrap.classList.toggle('zoomed', scale > 1);
  }

  function resetZoom() {
    scale = 1; posX = 0; posY = 0;
    lbWrap.style.transform = '';
    lbWrap.classList.remove('zoomed');
  }

  function zoomIn(cx, cy) {
    if (scale >= ZOOM_MAX) return;
    const prevScale = scale;
    scale = Math.min(ZOOM_MAX, scale + ZOOM_STEP);
    if (cx != null && cy != null) {
      const rect = lbImg.getBoundingClientRect();
      const imgCx = cx - rect.left - rect.width / 2;
      const imgCy = cy - rect.top  - rect.height / 2;
      posX -= imgCx * (scale / prevScale - 1);
      posY -= imgCy * (scale / prevScale - 1);
    }
    applyTransform();
  }

  function zoomOut() {
    if (scale <= ZOOM_MIN) return;
    scale = Math.max(ZOOM_MIN, scale - ZOOM_STEP);
    if (scale === 1) { posX = 0; posY = 0; }
    applyTransform();
  }

  // ── Drag ──────────────────────────────────────────────────────

  lbWrap.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    dragging = true;
    dragStartX = e.clientX - posX;
    dragStartY = e.clientY - posY;
    lbWrap.classList.add('dragging');
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    posX = e.clientX - dragStartX;
    posY = e.clientY - dragStartY;
    applyTransform();
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      lbWrap.classList.remove('dragging');
    }
  });

  // ── Wheel zoom ────────────────────────────────────────────────
  document.addEventListener('wheel', (e) => {
    if (!lb.classList.contains('open')) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      zoomIn(e.clientX, e.clientY);
    } else {
      zoomOut();
    }
  }, { passive: false });

  // ── Double click zoom ─────────────────────────────────────────
  lbImg.addEventListener('dblclick', (e) => {
    if (scale > 1) {
      resetZoom();
    } else {
      zoomIn(e.clientX, e.clientY);
      zoomIn(e.clientX, e.clientY);
    }
    applyTransform();
  });

  // ── Touch ─────────────────────────────────────────────────────
  lb.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });

  lb.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (Math.abs(dx) > 50 && dy < 60) {
      if (dx < 0) next();
      else prev();
    }
  });

  // ── Кнопки ────────────────────────────────────────────────────
  lbClose.addEventListener('click', close);
  lbBg.addEventListener('click', close);
  lbPrev.addEventListener('click', prev);
  lbNext.addEventListener('click', next);
  lbZoomIn.addEventListener('click',  () => { zoomIn();  applyTransform(); });
  lbZoomOut.addEventListener('click', () => { zoomOut(); });
  lbReset.addEventListener('click',   () => { resetZoom(); });

  // ── Клавиши ───────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    switch (e.key) {
      case 'ArrowLeft':  case 'ArrowUp':    prev();      break;
      case 'ArrowRight': case 'ArrowDown':  next();      break;
      case 'Escape':                         close();     break;
      case '+': case '=':                    zoomIn();  applyTransform(); break;
      case '-':                              zoomOut(); break;
      case '0':                              resetZoom(); break;
    }
  });

  return { setImages, open, close, prev, next };
})();
