/* ================================================================
   TANKNEXUS — Tanks Block (tanks-block.js)
   Рендерит блок с техникой и ресурсами на странице лота.
   ================================================================ */

(async function initTanksBlock() {
  'use strict';

  const blockEl = document.getElementById('lot-tanks-block');
  if (!blockEl) return;

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

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  // ── Загрузка данных ───────────────────────────────────────────
  const lotId = getParam('id');
  if (!lotId) return;

  const rawBase = getGhRawBase();
  const lotsUrl  = rawBase ? rawBase + 'data/lots.json'  : '../data/lots.json';
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
  function asTankArray(val) {
    if (Array.isArray(val)) return val;
    if (!val || !String(val).trim()) return [];
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
  }

  // Секции премиум техники (8–9 и 5–7 объединены визуально)
  const premSections = [
    { key: 'prems_8_9',      label: 'Премиум техника', showLabel: true,  names: asTankArray(d.prems_8_9) },
    { key: 'prems_6_7_bonus',label: null,              showLabel: false, names: [
        ...asTankArray(d.prems_6_7),
        ...asTankArray(d.bonus_tanks),
      ]
    },
  ].filter(s => s.names.length > 0);

  // Секция 10 уровня — отдельный блок
  const tier10Sections = [
    { key: 'tanks_10', label: '10 уровень', showLabel: true, names: asTankArray(d.tanks_10) },
  ].filter(s => s.names.length > 0);

  const activeSections = [...premSections, ...tier10Sections];

  // ── Ресурсы ───────────────────────────────────────────────────
  const RESOURCE_DEFS = [
    { key: 'bonds',    label: 'Боны',     file: 'bons.png'     },
    { key: 'gold',     label: 'Золото',   file: 'gold.png'     },
    { key: 'silver',   label: 'Серебро',  file: 'credits.png'  },
    { key: 'boosters', label: 'Резервы',  file: 'boosters.png' },
    { key: 'camo',     label: 'Стили',    file: 'style.png'    },
    { key: '3dstyles', label: '3D стили', file: 'style_3d.png' },
    { key: 'crew',     label: 'Экипаж',   file: 'tankman.png'  },
  ];

  function parseResourceVal(val) {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = parseInt(String(val).replace(/\s+/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  function formatNum(n) {
    return n.toLocaleString('ru-RU');
  }

  function buildResourceItems() {
    const items = [];
    for (const def of RESOURCE_DEFS) {
      const n = parseResourceVal(d[def.key]);
      if (n === null) continue;
      const iconSrc = assetUrl('icons/resources/' + def.file);
      items.push(
        `<div class="tb-resource-item">` +
          `<img src="${esc(iconSrc)}" alt="${esc(def.label)}" class="tb-resource-icon tb-resource-icon--${esc(def.key)}" loading="lazy" onerror="this.style.display='none'">` +
          `<div class="tb-resource-text">` +
            `<div class="tb-resource-name">${esc(def.label)}</div>` +
            `<div class="tb-resource-value">${esc(formatNum(n))}</div>` +
          `</div>` +
        `</div>`
      );
    }
    return items;
  }

  // ── Рендер танков ─────────────────────────────────────────────
  function renderSection(section) {
    const items = section.names.map(name => {
      const info  = tanksMap[name] || {};
      const icon  = info.icon ? assetUrl('icons/small/' + info.icon) : null;
      const descA = info.description_a || '';
      const tier  = info.tier ? String(info.tier) : '';

      const imgHtml = icon
        ? `<img src="${esc(icon)}" alt="${esc(name)}" class="tank-icon" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="tank-icon tank-icon--missing" title="${esc(name)}">?</div>`;

      const tierHtml = tier
        ? `<span class="tb-tier-badge">${esc(tier)}</span>`
        : '';

      return { name, descA, imgHtml, tierHtml };
    });

    const itemsHtml = items.map(item => `
      <div class="tank-item" data-desc="${esc(item.descA)}">
        <div class="tank-icon-wrap">${item.imgHtml}</div>
        <div class="tank-name-row">
          <span class="tank-name">${esc(item.name)}</span>${item.tierHtml}
        </div>
      </div>
    `).join('');

    const headerHtml = section.showLabel && section.label
      ? `<div class="tb-block-header">${esc(section.label)}</div>`
      : '';

    return `
      <div class="tanks-section">
        ${headerHtml}
        <div class="tanks-section-body">
          <div class="tanks-row">${itemsHtml}</div>
          <div class="tank-desc-panel" style="display:none"></div>
        </div>
      </div>
    `;
  }

  // ── Рендер ресурсов ───────────────────────────────────────────
  function renderResourcesBlock() {
    const items = buildResourceItems();
    if (items.length === 0) return '';
    return `
      <div class="tanks-block tb-resources-block">
        <div class="tb-block-header">Ресурсы</div>
        <div class="tb-resources-body">
          ${items.join('')}
        </div>
      </div>
    `;
  }

  // ── Итоговый HTML ─────────────────────────────────────────────
  let tanksBlockHtml = '';

  // Блок премиум техники (8–9 + 5–7 под одним визуальным блоком)
  if (premSections.length > 0) {
    tanksBlockHtml += `
      <div class="tanks-block tanks-block--premium">
        ${premSections.map(renderSection).join('')}
      </div>
    `;
  }

  // Блок 10 уровня — отдельный
  if (tier10Sections.length > 0) {
    tanksBlockHtml += `
      <div class="tanks-block tanks-block--tier10">
        ${tier10Sections.map(renderSection).join('')}
      </div>
    `;
  }

  const resourcesBlockHtml = renderResourcesBlock();

  blockEl.innerHTML = tanksBlockHtml + resourcesBlockHtml;

  // ── Клик по танку: раскрываем описание ───────────────────────
  blockEl.addEventListener('click', (e) => {
    const item = e.target.closest('.tank-item');
    if (!item) return;

    const sectionBody = item.closest('.tanks-section-body');
    if (!sectionBody) return;

    const panel = sectionBody.querySelector('.tank-desc-panel');
    const desc  = item.dataset.desc || '';

    if (item.classList.contains('tank-item--active')) {
      item.classList.remove('tank-item--active');
      panel.style.display = 'none';
      panel.textContent   = '';
      return;
    }

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
