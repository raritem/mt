/* ================================================================
   TANKNEXUS — Админ панель (admin.js)
   Единая галерея: data/lots.json
   ================================================================ */

(function() {
'use strict';

const CATALOGUE_ID = 'lots';

// ── GitHub RAW ───────────────────────────────────────────────────
function getGhRawBase() {
  try {
    const cfg = (window.GH && GH.getConfig) ? GH.getConfig() : { repo: '', branch: 'main' };
    const repo = String(cfg.repo || '').trim().replace(/\/+$/, '');
    const branch = String(cfg.branch || 'main').trim() || 'main';
    if (!repo) return null;
    return 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/';
  } catch (_) {
    return null;
  }
}

function assetUrl(path) {
  const base = getGhRawBase();
  const p = String(path || '').replace(/^\/+/, '');
  return base ? (base + p) : ('../' + p);
}

// ════════════════════════════════════════════════════════════════
//  СОСТОЯНИЕ
// ════════════════════════════════════════════════════════════════
const state = {
  lotsObj: {},
  editingLotId: null,
  currentFilter: 'active',
};

// ════════════════════════════════════════════════════════════════
//  DOM
// ════════════════════════════════════════════════════════════════
function $(id) { return document.getElementById(id); }

const dom = {
  tokenStatus:      $('token-status'),
  adminMain:        $('admin-main'),

  settingsOverlay:  $('settings-overlay'),
  settingsModal:    $('settings-modal'),
  tokenInput:       $('token-input'),
  tokenEye:         $('token-eye'),
  repoInput:        $('repo-input'),
  branchInput:      $('branch-input'),
  settingsStatus:   $('settings-status'),

  lotModalOvl:      $('lot-modal-overlay'),
  lotModal:         $('lot-modal'),
  lotModalTitle:    $('lot-modal-title'),
  lotTitleInput:    $('lot-title-input'),
  lotTanks10Input:  $('lot-tanks10-input'),
  lotT10CountInput: $('lot-t10count-input'),
  lotPremCountInput:$('lot-premcount-input'),
  lotFunpayInput:   $('lot-funpay-input'),
  lotPriceInput:    $('lot-price-input'),
  lotOnFunpayInput: $('lot-onfunpay-input'),
  lotModalStatus:   $('lot-modal-status'),

  confirmOverlay:   $('confirm-overlay'),
  confirmModal:     $('confirm-modal'),
  confirmText:      $('confirm-text'),
  confirmOk:        $('confirm-ok'),

  importProgressOverlay: $('import-progress-overlay'),
  importProgressModal:   $('import-progress-modal'),
  importProgressMessage: $('import-progress-message'),
  importProgressFill:    $('import-progress-fill'),
  importResults:         $('import-results'),
  importStats:           $('import-stats'),
  importProgressClose:   $('import-progress-close'),
};

// ════════════════════════════════════════════════════════════════
//  МОДАЛКИ
// ════════════════════════════════════════════════════════════════
const MODALS = {
  settings: { overlay: dom.settingsOverlay, modal: dom.settingsModal },
  lotModal: { overlay: dom.lotModalOvl,     modal: dom.lotModal      },
  confirm:  { overlay: dom.confirmOverlay,  modal: dom.confirmModal  },
  importProgress: { overlay: dom.importProgressOverlay, modal: dom.importProgressModal },
};

function openModal(name) {
  const m = MODALS[name];
  if (!m) { console.error('[admin] openModal: unknown =', name); return; }
  m.overlay.classList.add('open');
  m.modal.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => m.modal.classList.add('open')));
}

function closeModal(name) {
  const m = MODALS[name];
  if (!m) return;
  m.modal.classList.remove('open');
  m.overlay.classList.remove('open');
  setTimeout(() => { m.modal.style.display = ''; }, 220);
}

// ════════════════════════════════════════════════════════════════
//  СТАРТ
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async function () {
  loadSettingsToForm();
  updateTokenStatus();
  bindAllEvents();

  if (GH.isConfigured()) {
    await loadCatalogueData();
  } else {
    openModal('settings');
    setStatus(dom.settingsStatus, 'Настройте GitHub для начала работы', 'info');
  }
});

