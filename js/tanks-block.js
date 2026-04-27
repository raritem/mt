/* ================================================================
   TANKNEXUS — Tanks Block (tanks-block.js)
   Рендерит блок с техникой на странице детального просмотра лота.
   Вставляется между #lot-header и #gallery-grid.
   ================================================================ */

(async function initTanksBlock() {
  'use strict';

  const blockEl = document.getElementById('lot-tanks-block');
  if (!blockEl) return;

  // ── Утилиты (дублируем из main.js, т.к. тот модуль не экспортирует) ──
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getGhRawBase() {
    try {
      const repo   = (localStorage.getItem('wotshop-gh-repo')   || '').trim().replace(/\/+$/, '');
      const branch = (localStorage.getItem('wotshop-gh-branch') || 'main').trim() || 'main';
      if (!repo) return null;
      return 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/';
    } catch (_) { return null; }
  }

  function assetUrl(path) {
    const base = getGhRawBase();
    return base ? (base + String(path || '').replace(/^\/+/, '')) : ('../' + path);
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
    return res.json();
  }

  // ── Загрузка данных ───────────────────────────────────────────
  const lotId = getParam('id');
  if (!lotId) return;

  const rawBase = getGhRawBase();
  const lotsUrl = rawBase ? rawBase + 'data/lots.json' : '../data/lots.json';
  const tanksUrl = rawBase ? rawBase + 'data/tanks.json' : '../data/tanks.json';

  let lotsData, tanksData;
  try {
    [lotsData, tanksData] = await Promise.all([fetchJSON(lotsUrl), fetchJSON(tanksUrl)]);
  } catch (e) {
    console.warn('[TanksBlock] Не удалось загрузить данные:', e.message);
    return;
  }

  const cleanId = lotId.replace(/^lot_/, '');
  const lots    = lotsData.lots || {};
  const entry   = lots[cleanId] || lots[lotId];
  if (!entry || entry.status === 'inactive') return;

  const d = entry.data || {};
  const tanksMap = tanksData.tanks || {};

  // ── Разделы техники ──────────────────────────────────────────
  // Поля танков в lots.json хранятся как массивы (после нормализации через importer.js).
  // Для обратной совместимости со старыми записями поддерживаем и строковый формат.
  function asTankArray(val) {
    if (Array.isArray(val)) return val;
    if (!val || !String(val).trim()) return [];
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
  }

  // ── Сортировка: прем 8-9 → 10 → прем 7 → 6 → 5, внутри — по interest_level desc ──
  function sortTankNames(names) {
    function groupOrder(info) {
      const tier   = String(info.tier || '');
      const isPrem = !!info.isPrem;
      if ((tier === '8' || tier === '9') && isPrem) return 0;
      if (tier === '10') return 1;
      if (tier === '7' && isPrem) return 2;
      if (tier === '6' && isPrem) return 3;
      if (tier === '5' && isPrem) return 4;
      return 5;
    }
    return [...names].sort((a, b) => {
      const ia = tanksMap[a] || {}, ib = tanksMap[b] || {};
      const ga = groupOrder(ia), gb = groupOrder(ib);
      if (ga !== gb) return ga - gb;
      return (parseInt(ib.interest_level || '0', 10) || 0) -
             (parseInt(ia.interest_level || '0', 10) || 0);
    });
  }

  const sections = [
    {
      key:   'prems_8_9',
      label: 'PREM танки 8–9 уровня',
      names: sortTankNames(asTankArray(d.prems_8_9)),
    },
    {
      key:   'tanks_10',
      label: 'Танки 10 уровня',
      names: sortTankNames(asTankArray(d.tanks_10)),
    },
    {
      key:   'prems_6_7_bonus',
      label: 'PREM танки 5–7 уровня',
      names: sortTankNames([
        ...asTankArray(d.prems_6_7),
        ...asTankArray(d.bonus_tanks),
      ]),
    },
  ];

  // Отфильтровываем секции, в которых нет ни одного танка
  const activeSections = sections.filter(s => s.names.length > 0);
  if (activeSections.length === 0) return;

  // ── Рендер ───────────────────────────────────────────────────
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function renderSection(section) {
    const items = section.names.map(name => {
      const info = tanksMap[name] || {};
      const icon = info.icon
        ? assetUrl('icons/small/' + info.icon)
        : null;
      const descA = info.description_a || '';

      const imgHtml = icon
        ? `<img src="${esc(icon)}" alt="${esc(name)}" class="tank-icon" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="tank-icon tank-icon--missing" title="${esc(name)}">?</div>`;

      return { name, icon, descA, imgHtml };
    });

    const itemsHtml = items.map(item => `
      <div class="tank-item" data-desc="${esc(item.descA)}">
        <div class="tank-icon-wrap">${item.imgHtml}</div>
        <div class="tank-name">${esc(item.name)}</div>
      </div>
    `).join('');

    return `
      <div class="tanks-section">
        <div class="tanks-section-label">${esc(section.label)}</div>
        <div class="tanks-section-body">
          <div class="tanks-row">${itemsHtml}</div>
          <div class="tank-desc-panel" style="display:none"></div>
        </div>
      </div>
    `;
  }

  blockEl.innerHTML = `
    <div class="tanks-block">
      ${activeSections.map(renderSection).join('')}
    </div>
  `;

  // ── Клик по танку: раскрываем описание ───────────────────────
  blockEl.addEventListener('click', (e) => {
    const item = e.target.closest('.tank-item');
    if (!item) return;

    const sectionBody = item.closest('.tanks-section-body');
    if (!sectionBody) return;

    const panel = sectionBody.querySelector('.tank-desc-panel');
    const desc  = item.dataset.desc || '';

    // Если кликнули на уже активный — закрываем
    if (item.classList.contains('tank-item--active')) {
      item.classList.remove('tank-item--active');
      panel.style.display = 'none';
      panel.textContent   = '';
      return;
    }

    // Снимаем активность с остальных в этой секции
    sectionBody.querySelectorAll('.tank-item--active')
      .forEach(el => el.classList.remove('tank-item--active'));

    item.classList.add('tank-item--active');

    if (desc) {
      panel.textContent   = desc;
      panel.style.display = '';
    } else {
      panel.style.display = 'none';
      panel.textContent   = '';
    }
  });

})();
