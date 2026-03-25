/* ================================================================
   WoT Shop — Админ панель (admin.js)
   ================================================================ */

'use strict';

// ── GitHub RAW (картинки при локальном запуске) ──────────────────
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
  shops:      [],
  activeShop: null,
  activeLots: [],
  editingLot: null,
};

// ════════════════════════════════════════════════════════════════
//  DOM
// ════════════════════════════════════════════════════════════════
function $(id) { return document.getElementById(id); }

const dom = {
  tokenStatus:     $('token-status'),
  shopList:        $('shop-list'),
  adminMain:       $('admin-main'),

  settingsOverlay: $('settings-overlay'),
  settingsModal:   $('settings-modal'),
  tokenInput:      $('token-input'),
  tokenEye:        $('token-eye'),
  repoInput:       $('repo-input'),
  branchInput:     $('branch-input'),
  settingsStatus:  $('settings-status'),

  shopModalOvl:    $('shop-modal-overlay'),
  shopModal:       $('shop-modal'),
  shopModalTitle:  $('shop-modal-title'),
  shopIdInput:     $('shop-id-input'),
  shopNameInput:   $('shop-name-input'),
  shopDescInput:   $('shop-desc-input'),
  shopModalStatus: $('shop-modal-status'),

  lotModalOvl:     $('lot-modal-overlay'),
  lotModal:        $('lot-modal'),
  lotModalTitle:   $('lot-modal-title'),
  lotTitleInput:   $('lot-title-input'),
  lotFunpayInput:  $('lot-funpay-input'),
  lotOnFunpayInput:$('lot-onfunpay-input'),
  lotModalStatus:  $('lot-modal-status'),

  confirmOverlay:  $('confirm-overlay'),
  confirmModal:    $('confirm-modal'),
  confirmText:     $('confirm-text'),
  confirmOk:       $('confirm-ok'),
};

// ════════════════════════════════════════════════════════════════
//  МОДАЛКИ — явный реестр, без динамических ключей
// ════════════════════════════════════════════════════════════════
const MODALS = {
  settings:  { overlay: dom.settingsOverlay, modal: dom.settingsModal },
  shopModal: { overlay: dom.shopModalOvl,    modal: dom.shopModal     },
  lotModal:  { overlay: dom.lotModalOvl,     modal: dom.lotModal      },
  confirm:   { overlay: dom.confirmOverlay,  modal: dom.confirmModal  },
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
//  СТАРТ — ждём полной загрузки DOM
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async function () {
  loadSettingsToForm();
  updateTokenStatus();
  bindAllEvents();

  if (GH.isConfigured()) {
    await loadAllData();
  } else {
    openModal('settings');
    setStatus(dom.settingsStatus, 'Настройте GitHub для начала работы', 'info');
  }
});

// ════════════════════════════════════════════════════════════════
//  ВСЕ СОБЫТИЯ — в одном месте
// ════════════════════════════════════════════════════════════════
function bindAllEvents() {
  // Settings
  $('settings-btn').addEventListener('click', () => { loadSettingsToForm(); openModal('settings'); });
  $('settings-close').addEventListener('click', () => closeModal('settings'));
  dom.settingsOverlay.addEventListener('click', () => closeModal('settings'));
  $('settings-save').addEventListener('click', onSettingsSave);

  // Eye toggle для токена
  let tokenVisible = false;
  dom.tokenEye.addEventListener('click', () => {
    tokenVisible = !tokenVisible;
    dom.tokenInput.type = tokenVisible ? 'text' : 'password';
    dom.tokenEye.textContent = tokenVisible ? '🙈' : '👁';
  });

  // Shop modal
  $('add-shop-btn').addEventListener('click',      () => openShopModal(null));
  $('shop-modal-close').addEventListener('click',  () => closeModal('shopModal'));
  $('shop-modal-cancel').addEventListener('click', () => closeModal('shopModal'));
  dom.shopModalOvl.addEventListener('click',       () => closeModal('shopModal'));
  $('shop-modal-save').addEventListener('click',   onShopSave);

  // Lot modal
  $('lot-modal-close').addEventListener('click',   () => closeModal('lotModal'));
  $('lot-modal-cancel').addEventListener('click',  () => closeModal('lotModal'));
  dom.lotModalOvl.addEventListener('click',        () => closeModal('lotModal'));
  $('lot-modal-save').addEventListener('click',    onLotSave);

  // Confirm
  $('confirm-cancel').addEventListener('click',    () => closeModal('confirm'));
  dom.confirmOverlay.addEventListener('click',     () => closeModal('confirm'));

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
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check-icon lucide-check-check"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
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
    setTimeout(() => { closeModal('settings'); loadAllData(); }, 800);
  } catch (e) {
    setStatus(dom.settingsStatus, 'Ошибка: ' + e.message, 'err');
  }
}