// ════════════════════════════════════════════════════════════════
//  ВСЕ СОБЫТИЯ
// ════════════════════════════════════════════════════════════════
function bindAllEvents() {
  // Settings
  $('settings-btn').addEventListener('click', () => { loadSettingsToForm(); openModal('settings'); });
  $('settings-close').addEventListener('click', () => closeModal('settings'));
  dom.settingsOverlay.addEventListener('click', () => closeModal('settings'));
  $('settings-save').addEventListener('click', onSettingsSave);

  // Eye toggle
  let tokenVisible = false;
  dom.tokenEye.addEventListener('click', () => {
    tokenVisible = !tokenVisible;
    dom.tokenInput.type = tokenVisible ? 'text' : 'password';
    dom.tokenEye.textContent = tokenVisible ? '🙈' : '👁';
  });

  // Lot modal
  $('lot-modal-close').addEventListener('click',  () => closeModal('lotModal'));
  $('lot-modal-cancel').addEventListener('click', () => closeModal('lotModal'));
  dom.lotModalOvl.addEventListener('click',       () => closeModal('lotModal'));
  $('lot-modal-save').addEventListener('click',   onLotSave);

  // Wrap-toggle buttons
  document.querySelectorAll('.wrap-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('is-active');
      btn.title = btn.classList.contains('is-active') ? 'Перенос разрешён' : 'Разрешить перенос строки';
    });
  });

  // Confirm
  $('confirm-cancel').addEventListener('click', () => closeModal('confirm'));
  dom.confirmOverlay.addEventListener('click',  () => closeModal('confirm'));

  // Import progress close
  if (dom.importProgressClose) {
    dom.importProgressClose.addEventListener('click', () => closeModal('importProgress'));
  }

  // ESC
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const im = $('image-manager');
    if (im && im.classList.contains('open')) { closeImageManager(); return; }
    Object.keys(MODALS).forEach(closeModal);
  });
}

// ════════════════════════════════════════════════════════════════
//  SETTINGS
// ════════════════════════════════════════════════════════════════
function loadSettingsToForm() {
  const cfg = GH.getConfig();
  dom.tokenInput.value  = cfg.token;
  dom.repoInput.value   = cfg.repo;
  dom.branchInput.value = cfg.branch || 'main';
}

function updateTokenStatus() {
  if (GH.isConfigured()) {
    const repo = GH.getConfig().repo;
    dom.tokenStatus.innerHTML = `
      <span class="token-status-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
      </span>
      <span class="token-status-repo">${esc(repo)}</span>
    `;
    dom.tokenStatus.classList.add('connected');
  } else {
    dom.tokenStatus.textContent = 'Не настроено';
    dom.tokenStatus.classList.remove('connected');
  }
}

async function onSettingsSave() {
  const token  = dom.tokenInput.value.trim();
  const repo   = dom.repoInput.value.trim().replace(/\/+$/, '');
  const branch = dom.branchInput.value.trim() || 'main';

  if (!token) { setStatus(dom.settingsStatus, 'Введите токен', 'err'); return; }
  if (!repo)  { setStatus(dom.settingsStatus, 'Введите репозиторий', 'err'); return; }

  GH.saveConfig(token, repo, branch);
  setStatus(dom.settingsStatus, 'Проверяю подключение…', 'info');
  try {
    await GH.ping();
    setStatus(dom.settingsStatus, '✓ Подключено!', 'ok');
    updateTokenStatus();
    setTimeout(() => { closeModal('settings'); loadCatalogueData(); }, 800);
  } catch (e) {
    setStatus(dom.settingsStatus, 'Ошибка: ' + e.message, 'err');
  }
}

// ════════════════════════════════════════════════════════════════
//  ДАННЫЕ
// ════════════════════════════════════════════════════════════════
async function loadCatalogueData() {
  dom.adminMain.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const { data } = await GH.readJSON('data/' + CATALOGUE_ID + '.json');
    if (data === null) {
      await GH.writeJSON('data/' + CATALOGUE_ID + '.json', {
        id: CATALOGUE_ID, name: 'Галерея', lots: {}
      }, 'Init lots.json');
      state.lotsObj = {};
    } else {
      // Конвертация старого формата
      if (Array.isArray(data.lots)) {
        const oldLots = data.lots;
        data.lots = {};
        oldLots.forEach(lot => {
          const id = String(lot.id);
          data.lots[id] = {
            status: 'active',
            lastSeenInCsv: null,
            inactiveSince: null,
            data: {
              title: lot.title,
              funpay_link: lot.funpay,
              price: lot.price,
              tanks_10: lot.tanks10,
              premcount: lot.premcount,
              t10count: lot.t10count,
              resources: lot.resources || {}
            },
            ui: {
              title: lot.title,
              funpay: lot.funpay,
              price: lot.price,
              tanks10: lot.tanks10,
              premcount: lot.premcount,
              t10count: lot.t10count,
              resources: lot.resources || {},
              images: lot.images || [],
              thumb: lot.thumb || null,
              isHidden: (lot.onFunpay === false)
            }
          };
        });
        await GH.writeJSON('data/' + CATALOGUE_ID + '.json', data, 'Migrate to new format');
      }
      state.lotsObj = data.lots || {};
    }
    renderCataloguePanel();
  } catch (e) {
    dom.adminMain.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h2>' + esc(e.message) + '</h2></div>';
  }
}

