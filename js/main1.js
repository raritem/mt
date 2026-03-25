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
  if (['admin', 'shop', 'lot'].includes(last)) return '../';
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
  document.addEventListener('animationend', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (e.animationName !== 'fadeUp') return;
    if (!el.classList.contains('fade-up')) return;
    el.classList.remove('fade-up');
    el.style.animationDelay = '';
    el.style.willChange = '';
    // Возвращаем чистое финальное состояние (без inline-стилей),
    // чтобы не страдала резкость после анимации.
    el.style.opacity = '';
    el.style.transform = '';
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
      const thumbHtml = previewSrc
        ? `<img class="lot-card-thumb" src="${assetUrl(previewSrc)}" alt="${esc(lot.title)}" loading="lazy">`
        : `<div class="lot-card-thumb-placeholder">🎯</div>`;

      const count  = (lot.images || []).length;
      const lotUrl = ROOT + 'lot/?shop=' + encodeURIComponent(shopId) + '&id=' + encodeURIComponent(lot.id);
      const title  = normalizeLotTitle(lot.title);

      card.innerHTML = `
        ${thumbHtml}
        <div class="lot-card-body">
          <div class="lot-card-title">${esc(title)}</div>
          <div class="lot-card-images-count">📸 ${count} ${plural(count, 'скриншот', 'скриншота', 'скриншотов')}</div>
        </div>
        ${lot.funpay ? `<div class="lot-card-footer"><a href="${lot.funpay}" target="_blank" rel="noopener" class="lot-card-funpay-btn">Купить на ${funpayLogo(14)}</a></div>` : ''}
      `;

      // Клик по карточке (не по кнопке FunPay) → переход на лот
      card.addEventListener('click', (e) => {
        if (e.target.closest('.lot-card-funpay-btn')) return;
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

        // Анимация таблицы — только когда доскроллили до секции
        if (!tableSectionEl.dataset.ioBound) {
          tableSectionEl.dataset.ioBound = '1';
          const io = new IntersectionObserver((entries) => {
            const e = entries[0];
            if (!e || !e.isIntersecting) return;
            tableSectionEl.dataset.seen = '1';
            applyFadeUpStagger(tableEl, '.lot-row-card', 0.03);
            io.disconnect();
          }, { threshold: 0.08 });
          io.observe(tableSectionEl);
        }

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

          filtered.forEach((lot, i) => {
            const row = document.createElement('div');
            row.className = 'lot-row-card fade-prep';

            const firstImg = lot.images && lot.images[0];
            const previewSrc = lot.thumb || firstImg;
            const thumbHtml = previewSrc
              ? `<img class="lot-row-thumb" src="${assetUrl(previewSrc)}" alt="${esc(lot.title)}" loading="lazy">`
              : `<div class="lot-row-thumb-placeholder">🎯</div>`;

            const title = normalizeLotTitle(lot.title);
            const tags = Array.isArray(lot.tags) ? lot.tags : [];
            const tagsHtml = tags.length
              ? tags.slice(0, 10).map(t => `<span class="lot-row-tag">${esc(String(t))}</span>`).join('')
              : `<span class="lot-row-tags-empty">Иконки ценности добавим позже</span>`;

            row.innerHTML = `
              <div class="lot-row-left">
                ${thumbHtml}
                <div class="lot-row-mid">
                  <div class="lot-row-title">${esc(title)}</div>
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

          // Если секция уже была показана — анимируем новые результаты фильтра сразу
          if (tableSectionEl.dataset.seen === '1') {
            applyFadeUpStagger(tableEl, '.lot-row-card', 0.03);
          }
        };

        // Привязка фильтра
        if (qEl) qEl.oninput = renderHidden;

        renderHidden();
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
      const fp = lot.funpay
        ? `<a href="${lot.funpay}" target="_blank" rel="noopener" class="lot-header-funpay-btn">Купить на ${funpayLogo(14)}</a>`
        : '';
      headerEl.innerHTML = `
        <div class="lot-header-top">
          <a href="${ROOT}shop/?id=${encodeURIComponent(shopId)}" class="btn btn-ghost back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Назад
          </a>
          ${fp}
        </div>
        <h1 class="lot-title">${esc(title)}</h1>
        <p style="color:var(--text-muted);font-size:13px;margin-top:4px">📸 ${(lot.images||[]).length} скриншотов</p>
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
      thumb.className = 'gallery-thumb';
      thumb.dataset.index = idx;
      thumb.innerHTML = `
        <img src="${assetUrl(src)}" alt="Скриншот ${idx+1}" loading="lazy" class="loading">
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
