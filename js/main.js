/* ================================================================
   WoT Shop — Основной JS (main.js)
   Общие утилиты, загрузка данных, рендер страниц
   ================================================================ */

'use strict';

// ── Feature flags ────────────────────────────────────────────────
// Временно выключено: на некоторых Windows/браузерах снижает резкость текста.
const STARS_BG_ENABLED = false;

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
  if (['admin', 'shop', 'lot', 'favourites'].includes(last)) return '../';
  // Иначе мы в корне (или в корне репозитория на GitHub Pages)
  return './';
}

const ROOT = getRoot();

// ── GitHub RAW (для локального предпросмотра) ────────────────────
function getGhRawBase() {
  try {
    const repo = (localStorage.getItem('wotshop-gh-repo') || '').trim().replace(/\/+$/, '');
    const branch = (localStorage.getItem('wotshop-gh-branch') || 'main').trim() || 'main';
    if (!repo) return null;
    return 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/';
  } catch (_) {
    return null;
  }
}

function assetUrl(path) {
  const base = getGhRawBase();
  return base ? (base + String(path || '').replace(/^\/+/, '')) : (ROOT + path);
}

// ── Fade-up cleanup (резкость текста на Windows) ─────────────────
let fadeCleanupBound = false;
function bindFadeCleanup() {
  if (fadeCleanupBound) return;
  fadeCleanupBound = true;

  // Снимаем класс сразу после завершения анимации,
  // чтобы браузер не держал элементы в композитинге.
  // Тест: не делаем НИКАКОГО cleanup — пусть fill-mode:both держит состояние сам.
  // Если скачок исчезнет — виноват был cleanup-код.
  // Если скачок останется — виновата сама анимация или внешний layout.
  document.addEventListener('animationend', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (e.animationName !== 'fadeUp') return;
    if (!el.classList.contains('fade-up')) return;
    // Только фиксируем инлайном и снимаем класс — без rAF, без transition манипуляций
    el.style.opacity = '1';
    el.style.transform = 'none';
    el.style.transition = 'none';
    el.classList.remove('fade-up');
    el.style.animationDelay = '';
    el.style.willChange = '';
    el.style.animation = '';
  }, true);
}

// ── Brand title (название витрины в header) ──────────────────────
function setBrandTitle(text) {
  const el = document.getElementById('brand-title');
  if (el) el.textContent = text || '';
}

function setBrandHref(href) {
  const a = document.querySelector('a.logo');
  if (a && href) a.setAttribute('href', href);
}

/** Один раз добавляет иконку избранного в .header-inner (если ещё нет) */
function ensureHeaderFavBtn() {
  const btn = document.getElementById('header-fav-btn');
  if (!btn) return;
  // Wire up click only once
  if (btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    const shopId = getParam('shop') || getParam('id');
    const favUrl = ROOT + 'favourites/' + (shopId ? '?shop=' + encodeURIComponent(shopId) : '');
    window.location.href = favUrl;
  });
  updateHeaderFavIcon();
}

// ── Fade helpers ────────────────────────────────────────────────
function applyFadeUpStagger(parent, selector, stepSec) {
  if (!parent) return;
  const items = Array.from(parent.querySelectorAll(selector));
  items.forEach((el, i) => {
    if (!(el instanceof HTMLElement)) return;
    el.style.animationDelay = ((i * (stepSec || 0.05))).toFixed(3) + 's';
    // Гладкий старт без forced reflow: сначала "prep", затем на следующем кадре "fade-up"
    el.classList.remove('fade-up');
    el.classList.add('fade-prep');
  });

  requestAnimationFrame(() => {
    items.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (!el.classList.contains('fade-prep')) return;
      el.classList.remove('fade-prep');
      el.classList.add('fade-up');
    });
  });
}

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