// ════════════════════════════════════════════════════════════════
//  CATALOGUE PANEL
// ════════════════════════════════════════════════════════════════
function renderCataloguePanel() {
  const activeCount = Object.values(state.lotsObj).filter(l => l.status === 'active' && !l.ui?.isHidden).length;
  const hiddenCount = Object.values(state.lotsObj).filter(l => l.status === 'active' && l.ui?.isHidden).length;
  const inactiveCount = Object.values(state.lotsObj).filter(l => l.status === 'inactive').length;

  dom.adminMain.innerHTML = `
    <div class="shop-panel">
      <div class="shop-panel-header">
        <div class="shop-panel-title">Галерея</div>
        <div class="shop-panel-actions">
          <a href="../gallery/" target="_blank" class="btn btn-ghost">
            <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span> Открыть
          </a>
          <button class="btn btn-primary" id="import-csv-btn">
            <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span> Импорт CSV
          </button>
          <button class="btn btn-primary" id="add-lot-btn">
            <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span> Добавить лот
          </button>
        </div>
      </div>
      <div class="filter-tabs" style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
        <button class="filter-tab ${state.currentFilter === 'active' ? 'active' : ''}" data-filter="active">Активные (${activeCount})</button>
        <button class="filter-tab ${state.currentFilter === 'hidden' ? 'active' : ''}" data-filter="hidden">Скрытые (${hiddenCount})</button>
        <button class="filter-tab ${state.currentFilter === 'inactive' ? 'active' : ''}" data-filter="inactive">Неактивные (${inactiveCount})</button>
      </div>
      <div class="admin-lots-list" id="admin-lots-list"></div>
    </div>
  `;

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.currentFilter = tab.dataset.filter;
      renderCataloguePanel();
    });
  });

  $('add-lot-btn').addEventListener('click', () => openLotModal(null));
  $('import-csv-btn').addEventListener('click', triggerCsvImport);

  renderLots();
}

function triggerCsvImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    openModal('importProgress');
    dom.importResults.style.display = 'none';
    dom.importProgressMessage.textContent = 'Начинаем импорт...';
    dom.importProgressFill.style.width = '0%';
    
    try {
      const stats = await Importer.importFromCSV(file, (progress) => {
        if (progress.phase === 'parse') {
          dom.importProgressMessage.textContent = progress.message;
        } else if (progress.phase === 'process') {
          const percent = Math.round((progress.current / progress.total) * 100);
          dom.importProgressMessage.textContent = `Обработано ${progress.current} из ${progress.total} строк`;
          dom.importProgressFill.style.width = percent + '%';
        }
      });
      
      // Показываем результаты
      dom.importProgressMessage.textContent = 'Импорт завершён!';
      dom.importProgressFill.style.width = '100%';
      
      let statsHtml = `
        <p>✅ Обработано строк: ${stats.processed}</p>
        <p>🆕 Новых лотов: ${stats.new || 0}</p>
        <p>🔄 Обновлено: ${stats.updated || 0}</p>
        <p>⏸️ Неактивных: ${stats.inactive || 0}</p>
        <p>🗑️ Удалено: ${stats.deleted || 0}</p>
      `;
      
      if (stats.errors && stats.errors.length > 0) {
        statsHtml += `<p style="color: var(--danger); margin-top: 12px;">⚠️ Ошибки:</p>`;
        statsHtml += `<ul style="color: var(--danger); font-size: 12px; max-height: 150px; overflow-y: auto;">`;
        stats.errors.slice(0, 20).forEach(err => {
          statsHtml += `<li>${esc(err)}</li>`;
        });
        if (stats.errors.length > 20) {
          statsHtml += `<li>... и ещё ${stats.errors.length - 20}</li>`;
        }
        statsHtml += `</ul>`;
      }
      
      dom.importStats.innerHTML = statsHtml;
      dom.importResults.style.display = 'block';
      
      // Перезагружаем данные
      await loadCatalogueData();
      
    } catch (e) {
      dom.importProgressMessage.textContent = 'Ошибка импорта';
      dom.importStats.innerHTML = `<p style="color: var(--danger);">${esc(e.message)}</p>`;
      dom.importResults.style.display = 'block';
    }
  };
  input.click();
}