// ════════════════════════════════════════════════════════════════
//  ДАННЫЕ
// ════════════════════════════════════════════════════════════════
async function loadAllData() {
  dom.shopList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const { data } = await GH.readJSON('data/shops.json');
    if (data === null) {
      // Файл не существует — создаём пустой (первый запуск)
      await GH.writeJSON('data/shops.json', { shops: [] }, 'Init shops.json');
      state.shops = [];
    } else {
      state.shops = Array.isArray(data.shops) ? data.shops : [];
    }
    renderShopList();
  } catch (e) {
    dom.shopList.innerHTML = '<p style="font-size:12px;color:var(--danger);padding:8px">' + esc(e.message) + '</p>';
  }
}

// ════════════════════════════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════════════════════════════
function renderShopList() {
  dom.shopList.innerHTML = '';
  if (state.shops.length === 0) {
    dom.shopList.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:4px 12px">Нет витрин</p>';
    return;
  }
  state.shops.forEach(shop => {
    const item = document.createElement('div');
    item.className = 'shop-list-item' + (shop.id === state.activeShop ? ' active' : '');
    item.innerHTML = '<span class="shop-list-item-icon">🏪</span><span class="shop-list-item-name">' + esc(shop.name) + '</span>';
    item.addEventListener('click', () => selectShop(shop.id));
    dom.shopList.appendChild(item);
  });
}

async function selectShop(shopId) {
  state.activeShop = shopId;
  renderShopList();
  dom.adminMain.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    // readJSON внутри обновляет SHA кеш — последующий saveLotsJSON
    // не будет делать лишний GET запрос и не получит 409
    const { data } = await GH.readJSON('data/' + shopId + '.json');
    state.activeLots = (data && Array.isArray(data.lots)) ? data.lots : [];
    renderShopPanel();
  } catch (e) {
    dom.adminMain.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h2>' + esc(e.message) + '</h2></div>';
  }
}

// ════════════════════════════════════════════════════════════════
//  SHOP PANEL
// ════════════════════════════════════════════════════════════════
function renderShopPanel() {
  const shop = state.shops.find(s => s.id === state.activeShop) || {};

  dom.adminMain.innerHTML = `
    <div class="shop-panel">
      <div class="shop-panel-header">
        <div class="shop-panel-title">${esc(shop.name || state.activeShop)}</div>
        <div class="shop-panel-actions">
          <a href="../shop/?id=${encodeURIComponent(state.activeShop)}" target="_blank" class="btn btn-ghost">
            <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span> Открыть
          </a>
          <button class="btn btn-ghost" id="edit-shop-btn">
            <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Изменить
          </button>
          <button class="btn btn-ghost" style="color:var(--danger)" id="delete-shop-btn">
            <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span> Удалить
          </button>
          <button class="btn btn-primary" id="add-lot-btn">
            <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span> Добавить лот
          </button>
        </div>
      </div>
      <div class="admin-lots-list" id="admin-lots-list"></div>
    </div>
  `;

  // Кнопки создаются динамически — привязываем сразу после innerHTML
  $('edit-shop-btn').addEventListener('click',   () => openShopModal(state.activeShop));
  $('delete-shop-btn').addEventListener('click', () => confirmDeleteShop(state.activeShop));
  $('add-lot-btn').addEventListener('click',     () => openLotModal(null));

  renderLots();
}