function escWithBr(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML.replace(/\n/g, '<br>');
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

/** Нормализация текста лота:
 *  Заменяет математические/bold Unicode символы "ур" и "PREM" на обычные ASCII.
 *  Например: 𝟏𝟎𝐲𝐩(x3) → 10ур(x3),  𝙋𝙍𝙀𝙈 → PREM
 */
function normalizeLotTitle(str) {
  if (!str) return str;

  // Таблица Unicode→ASCII для bold/italic/sans-serif вариантов
  const map = {};
  const ranges = [
    // Mathematical Bold
    [0x1D400, 'A'], [0x1D41A, 'a'],
    // Mathematical Italic
    [0x1D434, 'A'], [0x1D44E, 'a'],
    // Mathematical Bold Italic
    [0x1D468, 'A'], [0x1D482, 'a'],
    // Mathematical Sans-Serif Bold
    [0x1D5D4, 'A'], [0x1D5EE, 'a'],
    // Mathematical Sans-Serif Bold Italic
    [0x1D63C, 'A'], [0x1D656, 'a'],
    // Mathematical Monospace
    [0x1D670, 'A'], [0x1D68A, 'a'],
    // Digits: Bold
    [0x1D7CE, '0'],
    // Digits: Double-struck
    [0x1D7D8, '0'],
    // Digits: Sans-serif
    [0x1D7E2, '0'],
    // Digits: Sans-serif Bold
    [0x1D7EC, '0'],
    // Digits: Monospace
    [0x1D7F6, '0'],
  ];

  ranges.forEach(([start, baseChar]) => {
    const base = baseChar.codePointAt(0);
    const count = baseChar >= 'a' && baseChar <= 'z' ? 26 :
                  baseChar >= 'A' && baseChar <= 'Z' ? 26 : 10;
    for (let i = 0; i < count; i++) {
      map[String.fromCodePoint(start + i)] = String.fromCodePoint(base + i);
    }
  });

  // Применяем замену посимвольно
  let result = '';
  for (const ch of str) {
    result += (map[ch] !== undefined ? map[ch] : ch);
  }

  // Теперь заменяем "yp" / "ур" (и варианты через ASCII y+p) → "ур"
  // и "PREM" (уже ASCII после нормализации) остаётся PREM
  result = result
    .replace(/yp/g,  'ур')   // ASCII y+p (частый вариант)
    .replace(/YP/g,  'УР');

  return result;
}

// ── Избранное (Favourites) ───────────────────────────────────────
const FAV_KEY = 'wot_shop_favourites';

function favGetAll() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
  } catch { return []; }
}

function favSaveAll(ids) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(ids)); } catch {}
}

/** Переключает лот в избранном. Возвращает true если добавлен, false если удалён. */
function favToggle(lotId) {
  const ids = favGetAll();
  const idx = ids.indexOf(String(lotId));
  if (idx === -1) {
    ids.push(String(lotId));
    favSaveAll(ids);
    return true;
  } else {
    ids.splice(idx, 1);
    favSaveAll(ids);
    return false;
  }
}

/** Обновляет иконку избранного в шапке */
function updateHeaderFavIcon() {
  const btn = document.getElementById('header-fav-btn');
  if (!btn) return;
  const count = favGetAll().length;
  btn.classList.toggle('visible', count > 0);
}

/** Логотип FunPay как inline img с классом */
function funpayLogo() {
  return `<img src="https://funpay.com/img/layout/logo-funpay.svg" alt="FunPay" class="funpay-logo">`;
}