// ════════════════════════════════════════════════════════════════
//  LOTS
// ════════════════════════════════════════════════════════════════
function getFilteredLots() {
  const result = [];
  Object.entries(state.lotsObj).forEach(([id, lot]) => {
    let include = false;
    switch (state.currentFilter) {
      case 'active':
        include = (lot.status === 'active' && !lot.ui?.isHidden);
        break;
      case 'hidden':
        include = (lot.status === 'active' && lot.ui?.isHidden === true);
        break;
      case 'inactive':
        include = (lot.status === 'inactive');
        break;
      default:
        include = true;
    }
    if (include) {
      result.push({ id, ...lot });
    }
  });
  return result;
}

function renderLots() {
  const list = $('admin-lots-list');
  if (!list) return;

  const filteredLots = getFilteredLots();

  if (filteredLots.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><h2>Нет лотов</h2><p>Нажмите «+ Добавить лот» или «Импорт CSV»</p></div>';
    return;
  }

  list.innerHTML = '';
  filteredLots.forEach(lot => {
    const lotId = lot.id;
    const ui = lot.ui || {};
    const preview = ui.thumb || (ui.images && ui.images[0]);
    const thumb = preview
      ? `<img class="admin-lot-thumb" src="${assetUrl(preview)}" alt="" loading="lazy">`
      : `<div class="admin-lot-thumb-placeholder">🎯</div>`;

    const isHidden = ui.isHidden === true;
    const badge = !isHidden
      ? `<span class="admin-lot-badge admin-lot-badge-funpay">Верх</span>`
      : `<span class="admin-lot-badge admin-lot-badge-hidden">Скрыт</span>`;
    
    const inactiveBadge = lot.status === 'inactive' 
      ? `<span class="admin-lot-badge" style="background: rgba(239,68,68,0.15); color: var(--danger);">Неактивен</span>` 
      : '';

    const card = document.createElement('div');
    card.className = 'admin-lot-card';
    card.innerHTML = `
      ${thumb}
      <div class="admin-lot-info">
        <div class="admin-lot-title">${escWithBr(ui.title || lotId)} ${badge} ${inactiveBadge}</div>
        <div class="admin-lot-meta">
          <span>${(ui.images || []).length} фото</span>
          ${ui.funpay ? `<a href="${ui.funpay}" target="_blank" style="color:var(--accent)">FunPay <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg style="display:inline-block;vertical-align:middle" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span></a>` : ''}
          ${lot.status === 'inactive' && lot.inactiveSince ? `<span style="color: var(--text-muted);">неактивен с ${lot.inactiveSince}</span>` : ''}
        </div>
      </div>
      <div class="admin-lot-actions">
        <button class="btn btn-ghost btn-no-border" data-action="toggle-visibility" data-lot="${lotId}" title="${isHidden ? 'Показать' : 'Скрыть'}">
          <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>
        </button>
        <button class="btn btn-ghost btn-no-border" data-action="images" data-lot="${lotId}" title="Фото">
          <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></span>
        </button>
        <button class="btn btn-ghost btn-no-border" data-action="edit" data-lot="${lotId}" title="Изменить">
          <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>
        </button>
        <button class="btn btn-ghost btn-no-border" style="color:var(--danger)" data-action="delete" data-lot="${lotId}" title="Удалить">
          <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span>
        </button>
      </div>
    `;
    list.appendChild(card);
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const lotId = btn.dataset.lot;
    const action = btn.dataset.action;
    if (action === 'edit') openLotModal(lotId);
    if (action === 'delete') confirmDeleteLot(lotId);
    if (action === 'images') openImageManager(lotId);
    if (action === 'toggle-visibility') toggleLotVisibility(lotId);
  });
}

async function toggleLotVisibility(lotId) {
  const lot = state.lotsObj[lotId];
  if (!lot) return;
  lot.ui.isHidden = !lot.ui.isHidden;
  await saveCatalogueJSON();
  renderLots();
}