// ════════════════════════════════════════════════════════════════
//  LOTS
// ════════════════════════════════════════════════════════════════
function renderLots() {
  const list = $('admin-lots-list');
  if (!list) return;

  if (state.activeLots.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><h2>Нет лотов</h2><p>Нажмите «+ Добавить лот»</p></div>';
    return;
  }

  list.innerHTML = '';
  state.activeLots.forEach(lot => {
    const preview = lot.thumb || (lot.images && lot.images[0]);
    const thumb   = preview
      ? `<img class="admin-lot-thumb" src="${assetUrl(preview)}" alt="" loading="lazy">`
      : `<div class="admin-lot-thumb-placeholder">🎯</div>`;

    const onFunpay = (lot.onFunpay !== false); // совместимость со старыми лотами
    const badge = onFunpay
      ? `<span class="admin-lot-badge admin-lot-badge-funpay">FunPay</span>`
      : `<span class="admin-lot-badge admin-lot-badge-hidden">Скрыт</span>`;

    const card = document.createElement('div');
    card.className = 'admin-lot-card';
    card.innerHTML = `
      ${thumb}
      <div class="admin-lot-info">
        <div class="admin-lot-title">${escWithBr(lot.title)} ${badge}</div>
        <div class="admin-lot-meta">
          <span>${(lot.images || []).length} фото</span>
          ${lot.funpay ? `<a href="${lot.funpay}" target="_blank" style="color:var(--accent)">FunPay <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg style="display:inline-block;vertical-align:middle" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span></a>` : ''}
        </div>
      </div>
      <div class="admin-lot-actions">
        <button class="btn btn-ghost btn-no-border" data-action="images" data-lot="${lot.id}" title="Фото">
          <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></span>
        </button>
        <button class="btn btn-ghost btn-no-border" data-action="edit" data-lot="${lot.id}" title="Изменить">
          <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>
        </button>
        <button class="btn btn-ghost btn-no-border" style="color:var(--danger)" data-action="delete" data-lot="${lot.id}" title="Удалить">
          <span style="display:inline-flex;align-items:center;vertical-align:middle"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span>
        </button>
      </div>
    `;
    list.appendChild(card);
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const lotId  = btn.dataset.lot;
    const action = btn.dataset.action;
    if (action === 'edit')   openLotModal(lotId);
    if (action === 'delete') confirmDeleteLot(lotId);
    if (action === 'images') openImageManager(lotId);
  });
}

// ════════════════════════════════════════════════════════════════
//  SHOP MODAL
// ════════════════════════════════════════════════════════════════
function openShopModal(editId) {
  const shop = editId ? state.shops.find(s => s.id === editId) : null;
  dom.shopModalTitle.textContent = shop ? 'Редактировать витрину' : 'Новая витрина';
  dom.shopIdInput.value          = shop ? shop.id               : '';
  dom.shopIdInput.disabled       = !!shop;
  dom.shopNameInput.value        = shop ? shop.name             : '';
  dom.shopDescInput.value        = shop ? (shop.description || '') : '';
  dom.shopModalStatus.className  = 'status-msg';

  // Показываем подсказку: почему ID нельзя менять
  const idHint = dom.shopIdInput.closest('.form-group').querySelector('.id-edit-hint');
  if (shop && !idHint) {
    const hint = document.createElement('p');
    hint.className = 'form-hint id-edit-hint';
    hint.style.color = 'var(--text-muted)';
    hint.textContent = '⚠ ID нельзя изменить — от него зависят пути к изображениям';
    dom.shopIdInput.after(hint);
  } else if (!shop && idHint) {
    idHint.remove();
  }

  openModal('shopModal');
}

