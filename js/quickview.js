/* ================================================================
   WoT Shop — Quick View Modal (quickview.js)
   Ленивая загрузка данных лота + отображение в модалке
   ================================================================ */

'use strict';

window.QuickView = (() => {

  // ── Состояние ────────────────────────────────────────────────
  let _modal        = null;   // DOM-узел модалки (создаётся один раз)
  let _currentLotId = null;
  let _prevUrl      = null;   // URL до открытия (для History API)
  let _scrollY      = 0;      // Позиция скролла страницы
  let _galleryImages = [];
  let _galIdx        = 0;
  let _isOpen        = false;

  // ── Создание DOM (один раз) ──────────────────────────────────
  function _buildModal() {
    const el = document.createElement('div');
    el.id = 'qv-modal';
    el.className = 'qv-modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Быстрый просмотр');
    el.innerHTML = `
      <div class="qv-backdrop" id="qv-backdrop"></div>
      <div class="qv-dialog" id="qv-dialog">
        <button class="qv-close" id="qv-close" aria-label="Закрыть">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- Спиннер загрузки -->
        <div class="qv-spinner" id="qv-spinner">
          <div class="spinner"></div>
        </div>

        <!-- Контент — виден сразу, скелетон в HTML -->
        <div class="qv-content" id="qv-content">
          <!-- Левая панель: галерея -->
          <div class="qv-gallery" id="qv-gallery">
            <div class="qv-img-stage" id="qv-img-stage" data-skeleton="1">
              <img id="qv-img" class="qv-main-img" src="" alt="">
              <!-- Оверлей увеличения по клику -->
              <div class="qv-zoom-overlay" id="qv-zoom-overlay" title="Открыть во весь экран">
                <svg class="qv-zoom-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="11" y1="8" x2="11" y2="14"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </div>
              <button class="qv-arrow qv-prev" id="qv-prev" aria-label="Предыдущий" style="display:none">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <button class="qv-arrow qv-next" id="qv-next" aria-label="Следующий" style="display:none">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              <div class="qv-counter" id="qv-counter" style="display:none">1 / 1</div>
            </div>
            <!-- Полоса миниатюр — 4 скелетных заглушки сразу -->
            <div class="qv-thumbs" id="qv-thumbs">
              <div class="qv-thumb-skeleton"></div>
              <div class="qv-thumb-skeleton"></div>
              <div class="qv-thumb-skeleton"></div>
              <div class="qv-thumb-skeleton"></div>
            </div>
          </div>

          <!-- Правая панель: информация -->
          <div class="qv-info" id="qv-info">
            <h2 class="qv-title" id="qv-title"></h2>
            <div class="qv-tanks10" id="qv-tanks10"></div>
            <div class="qv-badges" id="qv-badges"></div>
            <div class="qv-resources" id="qv-resources"></div>
            <div class="qv-price-row" id="qv-price-row"></div>
            <div class="qv-actions" id="qv-actions"></div>
            <a class="qv-full-link" id="qv-full-link" href="#">
              Больше информации об аккаунте
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          </div>
        </div>

        <!-- Ошибка -->
        <div class="qv-error qv-hidden" id="qv-error">
          <div class="empty-icon">⚠️</div>
          <p id="qv-error-msg">Ошибка загрузки</p>
        </div>
      </div>
      <div class="qv-fill-area"></div>
    `;

    document.body.appendChild(el);

    // Safari 26 Liquid Glass: сразу скрываем через display:none.
    // Только так position:fixed элемент исключается из алгоритма тинтинга панели.
    // display:flex вернём при открытии, display:none — после анимации закрытия.
    el.style.display = 'none';

    // Закрытие по бекдропу
    el.querySelector('#qv-backdrop').addEventListener('click', close);
    el.querySelector('#qv-close').addEventListener('click', close);

    // Стрелки галереи
    el.querySelector('#qv-prev').addEventListener('click', (e) => {
      e.stopPropagation();
      _navigate(-1);
    });
    el.querySelector('#qv-next').addEventListener('click', (e) => {
      e.stopPropagation();
      _navigate(1);
    });

    // Клик на изображение / оверлей → открыть лайтбокс
    el.querySelector('#qv-zoom-overlay').addEventListener('click', (e) => {
      e.stopPropagation();
      _openLightbox();
    });
    el.querySelector('#qv-img').addEventListener('click', (e) => {
      e.stopPropagation();
      _openLightbox();
    });

    // Блокируем wheel-события внутри диалога (не даём скроллить фон),
    // но разрешаем wheel на полосе миниатюр
    el.querySelector('#qv-dialog').addEventListener('wheel', (e) => {
      const thumbs = el.querySelector('#qv-thumbs');
      if (thumbs && thumbs.contains(e.target)) return; // пропускаем — пусть скроллит thumbs
      e.stopPropagation();
    }, { passive: true });

    // ── Drag-to-scroll для полосы миниатюр ─────────────────────
    const thumbsEl = el.querySelector('#qv-thumbs');
    let _dragScrolling = false;
    let _dragStartX = 0;
    let _dragScrollLeft = 0;

    thumbsEl.addEventListener('mousedown', (e) => {
      _dragScrolling = true;
      _dragStartX = e.pageX - thumbsEl.offsetLeft;
      _dragScrollLeft = thumbsEl.scrollLeft;
      thumbsEl.style.cursor = 'grabbing';
      thumbsEl.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mouseup', () => {
      if (!_dragScrolling) return;
      _dragScrolling = false;
      thumbsEl.style.cursor = '';
      thumbsEl.style.userSelect = '';
    });

    document.addEventListener('mousemove', (e) => {
      if (!_dragScrolling) return;
      const x = e.pageX - thumbsEl.offsetLeft;
      const walk = x - _dragStartX;
      thumbsEl.scrollLeft = _dragScrollLeft - walk;
    });

    // Запрет drag-ghost на изображениях внутри миниатюр
    thumbsEl.addEventListener('dragstart', (e) => e.preventDefault());

    // Колёсико мыши — горизонтальный скролл миниатюр
    thumbsEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      thumbsEl.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
    }, { passive: false });

    // Клавиатура
    document.addEventListener('keydown', _onKeyDown);

    _initSwipeClose(el);
    return el;
  }

  // ── Открыть лайтбокс с текущим изображением ─────────────────
  function _openLightbox() {
    if (!_galleryImages.length) return;
    // LightBox определён в gallery.js и подключён только на lot/
    // Если его нет — ничего не делаем (shop/ не подключает gallery.js)
    if (window.LightBox) {
      window.LightBox.open(_galleryImages, _galIdx);
    }
  }

  // ── Навигация по галерее ─────────────────────────────────────
  function _navigate(dir) {
    if (!_galleryImages.length) return;
    _galIdx = (_galIdx + dir + _galleryImages.length) % _galleryImages.length;
    _showImage(_galIdx);
  }

  function _showImage(idx) {
    if (!_modal) return;
    const img     = _modal.querySelector('#qv-img');
    const counter = _modal.querySelector('#qv-counter');
    const thumbs  = _modal.querySelectorAll('.qv-thumb');

    img.classList.add('qv-img--loading');
    img.src = assetUrl(_galleryImages[idx]);
    img.onload  = () => { img.classList.remove('qv-img--loading'); img.classList.add('qv-img--ready'); };
    img.onerror = () => { img.classList.remove('qv-img--loading'); img.classList.add('qv-img--ready'); };

    counter.textContent = `${idx + 1} / ${_galleryImages.length}`;
    thumbs.forEach((t, i) => t.classList.toggle('qv-thumb--active', i === idx));
    // Прокручиваем карусель превьюшек к активному элементу (как в лайтбоксе)
    const activeThumb = _modal.querySelector('.qv-thumb--active');
    if (activeThumb) activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    _galIdx = idx;
  }

  // ── Клавиатурные события ─────────────────────────────────────
  function _onKeyDown(e) {
    if (!_isOpen) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowLeft')  { _navigate(-1); return; }
    if (e.key === 'ArrowRight') { _navigate(1);  return; }
  }

  // ── Touch: pinch-zoom + pan + swipe-down-to-close на img-stage ─
  function _initSwipeClose(modal) {
    const stage   = modal.querySelector('#qv-img-stage');
    const imgEl   = modal.querySelector('#qv-img');
    const dialog  = modal.querySelector('#qv-dialog');
    if (!stage || !imgEl) return;

    // Состояние трансформации изображения
    let _sc = 1, _tx = 0, _ty = 0;
    const SC_MAX = 5, SC_MIN = 1;

    function _applyImgTransform() {
      // Clamp pan при зуме
      if (_sc <= 1) { _tx = 0; _ty = 0; }
      else {
        const bw = imgEl.offsetWidth, bh = imgEl.offsetHeight;
        const vw = stage.offsetWidth,  vh = stage.offsetHeight;
        const mx = Math.max(0, (bw * _sc - vw)  / 2);
        const my = Math.max(0, (bh * _sc - vh) / 2);
        _tx = Math.max(-mx, Math.min(mx, _tx));
        _ty = Math.max(-my, Math.min(my, _ty));
      }
      imgEl.style.transform = _sc > 1
        ? `translate(${_tx}px,${_ty}px) scale(${_sc})`
        : '';
      stage.style.cursor = _sc > 1 ? 'grab' : '';
    }

    function _resetImgTransform(animate) {
      if (animate) {
        imgEl.style.transition = 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)';
        setTimeout(() => { imgEl.style.transition = ''; }, 320);
      }
      _sc = 1; _tx = 0; _ty = 0;
      imgEl.style.transform = '';
      stage.style.cursor = '';
    }

    // Close-drag на dialog (весь wrap)
    function _applyCloseDrag(dy) {
      const progress = Math.min(1, Math.abs(dy) / 320);
      const sc = 1 - progress * 0.15;
      dialog.style.transition = 'none';
      dialog.style.transform  = `translateY(${dy}px) scale(${sc})`;
      dialog.style.background = `rgba(13,15,20,${1 - progress * 0.95})`;
    }

    function _resetCloseDrag(animate) {
      dialog.style.transition = animate
        ? 'transform 0.32s cubic-bezier(0.34,1.56,0.64,1), background 0.28s'
        : 'none';
      dialog.style.transform  = '';
      dialog.style.background = '';
      if (animate) setTimeout(() => { dialog.style.transition = ''; }, 350);
    }

    // Touch state
    let _t1 = null, _t2 = null;
    let _gesture = 'idle';
    let _sx = 0, _sy = 0, _st = 0;
    let _pinchDist0 = 0, _pinchSc0 = 1, _pinchCx = 0, _pinchCy = 0;
    let _panTx0 = 0, _panTy0 = 0;

    function _dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
    function _mid(a, b)  { return { x: (a.x+b.x)/2, y: (a.y+b.y)/2 }; }

    stage.addEventListener('touchstart', (e) => {
      e.preventDefault();
      // На мобиле в шторке пинч-зум отключён — обрабатываем только одно касание
      const isMobileSheet = window.innerWidth <= 640;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        _t1 = { x: t.clientX, y: t.clientY };
        _t2 = null;
        _sx = t.clientX; _sy = t.clientY; _st = e.timeStamp;
        _gesture = _sc > 1 ? 'pan' : 'deciding';
        if (_sc > 1) { _panTx0 = _tx; _panTy0 = _ty; }
      }
      if (e.touches.length === 2 && !isMobileSheet) {
        const a = e.touches[0], b = e.touches[1];
        _t1 = { x: a.clientX, y: a.clientY };
        _t2 = { x: b.clientX, y: b.clientY };
        _pinchDist0 = _dist(_t1, _t2);
        _pinchSc0   = _sc;
        const m = _mid(_t1, _t2);
        _pinchCx = m.x; _pinchCy = m.y;
        _gesture = 'pinch';
        if (_gesture === 'closing') _resetCloseDrag(false);
      }
    }, { passive: false });

    stage.addEventListener('touchmove', (e) => {
      e.preventDefault();

      // Pinch-zoom — только не в мобильной шторке
      if (e.touches.length === 2 && _gesture === 'pinch' && window.innerWidth > 640) {
        const a = e.touches[0], b = e.touches[1];
        const c1 = { x: a.clientX, y: a.clientY };
        const c2 = { x: b.clientX, y: b.clientY };
        const ratio = _dist(c1, c2) / _pinchDist0;
        const newSc = Math.min(SC_MAX, Math.max(SC_MIN, _pinchSc0 * ratio));

        // Зум в центр щипка
        const bw = imgEl.offsetWidth, bh = imgEl.offsetHeight;
        const ox = _pinchCx - stage.offsetWidth/2;
        const oy = _pinchCy - stage.offsetHeight/2;
        const lx = (ox - _tx) / _sc;
        const ly = (oy - _ty) / _sc;
        _sc = newSc;
        _tx = ox - lx * _sc;
        _ty = oy - ly * _sc;

        // Pan центра щипка
        const nm = _mid(c1, c2);
        _tx += nm.x - _pinchCx;
        _ty += nm.y - _pinchCy;
        _pinchCx = nm.x; _pinchCy = nm.y;
        _applyImgTransform();
        return;
      }

      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - _sx, dy = t.clientY - _sy;

      // Pan при зуме
      if (_gesture === 'pan') {
        _tx = _panTx0 + dx;
        _ty = _panTy0 + dy;
        _applyImgTransform();
        return;
      }

      // Определение жеста
      if (_gesture === 'deciding' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        _gesture = (Math.abs(dy) > Math.abs(dx) && dy > 0) ? 'closing'
                 : Math.abs(dx) > Math.abs(dy) ? 'nav' : 'idle';
      }

      if (_gesture === 'closing') _applyCloseDrag(Math.max(0, dy));
    }, { passive: false });

    stage.addEventListener('touchend', (e) => {
      if (_gesture === 'pinch') {
        if (_sc < 1.05) _resetImgTransform(true);
        _gesture = 'idle'; return;
      }

      const t  = e.changedTouches[0];
      const dx = t.clientX - _sx, dy = t.clientY - _sy;
      const dt = Math.max(e.timeStamp - _st, 1);
      const vy = dy / dt * 1000, vx = dx / dt * 1000;

      if (_gesture === 'closing') {
        if (dy > 100 || vy > 450) {
          dialog.style.transition = 'transform 0.26s ease-in, background 0.26s';
          dialog.style.transform  = `translateY(${window.innerHeight}px) scale(0.9)`;
          dialog.style.background = 'rgba(13,15,20,0)';
          setTimeout(() => {
            dialog.style.transition = '';
            dialog.style.transform  = '';
            dialog.style.background = '';
            _resetImgTransform(false);
            close();
          }, 260);
        } else {
          _resetCloseDrag(true);
        }
      } else if (_gesture === 'nav' && _sc <= 1) {
        if (Math.abs(dx) > 40 || Math.abs(vx) > 280) {
          _navigate(dx < 0 ? 1 : -1);
        }
      } else if (_gesture === 'deciding') {
        // Это тап (палец почти не двигался)
        // Если тап был по стрелке — листаем, иначе открываем лайтбокс
        const tappedEl = document.elementFromPoint(_sx, _sy);
        const arrowBtn = tappedEl && tappedEl.closest('.qv-arrow');
        if (arrowBtn) {
          if (arrowBtn.id === 'qv-prev') _navigate(-1);
          else if (arrowBtn.id === 'qv-next') _navigate(1);
        } else {
          _openLightbox();
        }
      }

      _gesture = 'idle'; _t1 = _t2 = null;
    });

    stage.addEventListener('touchcancel', () => {
      if (_gesture === 'closing') _resetCloseDrag(true);
      _gesture = 'idle'; _t1 = _t2 = null;
    });

    // touch-action:none — браузер не зумирует страницу
    stage.style.touchAction = 'none';
  }

  // ── Скелетон галереи ─────────────────────────────────────────
  function _showGallerySkeleton() {
    if (!_modal) return;
    const stageEl  = _modal.querySelector('#qv-img-stage');
    const thumbsEl = _modal.querySelector('#qv-thumbs');
    const prevBtn  = _modal.querySelector('#qv-prev');
    const nextBtn  = _modal.querySelector('#qv-next');
    const counterEl = _modal.querySelector('#qv-counter');
    const imgEl    = _modal.querySelector('#qv-img');

    // Сброс к исходному состоянию — скелетон уже в HTML, просто восстанавливаем
    prevBtn.style.display  = 'none';
    nextBtn.style.display  = 'none';
    counterEl.style.display = 'none';
    stageEl.dataset.skeleton = '1';

    imgEl.src = '';
    imgEl.alt = '';
    imgEl.classList.remove('qv-img--ready');

    thumbsEl.innerHTML =
      '<div class="qv-thumb-skeleton"></div>' +
      '<div class="qv-thumb-skeleton"></div>' +
      '<div class="qv-thumb-skeleton"></div>' +
      '<div class="qv-thumb-skeleton"></div>';
  }

  // ── Рендер контента ──────────────────────────────────────────
  function _renderContent(lot, shopData, shopId, lotUrl) {
    if (!_modal) return;

    const contentEl  = _modal.querySelector('#qv-content');
    const spinnerEl  = _modal.querySelector('#qv-spinner');
    const errorEl    = _modal.querySelector('#qv-error');

    // Галерея
    _galleryImages = lot.images || [];
    _galIdx        = 0;
    const thumbsEl = _modal.querySelector('#qv-thumbs');
    const prevBtn  = _modal.querySelector('#qv-prev');
    const nextBtn  = _modal.querySelector('#qv-next');
    const imgEl    = _modal.querySelector('#qv-img');
    const stageEl  = _modal.querySelector('#qv-img-stage');

    prevBtn.style.display = _galleryImages.length > 1 ? '' : 'none';
    nextBtn.style.display = _galleryImages.length > 1 ? '' : 'none';
    stageEl.style.display = _galleryImages.length > 0 ? '' : 'none';

    // Наполняем тумбы реальными кнопками (скелетные div уже заменяются)
    thumbsEl.innerHTML = '';
    _galleryImages.forEach((src, i) => {
      const t = document.createElement('button');
      t.className = 'qv-thumb' + (i === 0 ? ' qv-thumb--active' : '');
      t.setAttribute('aria-label', `Скриншот ${i + 1}`);
      t.type = 'button';
      t.innerHTML = `<img src="${assetUrl(src)}" alt="Скриншот ${i + 1}" loading="lazy">`;
      t.addEventListener('click', () => _showImage(i));
      thumbsEl.appendChild(t);
    });
    thumbsEl.style.display = _galleryImages.length > 1 ? '' : 'none';

    if (_galleryImages.length > 0) {
      // Скелетон держим до загрузки — img скрыт через CSS opacity:0
      imgEl.classList.remove('qv-img--ready');
      imgEl.src = assetUrl(_galleryImages[0]);
      function _onFirstImgReady() {
        imgEl.classList.add('qv-img--ready');
        // Скелетон убираем чуть позже чтобы не мигало
        setTimeout(() => { delete stageEl.dataset.skeleton; }, 180);
      }
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        _onFirstImgReady();
      } else {
        imgEl.onload  = _onFirstImgReady;
        imgEl.onerror = () => {
          imgEl.classList.add('qv-img--ready');
          delete stageEl.dataset.skeleton;
        };
      }
      const counterEl2 = _modal.querySelector('#qv-counter');
      counterEl2.textContent = `1 / ${_galleryImages.length}`;
      counterEl2.style.display = '';
    } else {
      // Нет изображений — убираем скелетон
      delete stageEl.dataset.skeleton;
      imgEl.classList.add('qv-img--ready');
    }

    // Заголовок
    const title = normalizeLotTitle(lot.title || '');
    _modal.querySelector('#qv-title').innerHTML = escWithBr(title);

    // Цена
    const priceEl = _modal.querySelector('#qv-price-row');
    priceEl.innerHTML = lot.price
      ? `<span class="qv-price">${esc(lot.price)}<span class="price-rub"> ₽</span></span>`
      : '';

    // tanks10
    const t10El = _modal.querySelector('#qv-tanks10');
    t10El.innerHTML = lot.tanks10 ? `<p class="qv-tanks10-text">🔟 ${esc(lot.tanks10)}</p>` : '';

    // Ресурсы
    const resEl = _modal.querySelector('#qv-resources');
    resEl.innerHTML = (typeof renderResourceIcons === 'function' && lot.resources)
      ? renderResourceIcons(lot.resources, 'short')
      : '';

    // Статс-бейджи (vstats)
    const badgesEl = _modal.querySelector('#qv-badges');
    const t10count  = lot.t10count !== undefined && String(lot.t10count).trim() !== '' ? String(lot.t10count).trim() : null;
    const premcount = lot.premcount !== undefined && String(lot.premcount).trim() !== '' ? String(lot.premcount).trim() : null;
    if (t10count || premcount) {
      let badges = '';
      if (premcount) badges += `<span class="vstats__badge vstats__badge--prem"><span class="vstats__line">${esc(premcount)} PREM'ов</span></span>`;
      if (t10count)  badges += `<span class="vstats__badge vstats__badge--top"><span class="vstats__line">${esc(t10count)} топа</span></span>`;
      badgesEl.innerHTML = `<div class="lot-card-vstats">${badges}</div>`;
    } else {
      badgesEl.innerHTML = '';
    }

    // Кнопки действий
    const actionsEl = _modal.querySelector('#qv-actions');
    actionsEl.innerHTML = '';

    if (lot.funpay) {
      const buyLink = document.createElement('a');
      buyLink.href      = lot.funpay;
      buyLink.target    = '_blank';
      buyLink.rel       = 'noopener';
      buyLink.className = 'qv-btn-buy';
      buyLink.innerHTML = `Купить на ${funpayLogo(14)}`;
      actionsEl.appendChild(buyLink);
    }

    // Ссылка на полную страницу
    const fullLink = _modal.querySelector('#qv-full-link');
    fullLink.href = lotUrl;

    // Показываем контент
    spinnerEl.style.display = 'none';
    errorEl.classList.add('qv-hidden');
  }

  // ── Открытие ─────────────────────────────────────────────────
  async function open(shopId, lotId) {
    if (_isOpen && _currentLotId === lotId) return; // уже открыт этот лот

    // ── Блокировка скролла (position:fixed — industry standard) ──
    // Сохраняем позицию и фиксируем body
    _scrollY = window.scrollY;
    document.documentElement.style.setProperty('--qv-scroll-top', `-${_scrollY}px`);

    // Сбрасываем контент
    const spinnerEl = _modal.querySelector('#qv-spinner');
    const contentEl = _modal.querySelector('#qv-content');
    const errorEl   = _modal.querySelector('#qv-error');
    spinnerEl.style.display = 'none';
    errorEl.classList.add('qv-hidden');
    _showGallerySkeleton();
    _galleryImages   = [];
    _currentLotId    = lotId;

    // Очищаем текстовые поля, чтобы не проскакивало содержимое предыдущего лота
    _modal.querySelector('#qv-title').innerHTML      = '';
    _modal.querySelector('#qv-price-row').innerHTML  = '';
    _modal.querySelector('#qv-tanks10').innerHTML    = '';
    _modal.querySelector('#qv-resources').innerHTML  = '';
    _modal.querySelector('#qv-badges').innerHTML     = '';
    _modal.querySelector('#qv-actions').innerHTML    = '';
    _modal.querySelector('#qv-full-link').href       = '#';

    // Показываем модалку
    _isOpen = true;
    document.body.classList.add('qv-open');
    // Safari 26: сначала display:flex чтобы элемент попал в render tree.
    // Класс --visible добавляем в следующем кадре через requestAnimationFrame —
    // иначе браузер схлопывает оба изменения в один paint и анимация не запускается.
    _modal.style.display = 'flex';
    requestAnimationFrame(() => {
      _modal.classList.add('qv-modal--visible');
    });

    // History API: обновляем URL
    const catalogueId = 'catalogue';
    const lotUrl = ROOT + 'lot/?id=' + encodeURIComponent(lotId);
    if (history.pushState) {
      _prevUrl = window.location.href;
      history.pushState({ quickview: true, shopId: catalogueId, lotId }, '', lotUrl);
    }

    // Ленивая загрузка данных
    try {
      const rawBase = getGhRawBase();
      const data = rawBase
        ? await fetchJSON(rawBase + 'data/' + catalogueId + '.json')
        : await fetchJSON(ROOT + 'data/' + catalogueId + '.json');

      if (!_isOpen || _currentLotId !== lotId) return; // закрыли пока грузили

      const lot = (data.lots || []).find(l => l.id === lotId);
      if (!lot) throw new Error('Лот не найден');

      _renderContent(lot, data, catalogueId, lotUrl);
    } catch (e) {
      if (!_isOpen || _currentLotId !== lotId) return;
      spinnerEl.style.display = 'none';
        errorEl.classList.remove('qv-hidden');
      _modal.querySelector('#qv-error-msg').textContent = e.message || 'Ошибка загрузки';
    }
  }

  // ── Закрытие ─────────────────────────────────────────────────
  function close() {
    if (!_isOpen) return;
    _isOpen        = false;
    _currentLotId  = null;
    _galleryImages = [];

    // Восстанавливаем URL
    if (history.pushState && _prevUrl) {
      history.pushState(null, '', _prevUrl);
      _prevUrl = null;
    }

    // На мобиле: плавное скольжение вниз без отскока
    const isMobile = window.innerWidth <= 640;
    if (isMobile && _modal) {
      const dialog = _modal.querySelector('.qv-dialog');
      if (dialog) {
        dialog.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 1, 1)';
        dialog.style.transform  = 'translateY(100%)';
      }
    }

    // Сначала убираем видимость (backdrop и pointer-events)
    if (_modal) _modal.classList.remove('qv-modal--visible');

    // На мобиле: 280ms скольжение, на десктопе 200ms
    const closeDelay = isMobile ? 300 : 200;
    setTimeout(() => {
      document.body.classList.remove('qv-open');
      document.documentElement.style.removeProperty('--qv-scroll-top');
      window.scrollTo({ top: _scrollY, behavior: 'instant' });
      // Safari 26 Liquid Glass: прячем modal через display:none ПОСЛЕ анимации.
      // Только display:none гарантированно исключает position:fixed элемент
      // из алгоритма тинтинга нижней панели. opacity/pointer-events не помогают.
      if (_modal) _modal.style.display = 'none';
      // Сбрасываем inline-стили чтобы следующее открытие анимировалось правильно
      if (isMobile && _modal) {
        const dialog = _modal.querySelector('.qv-dialog');
        if (dialog) { dialog.style.transition = ''; dialog.style.transform = ''; }
      }
    }, closeDelay);
  }

  // ── Обработка кнопки «назад» браузера ───────────────────────
  window.addEventListener('popstate', (e) => {
    if (_isOpen && !(e.state && e.state.quickview)) {
      _isOpen        = false;
      _currentLotId  = null;
      _galleryImages = [];
      _prevUrl       = null;
      const isMobilePs = window.innerWidth <= 640;
      if (isMobilePs && _modal) {
        const dialog = _modal.querySelector('.qv-dialog');
        if (dialog) {
          dialog.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 1, 1)';
          dialog.style.transform  = 'translateY(100%)';
        }
      }
      if (_modal) _modal.classList.remove('qv-modal--visible');
      const closeDelay = isMobilePs ? 300 : 200;
      setTimeout(() => {
        document.body.classList.remove('qv-open');
        document.documentElement.style.removeProperty('--qv-scroll-top');
        window.scrollTo({ top: _scrollY, behavior: 'instant' });
        // Safari 26: прячем после анимации — только display:none исключает из тинтинга
        if (_modal) _modal.style.display = 'none';
        if (isMobilePs && _modal) {
          const dialog = _modal.querySelector('.qv-dialog');
          if (dialog) { dialog.style.transition = ''; dialog.style.transform = ''; }
        }
      }, closeDelay);
    }
  });

  // ── Инициализация — создаём DOM заранее ─────────────────────
  // Модалка создаётся сразу при загрузке страницы, а не при первом тапе.
  // Это убирает задержку на iOS: браузер уже имеет DOM и CSS в памяти.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _modal = _buildModal(); });
  } else {
    _modal = _buildModal();
  }

  // ── Публичный API ────────────────────────────────────────────
  return { open, close };

})();
