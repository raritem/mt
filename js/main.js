/* ================================================================
   WoT Shop — Основной JS (main.js)
   Общие утилиты, загрузка данных, рендер страниц
   ================================================================ */

'use strict';

// ── Конфиг ──────────────────────────────────────────────────────
// BASE_URL определяется автоматически по location.
// Для работы на GitHub Pages: /repo-name/
// Для локальной разработки: /
const BASE_URL = (() => {
  const p = window.location.pathname;
  // Если сайт в подпапке (GitHub Pages с именем репо), берём первую часть
  const match = p.match(/^(\/[^/]+)\//);
  // Если это /admin/ или /shop/ или /lot/ — нам нужен корень
  const parts = p.split('/').filter(Boolean);
  if (parts.length >= 1 && ['admin','shop','lot'].includes(parts[parts.length - 1])) {
    return window.location.origin + '/' + parts.slice(0, -1).join('/');
  }
  return window.location.origin;
})();

// Определяем корень проекта по последнему сегменту пути.
// Примеры на GitHub Pages (репо = mt):
//   /mt/             → последний сегмент = 'mt'  → ROOT = './'
//   /mt/shop/        → последний сегмент = 'shop' → ROOT = '../'
//   /mt/lot/         → последний сегмент = 'lot'  → ROOT = '../'
//   /mt/admin/       → последний сегмент = 'admin' → ROOT = '../'
// Localhost:
//   /                → ROOT = './'
//   /shop/           → ROOT = '../'
function getRoot() {
  // Берём все непустые части пути, последняя — текущая директория
  const parts = window.location.pathname.split('/').filter(Boolean);
  const last  = parts[parts.length - 1] || '';
  // Если последний сегмент — одна из подстраниц, мы внутри неё
  if (['admin', 'shop', 'lot'].includes(last)) return '../';
  // Иначе мы в корне (или в корне репозитория на GitHub Pages)
  return './';
}

const ROOT = getRoot();

// ── Утилиты ─────────────────────────────────────────────────────

/** Получить URL-параметр */
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Загрузить JSON (с кеш-бастером) */
async function fetchJSON(url) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(url + sep + '_t=' + Date.now());
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return res.json();
}

/** Безопасный innerHTML через textContent */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

/** Показать статус в элементе */
function showStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg visible ' + (type || '');
  if (type === 'ok') {
    setTimeout(() => {
      el.className = 'status-msg';
    }, 3000);
  }
}

/** Простая анимация добавления элементов */
function animateIn(parent) {
  Array.from(parent.children).forEach((el, i) => {
    el.classList.add('fade-up');
    el.style.animationDelay = (i * 0.05) + 's';
  });
}

// ── Генерация звёзд ─────────────────────────────────────────────
function initStars() {
  const container = document.getElementById('stars');
  if (!container) return;
  const count = 60;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    const size = Math.random() * 2 + 1;
    s.style.cssText = [
      'position:absolute',
      'border-radius:50%',
      'background:rgba(255,255,255,' + (Math.random() * 0.4 + 0.1) + ')',
      'width:' + size + 'px',
      'height:' + size + 'px',
      'left:' + Math.random() * 100 + '%',
      'top:' + Math.random() * 100 + '%',
      'animation:twinkle ' + (Math.random() * 3 + 2) + 's ease-in-out infinite',
      'animation-delay:' + Math.random() * 3 + 's',
    ].join(';');
    frag.appendChild(s);
  }
  container.appendChild(frag);

  // Добавим @keyframes для мерцания
  if (!document.getElementById('star-keyframes')) {
    const style = document.createElement('style');
    style.id = 'star-keyframes';
    style.textContent = '@keyframes twinkle { 0%,100%{opacity:0.3} 50%{opacity:1} }';
    document.head.appendChild(style);
  }
}

// ── INDEX: Загрузить и отрисовать список витрин ──────────────────
async function loadShops() {
  initStars();
  const grid = document.getElementById('shops-grid');
  if (!grid) return;

  try {
    const data = await fetchJSON(ROOT + 'data/shops.json');
    grid.innerHTML = '';

    if (!data.shops || data.shops.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🏪</div><h2>Витрины не найдены</h2><p>Зайдите в <a href="' + ROOT + 'admin/" style="color:var(--accent)">админку</a> чтобы добавить витрины</p></div>';
      return;
    }

    data.shops.forEach((shop, idx) => {
      const card = document.createElement('a');
      card.href = ROOT + 'shop/?id=' + encodeURIComponent(shop.id);
      card.className = 'shop-card fade-up';
      card.style.animationDelay = (idx * 0.07) + 's';
      card.innerHTML = `
        <div class="shop-card-icon">🛒</div>
        <div class="shop-card-name">${esc(shop.name)}</div>
        <div class="shop-card-desc">${esc(shop.description || 'Нажмите, чтобы посмотреть лоты')}</div>
        <div class="shop-card-meta">Открыть витрину →</div>
      `;
      grid.appendChild(card);
    });

  } catch (e) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><h2>Не удалось загрузить витрины</h2><p>' + esc(e.message) + '</p></div>';
  }
}