async function onShopSave() {
  const id   = dom.shopIdInput.value.trim();
  const name = dom.shopNameInput.value.trim();
  const desc = dom.shopDescInput.value.trim();

  if (!id)   { setStatus(dom.shopModalStatus, 'Введите ID', 'err'); return; }
  if (!name) { setStatus(dom.shopModalStatus, 'Введите название', 'err'); return; }
  if (!/^[a-z0-9_-]+$/.test(id)) {
    setStatus(dom.shopModalStatus, 'ID: только латинские буквы, цифры, _, -', 'err'); return;
  }

  setStatus(dom.shopModalStatus, 'Сохраняю…', 'info');
  try {
    const existing = state.shops.find(s => s.id === id);
    if (!existing) {
      // Новая витрина — создаём JSON файл
      await GH.writeJSON('data/' + id + '.json', {
        id, name, description: desc, seller: id, lots: []
      }, 'Create shop ' + id);
      state.shops.push({ id, name, description: desc });
    } else {
      // Редактирование — обновляем в shops.json и в файле витрины
      existing.name        = name;
      existing.description = desc;
      const { data } = await GH.readJSON('data/' + id + '.json');
      if (data) {
        data.name = name; data.description = desc;
        await GH.writeJSON('data/' + id + '.json', data, 'Update shop ' + id);
      }
    }
    await GH.writeJSON('data/shops.json', { shops: state.shops }, 'Update shops list');
    setStatus(dom.shopModalStatus, 'Сохранено', 'ok');
    setTimeout(() => {
      closeModal('shopModal');
      renderShopList();
      if (state.activeShop === id) renderShopPanel();
    }, 600);
  } catch (e) {
    setStatus(dom.shopModalStatus, 'Ошибка: ' + e.message, 'err');
  }
}

// ════════════════════════════════════════════════════════════════
//  LOT MODAL
// ════════════════════════════════════════════════════════════════
function openLotModal(editLotId) {
  const lot = editLotId ? state.activeLots.find(l => l.id === editLotId) : null;
  state.editingLot = editLotId;
  dom.lotModalTitle.textContent = lot ? 'Редактировать лот' : 'Новый лот';
  dom.lotTitleInput.value       = lot ? lot.title          : '';
  dom.lotFunpayInput.value      = lot ? (lot.funpay || '') : '';
  if (dom.lotOnFunpayInput) {
    dom.lotOnFunpayInput.checked = lot ? (lot.onFunpay !== false) : false;
  }

  // Заполняем поля ресурсов
  const res = (lot && lot.resources) ? lot.resources : {};
  const bondsEl  = $('lot-bonds-input');
  const goldEl   = $('lot-gold-input');
  const silverEl = $('lot-silver-input');
  if (bondsEl)  bondsEl.value  = res.bonds  !== undefined ? res.bonds  : '';
  if (goldEl)   goldEl.value   = res.gold   !== undefined ? res.gold   : '';
  if (silverEl) silverEl.value = res.silver !== undefined ? res.silver : '';

  // Вставляем иконки в поля ресурсов
  if (typeof RESOURCE_ICONS !== 'undefined') {
    const iconBonds  = $('res-icon-bonds');
    const iconGold   = $('res-icon-gold');
    const iconSilver = $('res-icon-silver');
    if (iconBonds)  iconBonds.src  = RESOURCE_ICONS.bonds;
    if (iconGold)   iconGold.src   = RESOURCE_ICONS.gold;
    if (iconSilver) iconSilver.src = RESOURCE_ICONS.silver;
  }

  dom.lotModalStatus.className  = 'status-msg';
  openModal('lotModal');
}