// ════════════════════════════════════════════════════════════════
//  LOT MODAL
// ════════════════════════════════════════════════════════════════
function openLotModal(editLotId) {
  const lot = editLotId ? state.lotsObj[editLotId] : null;
  state.editingLotId = editLotId;
  
  const ui = lot?.ui || {};
  
  dom.lotModalTitle.textContent = lot ? 'Редактировать лот' : 'Новый лот';
  dom.lotTitleInput.value       = ui.title || '';
  if (dom.lotTanks10Input)   dom.lotTanks10Input.value   = ui.tanks10 || '';
  if (dom.lotT10CountInput)  dom.lotT10CountInput.value  = ui.t10count || '';
  if (dom.lotPremCountInput) dom.lotPremCountInput.value = ui.premcount || '';
  dom.lotFunpayInput.value      = ui.funpay || '';
  if (dom.lotPriceInput)    dom.lotPriceInput.value    = ui.price || '';
  if (dom.lotOnFunpayInput) dom.lotOnFunpayInput.checked = !ui.isHidden;

  document.querySelectorAll('.wrap-toggle-btn').forEach(btn => {
    btn.disabled = false;
  });

  const res = ui.resources || {};
  const bondsEl  = $('lot-bonds-input');
  const goldEl   = $('lot-gold-input');
  const silverEl = $('lot-silver-input');
  if (bondsEl)  bondsEl.value  = res.bonds  || '';
  if (goldEl)   goldEl.value   = res.gold   || '';
  if (silverEl) silverEl.value = res.silver || '';

  if (typeof RESOURCE_ICONS !== 'undefined') {
    const iconBonds  = $('res-icon-bonds');
    const iconGold   = $('res-icon-gold');
    const iconSilver = $('res-icon-silver');
    if (iconBonds)  iconBonds.src  = RESOURCE_ICONS.bonds;
    if (iconGold)   iconGold.src   = RESOURCE_ICONS.gold;
    if (iconSilver) iconSilver.src = RESOURCE_ICONS.silver;
  }

  if (typeof VEHICLE_ICONS !== 'undefined') {
    const iconT10  = $('veh-icon-t10');
    const iconPrem = $('veh-icon-prem');
    if (iconT10)  iconT10.src  = VEHICLE_ICONS.t10;
    if (iconPrem) iconPrem.src = VEHICLE_ICONS.prem;
  }

  dom.lotModalStatus.className = 'status-msg';
  openModal('lotModal');
}

async function onLotSave() {
  const title       = dom.lotTitleInput.value.trim();
  const tanks10     = (dom.lotTanks10Input   ? dom.lotTanks10Input.value.trim()   : '');
  const t10countRaw  = (dom.lotT10CountInput  ? dom.lotT10CountInput.value.trim()  : '');
  const premcountRaw = (dom.lotPremCountInput ? dom.lotPremCountInput.value.trim() : '');
  const funpay      = dom.lotFunpayInput.value.trim();
  const price       = dom.lotPriceInput   ? dom.lotPriceInput.value.trim()   : '';
  const isNotHidden  = dom.lotOnFunpayInput ? !!dom.lotOnFunpayInput.checked  : true;

  if (!title) { setStatus(dom.lotModalStatus, 'Введите название', 'err'); return; }

  const bondsRaw  = ($('lot-bonds-input')  ? $('lot-bonds-input').value  : '').replace(/\s+/g, '');
  const goldRaw   = ($('lot-gold-input')   ? $('lot-gold-input').value   : '').replace(/\s+/g, '');
  const silverRaw = ($('lot-silver-input') ? $('lot-silver-input').value : '').replace(/\s+/g, '');

  const resources = {};
  if (bondsRaw  !== '') resources.bonds  = bondsRaw;
  if (goldRaw   !== '') resources.gold   = goldRaw;
  if (silverRaw !== '') resources.silver = silverRaw;

  setStatus(dom.lotModalStatus, 'Сохраняю…', 'info');
  try {
    if (state.editingLotId) {
      const lot = state.lotsObj[state.editingLotId];
      if (lot) {
        lot.ui = {
          ...lot.ui,
          title,
          funpay,
          price: price || null,
          tanks10: tanks10 || null,
          t10count: t10countRaw || null,
          premcount: premcountRaw || null,
          resources: Object.keys(resources).length ? resources : null,
          isHidden: !isNotHidden
        };
      }
    } else {
      const newId = String(Date.now()).slice(-9);
      state.lotsObj[newId] = {
        status: 'active',
        lastSeenInCsv: null,
        inactiveSince: null,
        data: {},
        ui: {
          title,
          funpay,
          price: price || null,
          tanks10: tanks10 || null,
          t10count: t10countRaw || null,
          premcount: premcountRaw || null,
          resources: Object.keys(resources).length ? resources : null,
          images: [],
          thumb: null,
          isHidden: !isNotHidden
        }
      };
    }
    await saveCatalogueJSON();
    setStatus(dom.lotModalStatus, 'Сохранено', 'ok');
    setTimeout(() => { closeModal('lotModal'); renderLots(); }, 500);
  } catch (e) {
    setStatus(dom.lotModalStatus, 'Ошибка: ' + e.message, 'err');
  }
}

// ════════════════════════════════════════════════════════════════
//  CONFIRM
// ════════════════════════════════════════════════════════════════
function openConfirm(text, onOk) {
  dom.confirmText.textContent = text;
  dom.confirmOk.onclick = async () => {
    dom.confirmOk.disabled = true;
    try { await onOk(); } finally { dom.confirmOk.disabled = false; }
    closeModal('confirm');
  };
  openModal('confirm');
}