// ── SHOP: Загрузить витрину с лотами ────────────────────────────
async function loadShop() {
  initStars();
  const shopId = getParam('id');
  if (!shopId) {
    window.location.href = ROOT + 'index.html';
    return;
  }

  const headerEl = document.getElementById('shop-header');
  const gridEl   = document.getElementById('lots-grid');
  const bcEl     = document.getElementById('breadcrumb');

  try {
    const data = await fetchJSON(ROOT + 'data/' + shopId + '.json');

    // Хлебные крошки
    if (bcEl) {
      bcEl.innerHTML = `
        <a href="${ROOT}index.html">Главная</a>
        <span class="sep">/</span>
        <span class="current">${esc(data.name || shopId)}</span>
      `;
    }

    // Заголовок витрины
    if (headerEl) {
      headerEl.innerHTML = `
        <div>
          <h1 class="shop-title"><span>${esc(data.name || shopId)}</span></h1>
          ${data.description ? `<p style="color:var(--text-muted);font-size:14px;margin-top:6px">${esc(data.description)}</p>` : ''}
        </div>
      `;
    }

    // Устанавливаем title
    document.title = (data.name || shopId) + ' — WoT Shop';

    if (!gridEl) return;

    if (!data.lots || data.lots.length === 0) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📦</div><h2>Лоты не найдены</h2><p>В этой витрине пока нет лотов</p></div>';
      return;
    }

    gridEl.innerHTML = '';

    data.lots.forEach((lot, idx) => {
      const card = document.createElement('a');
      card.href  = ROOT + 'lot/?shop=' + encodeURIComponent(shopId) + '&id=' + encodeURIComponent(lot.id);
      card.className = 'lot-card fade-up';
      card.style.animationDelay = (idx * 0.06) + 's';

      const firstImg = lot.images && lot.images[0];
      // thumb.webp — маленькая миниатюра (~480px), грузится быстро на странице витрины
      // Генерируется автоматически при загрузке первого фото в менеджере изображений
      const previewSrc = lot.thumb || firstImg;
      const thumbHtml = previewSrc
        ? `<img class="lot-card-thumb" src="${ROOT}${previewSrc}" alt="${esc(lot.title)}" loading="lazy">`
        : `<div class="lot-card-thumb-placeholder">🎯</div>`;

      const count = (lot.images || []).length;

      card.innerHTML = `
        ${thumbHtml}
        <div class="lot-card-body">
          <div class="lot-card-title">${esc(lot.title)}</div>
          <div class="lot-card-images-count">📸 ${count} ${plural(count, 'скриншот', 'скриншота', 'скриншотов')}</div>
          ${lot.funpay ? `<div class="lot-card-funpay">Купить на FunPay ↗</div>` : ''}
        </div>
      `;

      gridEl.appendChild(card);
    });

  } catch (e) {
    if (gridEl) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><h2>Не удалось загрузить витрину</h2><p>' + esc(e.message) + '</p></div>';
    }
  }
}

// ── LOT: Загрузить страницу лота ─────────────────────────────────
async function loadLot() {
  initStars();
  const shopId = getParam('shop');
  const lotId  = getParam('id');

  if (!shopId || !lotId) {
    window.location.href = ROOT + 'index.html';
    return;
  }

  const headerEl = document.getElementById('lot-header');
  const gridEl   = document.getElementById('gallery-grid');
  const bcEl     = document.getElementById('breadcrumb');

  try {
    const data = await fetchJSON(ROOT + 'data/' + shopId + '.json');
    const lot  = (data.lots || []).find(l => l.id === lotId);

    if (!lot) throw new Error('Лот не найден');

    document.title = lot.title + ' — WoT Shop';

    // Хлебные крошки
    if (bcEl) {
      bcEl.innerHTML = `
        <a href="${ROOT}index.html">Главная</a>
        <span class="sep">/</span>
        <a href="${ROOT}shop/?id=${encodeURIComponent(shopId)}">${esc(data.name || shopId)}</a>
        <span class="sep">/</span>
        <span class="current">${esc(lot.title)}</span>
      `;
    }

    // Заголовок лота
    if (headerEl) {
      const funpayBtn = lot.funpay
        ? `<a href="${lot.funpay}" target="_blank" rel="noopener" class="funpay-btn">🛒 Купить на FunPay</a>`
        : '';
      headerEl.innerHTML = `
        <div>
          <h1 class="lot-title">${esc(lot.title)}</h1>
          <p style="color:var(--text-muted);font-size:13px;margin-top:6px">📸 ${(lot.images||[]).length} скриншотов</p>
        </div>
        ${funpayBtn}
      `;
    }

    if (!gridEl) return;

    const images = lot.images || [];

    if (images.length === 0) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🖼️</div><h2>Скриншоты не добавлены</h2></div>';
      return;
    }

    gridEl.innerHTML = '';

    images.forEach((src, idx) => {
      const thumb = document.createElement('div');
      thumb.className = 'gallery-thumb fade-up';
      thumb.style.animationDelay = (idx * 0.04) + 's';
      thumb.dataset.index = idx;
      thumb.innerHTML = `
        <img src="${ROOT}${src}" alt="Скриншот ${idx+1}" loading="lazy" class="loading">
        <div class="gallery-thumb-overlay">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" style="display:none"/>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </div>
        <div class="gallery-thumb-num">${idx + 1}</div>
      `;

      // Lazy load обработчик
      const img = thumb.querySelector('img');
      img.onload  = () => img.classList.replace('loading', 'loaded');
      img.onerror = () => img.classList.replace('loading', 'loaded');

      thumb.addEventListener('click', () => {
        if (window.LightBox) window.LightBox.open(images, idx);
      });

      gridEl.appendChild(thumb);
    });

    // Инициализируем лайтбокс с изображениями
    if (window.LightBox) {
      window.LightBox.setImages(images);
    }

  } catch (e) {
    if (gridEl) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><h2>' + esc(e.message) + '</h2></div>';
    }
  }
}

// ── Утилита: склонение ───────────────────────────────────────────
function plural(n, one, few, many) {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
