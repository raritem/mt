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

        <!-- Контент (скрыт до загрузки) -->
        <div class="qv-content" id="qv-content" style="display:none">
          <!-- Левая панель: галерея -->
          <div class="qv-gallery" id="qv-gallery">
            <div class="qv-img-stage" id="qv-img-stage">
              <img id="qv-img" class="qv-main-img" src="" alt="Скриншот аккаунта">
              <!-- Оверлей увеличения по клику -->
              <div class="qv-zoom-overlay" id="qv-zoom-overlay" title="Открыть во весь экран">
                <svg class="qv-zoom-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="11" y1="8" x2="11" y2="14"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </div>
              <button class="qv-arrow qv-prev" id="qv-prev" aria-label="Предыдущий">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <button class="qv-arrow qv-next" id="qv-next" aria-label="Следующий">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              <div class="qv-counter" id="qv-counter">1 / 1</div>
            </div>
            <!-- Полоса миниатюр -->
            <div class="qv-thumbs" id="qv-thumbs"></div>
          </div>

          <!-- Правая панель: информация -->
          <div class="qv-info" id="qv-info">
            <h2 class="qv-title" id="qv-title"></h2>
            <div class="qv-price-row" id="qv-price-row"></div>
            <div class="qv-tanks10" id="qv-tanks10"></div>
            <div class="qv-resources" id="qv-resources"></div>
            <div class="qv-badges" id="qv-badges"></div>
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
        <div class="qv-error" id="qv-error" style="display:none">
          <div class="empty-icon">⚠️</div>
          <p id="qv-error-msg">Ошибка загрузки</p>
        </div>
      </div>
    `;

    document.body.appendChild(el);

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

    // Клавиатура
    document.addEventListener('keydown', _onKeyDown);

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
    img.onload  = () => img.classList.remove('qv-img--loading');
    img.onerror = () => img.classList.remove('qv-img--loading');

    counter.textContent = `${idx + 1} / ${_galleryImages.length}`;
    thumbs.forEach((t, i) => t.classList.toggle('qv-thumb--active', i === idx));
    _galIdx = idx;
  }

  // ── Клавиатурные события ─────────────────────────────────────
  function _onKeyDown(e) {
    if (!_isOpen) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowLeft')  { _navigate(-1); return; }
    if (e.key === 'ArrowRight') { _navigate(1);  return; }
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
      imgEl.classList.add('qv-img--loading');
      imgEl.src = assetUrl(_galleryImages[0]);
      imgEl.onload  = () => imgEl.classList.remove('qv-img--loading');
      imgEl.onerror = () => imgEl.classList.remove('qv-img--loading');
      _modal.querySelector('#qv-counter').textContent = `1 / ${_galleryImages.length}`;
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
    errorEl.style.display   = 'none';
    contentEl.style.display = '';
  }

  // ── Открытие ─────────────────────────────────────────────────
  async function open(shopId, lotId) {
    if (_isOpen && _currentLotId === lotId) return; // уже открыт этот лот

    if (!_modal) _modal = _buildModal();

    // ── Блокировка скролла (position:fixed — industry standard) ──
    // Сохраняем позицию и фиксируем body
    _scrollY = window.scrollY;
    document.documentElement.style.setProperty('--qv-scroll-top', `-${_scrollY}px`);

    // Сбрасываем контент
    const spinnerEl = _modal.querySelector('#qv-spinner');
    const contentEl = _modal.querySelector('#qv-content');
    const errorEl   = _modal.querySelector('#qv-error');
    spinnerEl.style.display = '';
    contentEl.style.display = 'none';
    errorEl.style.display   = 'none';
    _galleryImages   = [];
    _currentLotId    = lotId;

    // Показываем модалку
    _isOpen = true;
    document.body.classList.add('qv-open');
    _modal.classList.add('qv-modal--visible');

    // History API: обновляем URL
    const lotUrl = ROOT + 'lot/?shop=' + encodeURIComponent(shopId) + '&id=' + encodeURIComponent(lotId);
    if (history.pushState) {
      _prevUrl = window.location.href;
      history.pushState({ quickview: true, shopId, lotId }, '', lotUrl);
    }

    // Ленивая загрузка данных
    try {
      const rawBase = getGhRawBase();
      const data = rawBase
        ? await fetchJSON(rawBase + 'data/' + shopId + '.json')
        : await fetchJSON(ROOT + 'data/' + shopId + '.json');

      if (!_isOpen || _currentLotId !== lotId) return; // закрыли пока грузили

      const lot = (data.lots || []).find(l => l.id === lotId);
      if (!lot) throw new Error('Лот не найден');

      _renderContent(lot, data, shopId, lotUrl);
    } catch (e) {
      if (!_isOpen || _currentLotId !== lotId) return;
      spinnerEl.style.display   = 'none';
      errorEl.style.display     = '';
      _modal.querySelector('#qv-error-msg').textContent = e.message || 'Ошибка загрузки';
    }
  }

  // ── Закрытие ─────────────────────────────────────────────────
  function close() {
    if (!_isOpen) return;
    _isOpen        = false;
    _currentLotId  = null;
    _galleryImages = [];

    document.body.classList.remove('qv-open');
    document.documentElement.style.removeProperty('--qv-scroll-top');
    if (_modal) _modal.classList.remove('qv-modal--visible');

    // Восстанавливаем URL
    if (history.pushState && _prevUrl) {
      history.pushState(null, '', _prevUrl);
      _prevUrl = null;
    }

    // position:fixed сбросил scrollTop в 0 — восстанавливаем
    window.scrollTo({ top: _scrollY, behavior: 'instant' });
  }

  // ── Обработка кнопки "назад" браузера ───────────────────────
  window.addEventListener('popstate', (e) => {
    if (_isOpen && !(e.state && e.state.quickview)) {
      _isOpen        = false;
      _currentLotId  = null;
      _galleryImages = [];
      _prevUrl       = null;
      document.body.classList.remove('qv-open');
      document.documentElement.style.removeProperty('--qv-scroll-top');
      if (_modal) _modal.classList.remove('qv-modal--visible');
      window.scrollTo({ top: _scrollY, behavior: 'instant' });
    }
  });

  // ── Публичный API ────────────────────────────────────────────
  return { open, close };

})();