function confirmDeleteLot(lotId) {
  const lot = state.lotsObj[lotId];
  openConfirm('Удалить лот «' + esc(lot?.ui?.title || lotId) + '»?', () => deleteLot(lotId));
}

// ════════════════════════════════════════════════════════════════
//  УДАЛЕНИЕ
// ════════════════════════════════════════════════════════════════
async function deleteLot(lotId) {
  const lot = state.lotsObj[lotId];
  if (!lot) return;
  const files = [...(lot.ui?.images || [])];
  if (lot.ui?.thumb) files.push(lot.ui.thumb);
  if (files.length > 0) await GH.deleteFiles(files, 'Delete lot ' + lotId);
  delete state.lotsObj[lotId];
  await saveCatalogueJSON();
  renderLots();
}

// ════════════════════════════════════════════════════════════════
//  IMAGE MANAGER
// ════════════════════════════════════════════════════════════════
let imLotId  = null;
let imImages = [];

function openImageManager(lotId) {
  imLotId  = lotId;
  const lot = state.lotsObj[lotId];
  imImages  = lot?.ui?.images ? [...lot.ui.images] : [];

  let panel = $('image-manager');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'image-manager';
    panel.className = 'image-manager';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="image-manager-header">
      <button class="btn btn-ghost" id="im-back">
        <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg></span> Назад
      </button>
      <div class="image-manager-title">${esc(lot?.ui?.title || lotId)}</div>
      <button class="btn btn-ghost" id="im-refresh-thumb">
        <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span> Обновить превью
      </button>
      <button class="btn btn-primary" id="im-upload-trigger">
        <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span> Добавить фото
      </button>
    </div>
    <div class="image-manager-body">
      <div class="dropzone" id="im-dropzone">
        <input type="file" id="im-file-input" accept="image/*" multiple>
        <div class="dropzone-icon"><span style="display:inline-flex;align-items:center;vertical-align:middle"><svg style="color:var(--text-muted)" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg></span></div>
        <div class="dropzone-text">Перетащите изображения сюда</div>
        <div class="dropzone-hint">PNG, JPG, GIF → WebP</div>
      </div>
      <div class="upload-queue" id="im-upload-queue"></div>
      <div class="managed-images" id="im-managed-images"></div>
    </div>
  `;

  renderManagedImages();

  $('im-back').addEventListener('click', closeImageManager);
  $('im-refresh-thumb').addEventListener('click', regenerateThumb);
  $('im-upload-trigger').addEventListener('click', () => $('im-file-input').click());

  const fi = $('im-file-input');
  fi.addEventListener('change', () => { if (fi.files.length) uploadFiles(fi.files); fi.value = ''; });

  const dz = $('im-dropzone');
  dz.addEventListener('click',    () => $('im-file-input').click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave',()  => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('dragover');
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  });

  requestAnimationFrame(() => panel.classList.add('open'));
}

function closeImageManager() {
  const p = $('image-manager');
  if (p) p.classList.remove('open');
}

function renderManagedImages() {
  const c = $('im-managed-images');
  if (!c) return;
  c.innerHTML = '';

  if (imImages.length === 0) {
    c.innerHTML = '<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1">Нет изображений</p>';
    return;
  }

  imImages.forEach((src, idx) => {
    const card = document.createElement('div');
    card.className = 'managed-img-card';
    card.dataset.idx = idx;
    card.draggable = true;
    card.innerHTML = `
      <div class="drag-handle"><span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg></span></div>
      <img src="${assetUrl(src)}" alt="" loading="lazy">
      <div class="managed-img-footer">
        <span class="managed-img-num">${idx + 1}</span>
        <div class="managed-img-actions">
          <button class="img-action-btn" data-action="up"   data-idx="${idx}" title="Вверх"><span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></span></button>
          <button class="img-action-btn" data-action="down" data-idx="${idx}" title="Вниз"><span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></span></button>
          <button class="img-action-btn danger" data-action="del" data-idx="${idx}" title="Удалить"><span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span></button>
        </div>
      </div>
    `;
    c.appendChild(card);
    bindDragSort(card);
  });

  c.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    const act = btn.dataset.action;
    if (act === 'up'   && idx > 0)               { swap(idx, idx-1); await saveOrder(); }
    if (act === 'down' && idx < imImages.length-1){ swap(idx, idx+1); await saveOrder(); }
    if (act === 'del') await deleteImage(idx);
  };
}

let dragSrcIdx = null;
function bindDragSort(card) {
  card.addEventListener('dragstart', (e) => { dragSrcIdx = parseInt(card.dataset.idx); card.classList.add('dragging-card'); e.dataTransfer.effectAllowed = 'move'; });
  card.addEventListener('dragend',   ()  => card.classList.remove('dragging-card'));
  card.addEventListener('dragover',  (e) => { e.preventDefault(); document.querySelectorAll('.managed-img-card').forEach(c=>c.classList.remove('drag-over-card')); card.classList.add('drag-over-card'); });
  card.addEventListener('dragleave', ()  => card.classList.remove('drag-over-card'));
  card.addEventListener('drop', async (e) => {
    e.preventDefault(); card.classList.remove('drag-over-card');
    const dest = parseInt(card.dataset.idx);
    if (dragSrcIdx !== null && dragSrcIdx !== dest) {
      const item = imImages.splice(dragSrcIdx, 1)[0];
      imImages.splice(dest, 0, item);
      renderManagedImages();
      await saveOrder();
    }
    dragSrcIdx = null;
  });
}

function swap(a, b) { [imImages[a], imImages[b]] = [imImages[b], imImages[a]]; renderManagedImages(); }

async function saveOrder() {
  const lot = state.lotsObj[imLotId];
  if (lot) {
    if (!lot.ui) lot.ui = {};
    lot.ui.images = [...imImages];
  }
  try { await saveCatalogueJSON(); } catch (e) { console.error('saveOrder:', e.message); }
}

// ── Undo toast ────────────────────────────────────────────────
let undoToast   = null;
let undoTimer   = null;
let undoPending = null;
const UNDO_DURATION = 15000;

function showUndoToast(msg, onUndo) {
  if (undoTimer) commitPendingDelete();
  if (!undoToast) {
    undoToast = document.createElement('div');
    undoToast.className = 'undo-toast';
    undoToast.innerHTML = `
      <span class="undo-toast-text"></span>
      <button class="undo-toast-btn">Отменить</button>
      <div class="undo-toast-progress"></div>
    `;
    document.body.appendChild(undoToast);
  }
  undoToast.querySelector('.undo-toast-text').textContent = msg;
  const btn = undoToast.querySelector('.undo-toast-btn');
  btn.onclick = () => { if (undoPending) onUndo(); hideUndoToast(true); };
  const bar = undoToast.querySelector('.undo-toast-progress');
  bar.style.transition = 'none';
  bar.style.transform  = 'scaleX(1)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `transform ${UNDO_DURATION}ms linear`;
    bar.style.transform  = 'scaleX(0)';
  }));
  requestAnimationFrame(() => undoToast.classList.add('visible'));
  undoTimer = setTimeout(() => { commitPendingDelete(); hideUndoToast(false); }, UNDO_DURATION);
}

function hideUndoToast(cancelled) {
  clearTimeout(undoTimer);
  undoTimer = null;
  if (undoToast) undoToast.classList.remove('visible');
}

async function commitPendingDelete() {
  if (!undoPending) return;
  const { path } = undoPending;
  undoPending = null;
  try { await GH.deleteFile(path, 'Delete image'); } catch (e) { console.error('commitPendingDelete:', e.message); }
}

async function deleteImage(idx) {
  const path        = imImages[idx];
  const savedImages = [...imImages];
  const savedIdx    = idx;

  imImages.splice(idx, 1);
  const lot = state.lotsObj[imLotId];
  if (lot) {
    if (!lot.ui) lot.ui = {};
    lot.ui.images = [...imImages];
  }
  renderManagedImages();
  renderLots();

  try { await saveCatalogueJSON(); } catch (e) { console.error('deleteImage saveJSON:', e.message); }

  undoPending = { path, idx: savedIdx, savedImages };
  showUndoToast(`Фото ${savedIdx + 1} удалено`, async () => {
    imImages = [...savedImages];
    const lot = state.lotsObj[imLotId];
    if (lot) {
      if (!lot.ui) lot.ui = {};
      lot.ui.images = [...imImages];
    }
    undoPending = null;
    renderManagedImages();
    renderLots();
    try { await saveCatalogueJSON(); } catch (_) {}
  });
}

async function regenerateThumb() {
  if (!imImages.length) { alert('Нет изображений.'); return; }
  const btn = $('im-refresh-thumb');
  if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
  try {
    const { bytes } = await GH.getFileBytes(imImages[0]);
    let mime = 'image/webp';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) mime = 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = 'image/gif';
    const file = new File([new Blob([bytes], { type: mime })], 'source', { type: mime });
    const { base64, ext } = await ImageConvert.toWebP(file, 0.92, 1600);
    const thumbPath = 'images/' + CATALOGUE_ID + '/' + imLotId + '/thumb.' + ext;
    const sha = await GH.getFileSha(thumbPath);
    await GH.putBinaryFile(thumbPath, base64, 'Regenerate thumb', sha || undefined);
    const lot = state.lotsObj[imLotId];
    if (lot) {
      if (!lot.ui) lot.ui = {};
      lot.ui.thumb = thumbPath;
    }
    await saveCatalogueJSON();
    if (btn) btn.textContent = '✓ Готово';
    setTimeout(() => { if (btn) { btn.textContent = '🖼 Обновить превью'; btn.disabled = false; } }, 2000);
  } catch (e) {
    if (btn) { btn.textContent = '⚠'; btn.disabled = false; }
    alert('Ошибка: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════
//  ЗАГРУЗКА ФАЙЛОВ
// ════════════════════════════════════════════════════════════════
async function uploadFiles(files) {
  const queue    = $('im-upload-queue');
  const fileList = Array.from(files);
  queue.innerHTML = '';

  fileList.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'upload-item';
    div.innerHTML = `<span class="upload-item-name">${esc(f.name)}</span><span class="upload-item-status busy" id="upload-status-${i}">Подготовка…</span>`;
    queue.appendChild(div);
  });

  const baseDir  = 'images/' + CATALOGUE_ID + '/' + imLotId;
  const startIdx = (() => {
    let max = -1;
    for (const p of imImages) {
      const m = String(p || '').match(/\/(\d{3,})\.[a-z0-9]+$/i);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (!Number.isFinite(n)) continue;
      max = Math.max(max, n - 1);
    }
    return max + 1;
  })();
  let rateLimitHit = false;

  for (let i = 0; i < fileList.length; i++) {
    const statusEl = $('upload-status-' + i);
    if (rateLimitHit) { statusEl.textContent = 'Пропущено'; statusEl.className = 'upload-item-status err'; continue; }
    try {
      statusEl.textContent = 'Конвертация…';
      const file = fileList[i];
      const { base64, ext } = await ImageConvert.toWebP(file);
      const fileNum  = startIdx + i;
      const fileName = ImageConvert.numberedName(fileNum, ext);
      const repoPath = baseDir + '/' + fileName;
      statusEl.textContent = 'Загрузка…';
      const existingSha = await GH.getFileSha(repoPath);
      await GH.putBinaryFile(repoPath, base64, 'Upload ' + fileName, existingSha || undefined);
      if (imImages.length === 0 && i === 0) {
        try {
          const { base64: tB64, ext: tExt } = await ImageConvert.toWebP(file, 0.92, 1600);
          const thumbPath = baseDir + '/thumb.' + tExt;
          const thumbSha  = await GH.getFileSha(thumbPath);
          await GH.putBinaryFile(thumbPath, tB64, 'Thumb for ' + imLotId, thumbSha || undefined);
          const lot = state.lotsObj[imLotId];
          if (lot) {
            if (!lot.ui) lot.ui = {};
            lot.ui.thumb = thumbPath;
          }
        } catch (_) {}
      }
      imImages.push(repoPath);
      const lot = state.lotsObj[imLotId];
      if (lot) {
        if (!lot.ui) lot.ui = {};
        lot.ui.images = [...imImages];
      }
      statusEl.textContent = '✓ Готово';
      statusEl.className   = 'upload-item-status ok';
    } catch (e) {
      statusEl.textContent = e.message;
      statusEl.className   = 'upload-item-status err';
      if (e.status === 403 && e.message.includes('лимит')) rateLimitHit = true;
    }
  }

  try { await saveCatalogueJSON(); } catch (e) { console.error('saveCatalogueJSON after upload:', e.message); }
  renderManagedImages();
  renderLots();
  setTimeout(() => { if (queue) queue.innerHTML = ''; }, 4000);
}

// ════════════════════════════════════════════════════════════════
//  СОХРАНЕНИЕ JSON
// ════════════════════════════════════════════════════════════════
async function saveCatalogueJSON() {
  await GH.writeJSON('data/' + CATALOGUE_ID + '.json', {
    id:   CATALOGUE_ID,
    name: 'Галерея',
    lots: state.lotsObj,
  }, 'Update lots');
}

// ════════════════════════════════════════════════════════════════
//  УТИЛИТЫ
// ════════════════════════════════════════════════════════════════
function setStatus(el, msg, type) {
  if (!el) return;
  if (type === 'ok') {
    el.innerHTML = '<span style="display:inline-flex;align-items:center;vertical-align:middle"><svg style="display:inline-block;vertical-align:middle;margin-right:5px" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>' + esc(msg);
  } else {
    el.textContent = msg;
  }
  el.className = 'status-msg visible ' + (type || '');
  if (type === 'ok') setTimeout(() => { el.className = 'status-msg'; }, 3000);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

function escWithBr(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML.replace(/\n/g, '<br>');
}

})();