/** Кнопка "Купить на FunPay" с логотипом */
function funpayBtn(href, cls) {
  return `<a href="${href}" target="_blank" rel="noopener" class="${cls || 'funpay-btn'}">Купить на ${funpayLogo(16)}</a>`;
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
  if (!STARS_BG_ENABLED) return;

  // На Windows/Chrome overlay-слои (fixed div поверх контента) ухудшают резкость текста
  // из-за композитинга. Поэтому делаем звёзды ЧАСТЬЮ ФОНА страницы (html/body), без overlay DOM.
  const target = document.documentElement;
  const body   = document.body;
  if (!target || !body) return;
  if (target.dataset.starsReady === '1') return;
  target.dataset.starsReady = '1';

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const size = 512; // tile size (px)
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(size * dpr);
  canvas.height = Math.floor(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  // Генерируем звёзды (точки разных размеров/яркости)
  const count = 110;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() < 0.15 ? (Math.random() * 1.6 + 1.0) : (Math.random() * 0.9 + 0.35);
    const a = Math.random() * 0.35 + 0.10;
    ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const dataUrl = canvas.toDataURL('image/png');
  const bg =
    'radial-gradient(ellipse at 20% 50%, rgba(245,197,24,0.03) 0%, transparent 60%),' +
    'radial-gradient(ellipse at 80% 20%, rgba(245,197,24,0.02) 0%, transparent 50%),' +
    'url("' + dataUrl + '")';
  // Ставим на html, чтобы фон был "под" всей страницей
  target.style.backgroundImage = bg;
  target.style.backgroundRepeat = 'no-repeat, no-repeat, repeat';
  target.style.backgroundSize = 'auto, auto, ' + size + 'px ' + size + 'px';
  target.style.backgroundPosition = 'center, center, 0 0';
  // На всякий случай дублируем на body, чтобы не зависеть от особенностей браузера
  body.style.backgroundImage = bg;
  body.style.backgroundRepeat = 'no-repeat, no-repeat, repeat';
  body.style.backgroundSize = 'auto, auto, ' + size + 'px ' + size + 'px';
  body.style.backgroundPosition = 'center, center, 0 0';
}

// ── INDEX: Загрузить и отрисовать список витрин ──────────────────
async function loadShops() {
  bindFadeCleanup();
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
  bindFadeCleanup();
  initStars();
  const shopId = getParam('id');
  if (!shopId) {
    window.location.href = ROOT + 'index.html';
    return;
  }

  const gridEl   = document.getElementById('lots-grid');
  const bcEl     = document.getElementById('breadcrumb');
  const tableSectionEl = document.getElementById('lots-table-section');
  const tableEl        = document.getElementById('lots-table');
  const qEl            = document.getElementById('lots-filter-q');

  try {
    const rawBase = getGhRawBase();
    const data = rawBase
      ? await fetchJSON(rawBase + 'data/' + shopId + '.json')
      : await fetchJSON(ROOT + 'data/' + shopId + '.json');

    // На странице витрины крошки не нужны
    if (bcEl) bcEl.innerHTML = '';

    // Заголовок витрины
    setBrandTitle(data.name || shopId);
    setBrandHref('./?id=' + encodeURIComponent(shopId));
    ensureHeaderFavBtn();

    // Устанавливаем title
    document.title = (data.name || shopId);

    if (!gridEl) return;

    if (!data.lots || data.lots.length === 0) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📦</div><h2>Лоты не найдены</h2><p>В этой витрине пока нет лотов</p></div>';
      if (tableSectionEl) tableSectionEl.style.display = 'none';
      return;
    }

    // Разделяем лоты:
    // - onFunpay !== false  → показываем в верхней сетке (совместимость со старыми JSON)
    // - onFunpay === false  → показываем в нижней "таблице"
    const allLots = Array.isArray(data.lots) ? data.lots : [];
    const funpayLots  = allLots.filter(l => l && l.onFunpay !== false);
    const hiddenLots  = allLots.filter(l => l && l.onFunpay === false);

    gridEl.innerHTML = '';

    funpayLots.forEach((lot) => {
      const card = document.createElement('div');
      card.className = 'lot-card';

      const firstImg = lot.images && lot.images[0];
      const previewSrc = lot.thumb || firstImg;
      const thumbImg = previewSrc
        ? `<img class="lot-card-thumb" src="${assetUrl(previewSrc)}" alt="${esc(lot.title)}" loading="lazy">`
        : `<div class="lot-card-thumb-placeholder">🎯</div>`;

      const lotUrl = ROOT + 'lot/?shop=' + encodeURIComponent(shopId) + '&id=' + encodeURIComponent(lot.id);
      const title  = normalizeLotTitle(lot.title);
      const titleClass  = lot.titleWrap   ? 'lot-card-title lot-card-title--wrap'   : 'lot-card-title';
      const tanks10Class = lot.tanks10Wrap ? 'lot-card-tanks10 lot-card-tanks10--wrap' : 'lot-card-tanks10';
      const tanks10Html = lot.tanks10 ? `<div class="${tanks10Class}">${esc(lot.tanks10)}</div>` : '';

      // Vehicle stats block (under title, column layout, green gradient)
      const vehicleStatsHtml = (() => {
        const t10count = lot.t10count !== undefined && lot.t10count !== null && String(lot.t10count).trim() !== '' ? String(lot.t10count).trim() : null;
        const premcount = lot.premcount !== undefined && lot.premcount !== null && String(lot.premcount).trim() !== '' ? String(lot.premcount).trim() : null;
        if (!t10count && !premcount) return '';
        let badges = '';
        if (premcount) badges += `<span class="vstats__badge vstats__badge--prem"><span class="vstats__line">${esc(premcount)} PREM'ов</span></span>`;
        if (t10count) badges += `<span class="vstats__badge vstats__badge--top"><span class="vstats__line">${esc(t10count)} топа</span></span>`;
        return `<div class="lot-card-vstats">${badges}</div>`;
      })();

      const priceBadge = lot.price
        ? `<div class="lot-card-price-badge">${esc(lot.price)}<span class="price-rub"> ₽</span></div>`
        : '';

      // ── Hover-overlay icons (desktop only via CSS hover:hover) ──
      const isFav = favGetAll().includes(String(lot.id));
      const overlayHtml = `
        <div class="lot-card-overlay">
          <button class="card-action-btn btn-fav${isFav ? ' fav-active' : ''}" data-lot-id="${esc(String(lot.id))}" type="button" aria-label="В избранное">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.45067 13.9082L11.4033 20.4395C11.6428 20.6644 11.7625 20.7769 11.9037 20.8046C11.9673 20.8171 12.0327 20.8171 12.0963 20.8046C12.2375 20.7769 12.3572 20.6644 12.5967 20.4395L19.5493 13.9082C21.5055 12.0706 21.743 9.0466 20.0978 6.92607L19.7885 6.52734C17.8203 3.99058 13.8696 4.41601 12.4867 7.31365C12.2913 7.72296 11.7087 7.72296 11.5133 7.31365C10.1304 4.41601 6.17972 3.99058 4.21154 6.52735L3.90219 6.92607C2.25695 9.0466 2.4945 12.0706 4.45067 13.9082Z" stroke-width="2"/></svg>
          </button>
          <div class="lot-card-overlay-center">
            <button class="card-action-btn btn-quickview" type="button" aria-label="Быстрый просмотр">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21.821 12.43c-.083-.119-2.062-2.944-4.793-4.875-1.416-1.003-3.202-1.555-5.028-1.555-1.825 0-3.611.552-5.03 1.555-2.731 1.931-4.708 4.756-4.791 4.875-.238.343-.238.798 0 1.141.083.119 2.06 2.944 4.791 4.875 1.419 1.002 3.205 1.554 5.03 1.554 1.826 0 3.612-.552 5.028-1.555 2.731-1.931 4.71-4.756 4.793-4.875.239-.342.239-.798 0-1.14zm-9.821 4.07c-1.934 0-3.5-1.57-3.5-3.5 0-1.934 1.566-3.5 3.5-3.5 1.93 0 3.5 1.566 3.5 3.5 0 1.93-1.57 3.5-3.5 3.5zM14 13c0 1.102-.898 2-2 2-1.105 0-2-.898-2-2 0-1.105.895-2 2-2 1.102 0 2 .895 2 2z"/></svg>
            </button>
            ${lot.funpay ? `<a class="card-action-btn btn-buy" href="${esc(lot.funpay)}" target="_blank" rel="noopener" aria-label="Купить на FunPay">
              <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M6.283.001h5.434l1.401.03c.395.031.759.098 1.106.264a3 3 0 0 1 1.295 1.191c.194.332.291.689.354 1.08.062.375.1.836.147 1.394l.53 6.361.098 1.619c0 .45-.047.868-.221 1.264a3 3 0 0 1-1.319 1.434c-.381.206-.793.287-1.242.325-.433.037-.97.037-1.621.037H5.755c-.651 0-1.188 0-1.621-.037-.449-.038-.861-.119-1.242-.325a3 3 0 0 1-1.319-1.434c-.174-.396-.22-.814-.221-1.264 0-.436.044-.969.098-1.619L1.98 4.96l.147-1.394c.063-.391.16-.748.354-1.08A3 3 0 0 1 3.776.295C4.123.13 4.487.063 4.882.032 5.254.001 5.69.001 6.283.001zm.468 4.5a.75.75 0 1 0-1.5 0 3.75 3.75 0 0 0 3.75 3.75 3.75 3.75 0 0 0 3.75-3.75.75.75 0 1 0-1.5 0 2.25 2.25 0 0 1-2.25 2.25 2.25 2.25 0 0 1-2.25-2.25z"/></svg>
            </a>` : ''}
          </div>
        </div>`;

      const thumbHtml = `<div class="lot-card-thumb-wrap">${thumbImg}${priceBadge}${overlayHtml}</div>`;

      const resHtml = (typeof renderResourceIcons === 'function')
        ? renderResourceIcons(lot.resources, 'short')
        : '';

      card.innerHTML = `
        ${thumbHtml}
        <div class="lot-card-body">
          <div class="lot-card-title-row">
            <div class="${titleClass}">${lot.titleWrap ? escWithBr(title) : esc(title)}</div>
          </div>
          ${tanks10Html}
          ${vehicleStatsHtml}
          ${resHtml ? `<div class="lot-card-resources">${resHtml}</div>` : ''}
        </div>
      `;

      // Быстрый просмотр → открываем модалку
      card.querySelector('.btn-quickview')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.QuickView) {
          window.QuickView.open(shopId, String(lot.id));
        } else {
          window.location.href = lotUrl;
        }
      });

      // Добавить / убрать из избранного
      const favBtn = card.querySelector('.btn-fav');
      if (favBtn) {
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = String(lot.id);
          const active = favToggle(id);
          favBtn.classList.toggle('fav-active', active);
          favBtn.dataset.tip = active ? 'Убрать из избранного' : 'В избранное';
          updateHeaderFavIcon();
        });
      }

      // Клик по карточке (не по кнопкам) → переход на лот
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-btn')) return;
        window.location.href = lotUrl;
      });

      gridEl.appendChild(card);
    });
    applyFadeUpStagger(gridEl, '.lot-card', 0.06);

    // Нижняя "таблица" (черновой фильтр — только по названию)
    if (tableSectionEl && tableEl) {
      if (hiddenLots.length === 0) {
        tableSectionEl.style.display = 'none';
      } else {
        tableSectionEl.style.display = '';

        const renderHidden = () => {
          const q = (qEl ? qEl.value : '').trim().toLowerCase();
          const filtered = !q
            ? hiddenLots
            : hiddenLots.filter(l => normalizeLotTitle(l.title || '').toLowerCase().includes(q));

          tableEl.innerHTML = '';

          if (filtered.length === 0) {
            tableEl.innerHTML = '<div class="empty-state" style="padding:36px 16px"><div class="empty-icon">🔎</div><h2>Ничего не найдено</h2><p>Попробуйте другой запрос</p></div>';
            return;
          }

          // Строки всегда рендерим с fade-prep — они невидимы до тех пор пока
          // IO не запустит анимацию. Если IO уже сработал (seen=1), сразу видимые.
          const alreadySeen = tableSectionEl.dataset.seen === '1';

          filtered.forEach((lot, i) => {
            const row = document.createElement('div');
            row.className = alreadySeen ? 'lot-row-card' : 'lot-row-card fade-prep';

            const firstImg = lot.images && lot.images[0];
            const previewSrc = lot.thumb || firstImg;
            const thumbRowImg = previewSrc
              ? `<img class="lot-row-thumb" src="${assetUrl(previewSrc)}" alt="${esc(lot.title)}" loading="lazy">`
              : `<div class="lot-row-thumb-placeholder">🎯</div>`;

            const title = normalizeLotTitle(lot.title);
            const tanks10RowHtml = lot.tanks10 ? `<div class="lot-row-tanks10">${esc(lot.tanks10)}</div>` : '';

            // Vehicle stats block for row card (column layout, green gradient)
            const rowVehicleStatsHtml = (() => {
              const t10count = lot.t10count !== undefined && lot.t10count !== null && String(lot.t10count).trim() !== '' ? String(lot.t10count).trim() : null;
              const premcount = lot.premcount !== undefined && lot.premcount !== null && String(lot.premcount).trim() !== '' ? String(lot.premcount).trim() : null;
              if (!t10count && !premcount) return '';
              let badges = '';
              if (premcount) badges += `<span class="vstats__badge vstats__badge--prem"><span class="vstats__line">${esc(premcount)} PREM'ов</span></span>`;
              if (t10count) badges += `<span class="vstats__badge vstats__badge--top"><span class="vstats__line">${esc(t10count)} топа</span></span>`;
              return `<div class="lot-card-vstats lot-card-vstats--row">${badges}</div>`;
            })();

            const thumbHtml = `<div class="lot-row-thumb-wrap">${thumbRowImg}</div>`;
            // Ресурсы: мобайл → short, десктоп → full
            const isMobile = window.innerWidth < 640;
            const resIconsHtml = (typeof renderResourceIcons === 'function')
              ? renderResourceIcons(lot.resources, isMobile ? 'short' : 'full')
              : '';
            const tags = Array.isArray(lot.tags) ? lot.tags : [];
            const tagsHtml = resIconsHtml || (tags.length
              ? tags.slice(0, 10).map(t => `<span class="lot-row-tag">${esc(String(t))}</span>`).join('')
              : '');

            row.innerHTML = `
              <div class="lot-row-left">
                ${thumbHtml}
                <div class="lot-row-mid">
                  <div class="lot-row-title-row">
                    <div class="lot-row-title">${escWithBr(title)}</div>
                    ${lot.price ? `<div class="lot-card-price lot-card-price--row">${esc(lot.price)}<span class="price-rub"> ₽</span></div>` : ''}
                  </div>
                  ${tanks10RowHtml}
                  ${rowVehicleStatsHtml}
                  <div class="lot-row-tags">${tagsHtml}</div>
                </div>
              </div>
            `;

            const lotUrl = ROOT + 'lot/?shop=' + encodeURIComponent(shopId) + '&id=' + encodeURIComponent(lot.id);
            row.addEventListener('click', (e) => {
              window.location.href = lotUrl;
            });

            tableEl.appendChild(row);
          });
        };

        // Привязка фильтра
        if (qEl) qEl.oninput = () => renderHidden();

        // Первый рендер — строки в fade-prep (невидимы), IO запустит анимацию
        renderHidden();

        // IO запускает анимацию на уже готовых строках — без повторного рендера.
        // Так нет двойного рендера и нет дёрганья.
        if (!tableSectionEl.dataset.ioBound) {
          tableSectionEl.dataset.ioBound = '1';
          const io = new IntersectionObserver((entries) => {
            const e = entries[0];
            if (!e.isIntersecting) return;
            if (tableSectionEl.dataset.seen === '1') return;
            tableSectionEl.dataset.seen = '1';
            applyFadeUpStagger(tableEl, '.lot-row-card', 0.03);
            io.disconnect();
          }, { threshold: 0, rootMargin: '0px 0px -120px 0px' });
          io.observe(tableEl);
        }
      }
    }

  } catch (e) {
    if (gridEl) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><h2>Не удалось загрузить витрину</h2><p>' + esc(e.message) + '</p></div>';
    }
    if (tableSectionEl) tableSectionEl.style.display = 'none';
  }
}