async function onLotSave() {
  const title  = dom.lotTitleInput.value.trim();
  const funpay = dom.lotFunpayInput.value.trim();
  const onFunpay = dom.lotOnFunpayInput ? !!dom.lotOnFunpayInput.checked : false;
  if (!title) { setStatus(dom.lotModalStatus, 'Введите название', 'err'); return; }

  // Читаем ресурсы, очищаем пробелы
  const bondsRaw  = ($('lot-bonds-input')  ? $('lot-bonds-input').value  : '').replace(/\s+/g, '');
  const goldRaw   = ($('lot-gold-input')   ? $('lot-gold-input').value   : '').replace(/\s+/g, '');
  const silverRaw = ($('lot-silver-input') ? $('lot-silver-input').value : '').replace(/\s+/g, '');

  const resources = {};
  if (bondsRaw  !== '') resources.bonds  = bondsRaw;
  if (goldRaw   !== '') resources.gold   = goldRaw;
  if (silverRaw !== '') resources.silver = silverRaw;

  setStatus(dom.lotModalStatus, 'Сохраняю…', 'info');
  try {
    if (state.editingLot) {
      const lot = state.activeLots.find(l => l.id === state.editingLot);
      if (lot) {
        lot.title = title; lot.funpay = funpay; lot.onFunpay = onFunpay;
        lot.resources = Object.keys(resources).length ? resources : undefined;
      }
    } else {
      const newLot = { id: 'lot_' + Date.now(), title, funpay, onFunpay, images: [] };
      if (Object.keys(resources).length) newLot.resources = resources;
      state.activeLots.push(newLot);
    }
    await saveLotsJSON();
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

function confirmDeleteShop(shopId) {
  const shop = state.shops.find(s => s.id === shopId);
  openConfirm('Удалить витрину «' + esc(shop ? shop.name : shopId) + '»?', () => deleteShop(shopId));
}
function confirmDeleteLot(lotId) {
  const lot = state.activeLots.find(l => l.id === lotId);
  openConfirm('Удалить лот «' + esc(lot ? lot.title : lotId) + '»?', () => deleteLot(lotId));
}

// ════════════════════════════════════════════════════════════════
//  УДАЛЕНИЕ
// ════════════════════════════════════════════════════════════════
async function deleteShop(shopId) {
  state.shops = state.shops.filter(s => s.id !== shopId);
  await GH.writeJSON('data/shops.json', { shops: state.shops }, 'Delete shop ' + shopId);
  try { await GH.deleteFile('data/' + shopId + '.json', 'Delete shop data'); } catch (_) {}
  if (state.activeShop === shopId) {
    state.activeShop = null; state.activeLots = [];
    dom.adminMain.innerHTML = '<div class="empty-state"><div class="empty-icon">🏪</div><h2>Выберите витрину</h2></div>';
  }
  renderShopList();
}

async function deleteLot(lotId) {
  const lot = state.activeLots.find(l => l.id === lotId);
  if (!lot) return;
  const files = [...(lot.images || [])];
  if (lot.thumb) files.push(lot.thumb);
  if (files.length > 0) await GH.deleteFiles(files, 'Delete lot ' + lotId);
  state.activeLots = state.activeLots.filter(l => l.id !== lotId);
  await saveLotsJSON();
  renderLots();
}

// ════════════════════════════════════════════════════════════════
//  IMAGE MANAGER
// ════════════════════════════════════════════════════════════════
let imLotId  = null;
let imImages = [];

function openImageManager(lotId) {
  imLotId  = lotId;
  const lot = state.activeLots.find(l => l.id === lotId);
  imImages  = lot ? [...(lot.images || [])] : [];

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
      <div class="image-manager-title">${esc(lot ? lot.title : lotId)}</div>
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
  const lot = state.activeLots.find(l => l.id === imLotId);
  if (lot) lot.images = [...imImages];
  try { await saveLotsJSON(); } catch (e) { console.error('saveOrder:', e.message); }
}

// ── Undo toast ────────────────────────────────────────────────
let undoToast   = null;
let undoTimer   = null;
let undoPending = null; // { path, idx, images: [...до удаления] }
const UNDO_DURATION = 15000;

function showUndoToast(msg, onUndo) {
  // Если уже показан — сначала применяем предыдущее
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
    undoToast.querySelector('.undo-toast-btn').addEventListener('click', () => {
      if (undoPending && onUndo) onUndo();
      hideUndoToast(true);
    });
  }

  undoToast.querySelector('.undo-toast-text').textContent = msg;
  // Обновляем обработчик кнопки
  const btn = undoToast.querySelector('.undo-toast-btn');
  btn.onclick = () => { if (undoPending) onUndo(); hideUndoToast(true); };

  // Анимация прогресс-бара
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
  try {
    await GH.deleteFile(path, 'Delete image');
  } catch (e) {
    console.error('commitPendingDelete:', e.message);
  }
}

async function deleteImage(idx) {
  const path         = imImages[idx];
  const savedImages  = [...imImages];     // снапшот для undo
  const savedIdx     = idx;

  // Удаляем из UI немедленно
  imImages.splice(idx, 1);
  const lot = state.activeLots.find(l => l.id === imLotId);
  if (lot) lot.images = [...imImages];
  renderManagedImages();
  renderLots();

  // Сохраняем JSON без удалённого файла
  try { await saveLotsJSON(); } catch (e) { console.error('deleteImage saveJSON:', e.message); }

  undoPending = { path, idx: savedIdx, savedImages };

  showUndoToast(`Фото ${savedIdx + 1} удалено`, async () => {
    // Отмена — восстанавливаем снапшот
    imImages = [...savedImages];
    const lot = state.activeLots.find(l => l.id === imLotId);
    if (lot) lot.images = [...imImages];
    undoPending = null;
    renderManagedImages();
    renderLots();
    try { await saveLotsJSON(); } catch (_) {}
  });
}

async function regenerateThumb() {
  if (!imImages.length) { alert('Нет изображений.'); return; }
  const btn = $('im-refresh-thumb');
  if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
  try {
    // getFileBytes возвращает Uint8Array — корректно для бинарных данных
    const { bytes } = await GH.getFileBytes(imImages[0]);
    // Определяем MIME по первым байтам (magic bytes)
    let mime = 'image/webp';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) mime = 'image/jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = 'image/png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = 'image/gif';

    const file = new File([new Blob([bytes], { type: mime })], 'source', { type: mime });
    const { base64, ext } = await ImageConvert.toWebP(file, 0.92, 1600);
    const thumbPath = 'images/' + state.activeShop + '/' + imLotId + '/thumb.' + ext;
    const sha = await GH.getFileSha(thumbPath);
    await GH.putBinaryFile(thumbPath, base64, 'Regenerate thumb', sha || undefined);
    const lot = state.activeLots.find(l => l.id === imLotId);
    if (lot) lot.thumb = thumbPath;
    await saveLotsJSON();
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

  const baseDir  = 'images/' + state.activeShop + '/' + imLotId;
  const startIdx = (() => {
    // Берём следующий номер по фактическим именам файлов (не по length),
    // чтобы не перезаписывать существующие картинки при пропусках/дубликатах.
    let max = -1;
    for (const p of imImages) {
      const m = String(p || '').match(/\/(\d{3,})\.[a-z0-9]+$/i);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (!Number.isFinite(n)) continue;
      // numberedName(idx) = (idx+1).padStart(3,'0') → значит idx = n-1
      max = Math.max(max, n - 1);
    }
    return max + 1;
  })();
  let   rateLimitHit = false;

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

      // Проверяем SHA: если файл уже есть — передаём sha, иначе undefined (новый)
      const existingSha = await GH.getFileSha(repoPath);
      await GH.putBinaryFile(repoPath, base64, 'Upload ' + fileName, existingSha || undefined);

      // Thumb для первого фото лота
      if (imImages.length === 0 && i === 0) {
        try {
          const { base64: tB64, ext: tExt } = await ImageConvert.toWebP(file, 0.92, 1600);
          const thumbPath = baseDir + '/thumb.' + tExt;
          const thumbSha  = await GH.getFileSha(thumbPath);
          await GH.putBinaryFile(thumbPath, tB64, 'Thumb for ' + imLotId, thumbSha || undefined);
          const lot = state.activeLots.find(l => l.id === imLotId);
          if (lot) lot.thumb = thumbPath;
        } catch (_) {}
      }

      imImages.push(repoPath);
      const lot = state.activeLots.find(l => l.id === imLotId);
      if (lot) lot.images = [...imImages];

      statusEl.textContent = '✓ Готово';
      statusEl.className   = 'upload-item-status ok';
    } catch (e) {
      statusEl.textContent = e.message;
      statusEl.className   = 'upload-item-status err';
      if (e.status === 403 && e.message.includes('лимит')) rateLimitHit = true;
    }
  }

  // Один коммит JSON после всей очереди
  try { await saveLotsJSON(); } catch (e) { console.error('saveLotsJSON after upload:', e.message); }

  renderManagedImages();
  renderLots();
  setTimeout(() => { if (queue) queue.innerHTML = ''; }, 4000);
}

// ════════════════════════════════════════════════════════════════
//  СОХРАНЕНИЕ JSON
// ════════════════════════════════════════════════════════════════
async function saveLotsJSON() {
  const shop = state.shops.find(s => s.id === state.activeShop) || {};
  await GH.writeJSON('data/' + state.activeShop + '.json', {
    id:          state.activeShop,
    name:        shop.name        || state.activeShop,
    description: shop.description || '',
    seller:      state.activeShop,
    lots:        state.activeLots,
  }, 'Update ' + state.activeShop);
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