// ── LOT: Загрузить страницу лота ─────────────────────────────────
async function loadLot() {
  bindFadeCleanup();
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
    const rawBase = getGhRawBase();
    const data = rawBase
      ? await fetchJSON(rawBase + 'data/' + shopId + '.json')
      : await fetchJSON(ROOT + 'data/' + shopId + '.json');
    const lot  = (data.lots || []).find(l => l.id === lotId);

    if (!lot) throw new Error('Лот не найден');

    const title = normalizeLotTitle(lot.title);
    document.title = title;
    setBrandTitle(data.name || shopId);
    setBrandHref(ROOT + 'shop/?id=' + encodeURIComponent(shopId));
    ensureHeaderFavBtn();

    // Хлебные крошки: "Витрина / Лот" (без "Главная")
    if (bcEl) {
      bcEl.innerHTML = `
        <a href="${ROOT}shop/?id=${encodeURIComponent(shopId)}" class="bc-shop">${esc(data.name || shopId)}</a>
        <span class="sep">/</span>
        <span class="current bc-lot">${esc(title)}</span>
      `;
    }

    // Заголовок лота
    if (headerEl) {
      const isFav = favGetAll().includes(String(lotId));
      const fp = lot.funpay
        ? `<a href="${lot.funpay}" target="_blank" rel="noopener" class="lot-header-funpay-btn">Купить на ${funpayLogo(14)}</a>`
        : '';
      const favBtnHtml = `
        <button class="lot-header-fav-btn${isFav ? ' fav-active' : ''}" id="lot-fav-btn" type="button" aria-label="${isFav ? 'Убрать из избранного' : 'В избранное'}">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4.45067 13.9082L11.4033 20.4395C11.6428 20.6644 11.7625 20.7769 11.9037 20.8046C11.9673 20.8171 12.0327 20.8171 12.0963 20.8046C12.2375 20.7769 12.3572 20.6644 12.5967 20.4395L19.5493 13.9082C21.5055 12.0706 21.743 9.0466 20.0978 6.92607L19.7885 6.52734C17.8203 3.99058 13.8696 4.41601 12.4867 7.31365C12.2913 7.72296 11.7087 7.72296 11.5133 7.31365C10.1304 4.41601 6.17972 3.99058 4.21154 6.52735L3.90219 6.92607C2.25695 9.0466 2.4945 12.0706 4.45067 13.9082Z" stroke-width="2"/>
          </svg>
        </button>`;
      headerEl.innerHTML = `
        <div class="lot-header-top">
          <a href="${ROOT}shop/?id=${encodeURIComponent(shopId)}" class="btn btn-ghost back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Назад
          </a>
          <div style="display:flex;align-items:center;gap:18px;">
            ${favBtnHtml}
            ${fp}
          </div>
        </div>
        <div class="lot-title-row">
          <h1 class="lot-title">${escWithBr(title)}</h1>
          ${lot.price ? `<div class="lot-price-badge">${esc(lot.price)}<span class="price-rub"> ₽</span></div>` : ''}
        </div>
        ${lot.tanks10 ? `<p class="lot-tanks10-detail">🔟 ${esc(lot.tanks10)}</p>` : ''}
        <p style="color:var(--text-muted);font-size:13px;margin-top:4px">📸 ${(lot.images||[]).length} скриншотов</p>
      `;

      // Обработчик кнопки избранного
      const lotFavBtn = headerEl.querySelector('#lot-fav-btn');
      if (lotFavBtn) {
        lotFavBtn.addEventListener('click', () => {
          const active = favToggle(String(lotId));
          lotFavBtn.classList.toggle('fav-active', active);
          lotFavBtn.setAttribute('aria-label', active ? 'Убрать из избранного' : 'В избранное');
          updateHeaderFavIcon();
        });
      }
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
      thumb.className = 'gallery-thumb fade-prep';
      thumb.dataset.index = idx;
      thumb.innerHTML = `
        <img src="${assetUrl(src)}" alt="Скриншот ${idx+1}" loading="lazy" class="loading">
        <div class="gallery-thumb-overlay">
          <svg width="33" height="33" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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
    applyFadeUpStagger(gridEl, '.gallery-thumb', 0.04);

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

// ── FAVOURITES: Страница избранных лотов ─────────────────────────
async function loadFavourites() {
  bindFadeCleanup();
  const shopId = getParam('shop');
  const gridEl = document.getElementById('lots-grid');
  const bcEl   = document.getElementById('breadcrumb');

  // Показываем иконку избранного (она уже активна, раз мы здесь)
  ensureHeaderFavBtn();

  // Настраиваем логотип/ссылку
  if (shopId) {
    setBrandHref(ROOT + 'shop/?id=' + encodeURIComponent(shopId));
  }

  const favIds = favGetAll();

  if (favIds.length === 0) {
    if (gridEl) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🤍</div><h2>Избранное пусто</h2><p>Наведи на карточку и нажми на сердечко, чтобы сохранить лот.</p></div>';
    }
    return;
  }

  if (!shopId || !gridEl) return;

  try {
    const rawBase = getGhRawBase();
    const data = rawBase
      ? await fetchJSON(rawBase + 'data/' + shopId + '.json')
      : await fetchJSON(ROOT + 'data/' + shopId + '.json');

    setBrandTitle(data.name || shopId);
    document.title = 'Избранное — ' + (data.name || shopId);

    if (bcEl) {
      bcEl.innerHTML = `
        <a href="${ROOT}shop/?id=${encodeURIComponent(shopId)}" class="bc-shop">${esc(data.name || shopId)}</a>
        <span class="sep">›</span>
        <span class="current">Избранное</span>`;
    }

    const allLots = Array.isArray(data.lots) ? data.lots : [];
    const favLots = allLots.filter(l => l && favIds.includes(String(l.id)));

    if (favLots.length === 0) {
      gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🤍</div><h2>Нет совпадений</h2><p>Сохранённые лоты не найдены в этой витрине.</p></div>';
      return;
    }

    gridEl.innerHTML = '';

    favLots.forEach((lot) => {
      const card = document.createElement('div');
      card.className = 'lot-card';

      const firstImg = lot.images && lot.images[0];
      const previewSrc = lot.thumb || firstImg;
      const thumbImg = previewSrc
        ? `<img class="lot-card-thumb" src="${assetUrl(previewSrc)}" alt="${esc(lot.title)}" loading="lazy">`
        : `<div class="lot-card-thumb-placeholder">🎯</div>`;

      const lotUrl = ROOT + 'lot/?shop=' + encodeURIComponent(shopId) + '&id=' + encodeURIComponent(lot.id);
      const title = normalizeLotTitle(lot.title);
      const titleClass = lot.titleWrap ? 'lot-card-title lot-card-title--wrap' : 'lot-card-title';

      const priceBadge = lot.price
        ? `<div class="lot-card-price-badge">${esc(lot.price)}<span class="price-rub"> ₽</span></div>`
        : '';

      // Fav overlay — heart always active (we're on fav page)
      const overlayHtml = `
        <div class="lot-card-overlay">
          <button class="card-action-btn btn-fav fav-active" data-lot-id="${esc(String(lot.id))}" type="button" aria-label="Убрать из избранного">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.45067 13.9082L11.4033 20.4395C11.6428 20.6644 11.7625 20.7769 11.9037 20.8046C11.9673 20.8171 12.0327 20.8171 12.0963 20.8046C12.2375 20.7769 12.3572 20.6644 12.5967 20.4395L19.5493 13.9082C21.5055 12.0706 21.743 9.0466 20.0978 6.92607L19.7885 6.52734C17.8203 3.99058 13.8696 4.41601 12.4867 7.31365C12.2913 7.72296 11.7087 7.72296 11.5133 7.31365C10.1304 4.41601 6.17972 3.99058 4.21154 6.52735L3.90219 6.92607C2.25695 9.0466 2.4945 12.0706 4.45067 13.9082Z" stroke-width="2"/></svg>
          </button>
          <div class="lot-card-overlay-center">
            <button class="card-action-btn btn-quickview" type="button" aria-label="Быстрый просмотр">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21.821 12.43c-.083-.119-2.062-2.944-4.793-4.875-1.416-1.003-3.202-1.555-5.028-1.555-1.825 0-3.611.552-5.03 1.555-2.731 1.931-4.708 4.756-4.791 4.875-.238.343-.238.798 0 1.141.083.119 2.06 2.944 4.791 4.875 1.419 1.002 3.205 1.554 5.03 1.554 1.826 0 3.612-.552 5.028-1.555 2.731-1.931 4.71-4.756 4.793-4.875.239-.342.239-.798 0-1.14zm-9.821 4.07c-1.934 0-3.5-1.57-3.5-3.5 0-1.934 1.566-3.5 3.5-3.5 1.93 0 3.5 1.566 3.5 3.5 0 1.93-1.57 3.5-3.5 3.5zM14 13c0 1.102-.898 2-2 2-1.105 0-2-.898-2-2 0-1.105.895-2 2-2 1.102 0 2 .895 2 2z"/></svg>
            </button>
            ${lot.funpay ? `<a class="card-action-btn btn-buy" href="${esc(lot.funpay)}" target="_blank" rel="noopener" aria-label="Купить на FunPay">
              <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M6.283.001h5.434l1.401.03c.395.031.759.098 1.106.264a3 3 0 0 1 1.295 1.191c.194.332.291.689.354 1.08.062.375.1.836.147 1.394l.53 6.361.098 1.619c0 .45-.047.868-.221 1.264a3 3 0 0 1-1.319 1.434c-.381.206-.793.287-1.242.325-.433.037-.97.037-1.621.037H5.755c-.651 0-1.188 0-1.621-.037-.449-.038-.861-.119-1.242-.325a3 3 0 0 1-1.319-1.434c-.174-.396-.22-.814-.221-1.264 0-.436.044-.969.098-1.619L1.98 4.96l.147-1.394c.063-.391.16-.748.354-1.08A3 3 0 0 1 3.776.295C4.123.13 4.487.063 4.882.032 5.254.001 5.69.001 6.283.001zm.468 4.5a.75.75 0 1 0-1.5 0 3.75 3.75 0 0 0 3.75 3.75 3.75 3.75 0 0 0 3.75-3.75.75.75 0 1 0-1.5 0 2.25 2.25 0 0 1-2.25 2.25 2.25 2.25 0 0 1-2.25-2.25z"/></svg>
            </a>` : ''}
          </div>
        </div>`;

      const thumbHtml = `<div class="lot-card-thumb-wrap">${thumbImg}${priceBadge}${overlayHtml}</div>`;
      const resHtml = (typeof renderResourceIcons === 'function')
        ? renderResourceIcons(lot.resources, 'short') : '';
      const tanks10Html = lot.tanks10 ? `<div class="${lot.tanks10Wrap ? 'lot-card-tanks10 lot-card-tanks10--wrap' : 'lot-card-tanks10'}">${esc(lot.tanks10)}</div>` : '';
      const vehicleStatsHtml = (() => {
        const t10 = lot.t10count != null && String(lot.t10count).trim() !== '' ? String(lot.t10count).trim() : null;
        const prem = lot.premcount != null && String(lot.premcount).trim() !== '' ? String(lot.premcount).trim() : null;
        if (!t10 && !prem) return '';
        let b = '';
        if (prem) b += `<span class="vstats__badge vstats__badge--prem"><span class="vstats__line">${esc(prem)} PREM'ов</span></span>`;
        if (t10)  b += `<span class="vstats__badge vstats__badge--top"><span class="vstats__line">${esc(t10)} топа</span></span>`;
        return `<div class="lot-card-vstats">${b}</div>`;
      })();

      card.innerHTML = `
        ${thumbHtml}
        <div class="lot-card-body">
          <div class="lot-card-title-row">
            <div class="${titleClass}">${lot.titleWrap ? escWithBr(title) : esc(title)}</div>
          </div>
          ${tanks10Html}
          ${vehicleStatsHtml}
          ${resHtml ? `<div class="lot-card-resources">${resHtml}</div>` : ''}
        </div>`;

      card.querySelector('.btn-quickview')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.QuickView) {
          window.QuickView.open(shopId, String(lot.id));
        } else {
          window.location.href = lotUrl;
        }
      });

      const favBtn = card.querySelector('.btn-fav');
      if (favBtn) {
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          favToggle(String(lot.id));
          // Remove card from page with animation
          card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.93)';
          setTimeout(() => {
            card.remove();
            updateHeaderFavIcon();
            if (gridEl.querySelectorAll('.lot-card').length === 0) {
              gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🤍</div><h2>Избранное пусто</h2><p>Наведи на карточку и нажми на сердечко, чтобы сохранить лот.</p></div>';
            }
          }, 280);
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-action-btn')) return;
        window.location.href = lotUrl;
      });

      gridEl.appendChild(card);
    });

    applyFadeUpStagger(gridEl, '.lot-card', 0.06);

  } catch (e) {
    if (gridEl) gridEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⚠️</div><h2>Ошибка загрузки</h2><p>' + esc(e.message) + '</p></div>';
  }
}
