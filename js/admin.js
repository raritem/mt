/* ================================================================
   WoT Shop — Админ панель (admin.js)
   Управление витринами, лотами и изображениями
   ================================================================ */

'use strict';

// ── Состояние ───────────────────────────────────────────────────
let state = {
  shops:       [],   // [{id, name, description}]
  activeShop:  null, // id активной витрины
  activeLots:  [],   // лоты активной витрины
  editingLot:  null, // {id} — редактируемый лот
};

// ── DOM ────────────────────────────────────────────────────────
const dom = {
  tokenStatus:     document.getElementById('token-status'),
  shopList:        document.getElementById('shop-list'),
  adminMain:       document.getElementById('admin-main'),
  emptyState:      document.getElementById('empty-state'),

  // Модалки
  settingsOverlay: document.getElementById('settings-overlay'),
  settingsModal:   document.getElementById('settings-modal'),
  tokenInput:      document.getElementById('token-input'),
  tokenEye:        document.getElementById('token-eye'),
  repoInput:       document.getElementById('repo-input'),
  branchInput:     document.getElementById('branch-input'),
  settingsStatus:  document.getElementById('settings-status'),

  shopModalOvl:    document.getElementById('shop-modal-overlay'),
  shopModal:       document.getElementById('shop-modal'),
  shopModalTitle:  document.getElementById('shop-modal-title'),
  shopIdInput:     document.getElementById('shop-id-input'),
  shopNameInput:   document.getElementById('shop-name-input'),
  shopDescInput:   document.getElementById('shop-desc-input'),
  shopModalStatus: document.getElementById('shop-modal-status'),

  lotModalOvl:     document.getElementById('lot-modal-overlay'),
  lotModal:        document.getElementById('lot-modal'),
  lotModalTitle:   document.getElementById('lot-modal-title'),
  lotTitleInput:   document.getElementById('lot-title-input'),
  lotFunpayInput:  document.getElementById('lot-funpay-input'),
  lotModalStatus:  document.getElementById('lot-modal-status'),

  confirmOverlay:  document.getElementById('confirm-overlay'),
  confirmModal:    document.getElementById('confirm-modal'),
  confirmText:     document.getElementById('confirm-text'),
  confirmOk:       document.getElementById('confirm-ok'),
};

// ── Инициализация ────────────────────────────────────────────────
(async function init() {
  loadSettingsToForm();
  updateTokenStatus();
  bindEvents();

  if (GH.isConfigured()) {
    await loadAllData();
  } else {
    openModal('settings');
    setStatus(dom.settingsStatus, 'Настройте GitHub для начала работы', 'info');
  }
})();

// ── Загрузить settings в форму ───────────────────────────────────
function loadSettingsToForm() {
  const cfg = GH.getConfig();
  dom.tokenInput.value  = cfg.token;
  dom.repoInput.value   = cfg.repo;
  dom.branchInput.value = cfg.branch || 'main';
}

// ── Обновить статус токена в хедере ─────────────────────────────
function updateTokenStatus() {
  if (GH.isConfigured()) {
    const cfg = GH.getConfig();
    dom.tokenStatus.textContent = '✓ ' + cfg.repo;
    dom.tokenStatus.classList.add('connected');
  } else {
    dom.tokenStatus.textContent = 'Не настроено';
    dom.tokenStatus.classList.remove('connected');
  }
}

// ── Загрузить все данные ─────────────────────────────────────────
async function loadAllData() {
  dom.shopList.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const { data } = await GH.readJSON('data/shops.json');
    state.shops = (data && data.shops) ? data.shops : [];
    renderShopList();
  } catch (e) {
    dom.shopList.innerHTML = '<p style="font-size:12px;color:var(--danger);padding:8px">' + esc(e.message) + '</p>';
  }
}

// ── Рендер списка витрин (sidebar) ──────────────────────────────
function renderShopList() {
  dom.shopList.innerHTML = '';
  if (state.shops.length === 0) {
    dom.shopList.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:4px 12px">Нет витрин</p>';
    return;
  }
  state.shops.forEach(shop => {
    const item = document.createElement('div');
    item.className = 'shop-list-item' + (shop.id === state.activeShop ? ' active' : '');
    item.dataset.id = shop.id;
    item.innerHTML = `
      <span class="shop-list-item-icon">🏪</span>
      <span class="shop-list-item-name">${esc(shop.name)}</span>
    `;
    item.addEventListener('click', () => selectShop(shop.id));
    dom.shopList.appendChild(item);
  });
}

// ── Выбрать витрину ──────────────────────────────────────────────
async function selectShop(shopId) {
  state.activeShop = shopId;
  renderShopList();
  dom.adminMain.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const { data } = await GH.readJSON('data/' + shopId + '.json');
    state.activeLots = (data && data.lots) ? data.lots : [];
    renderShopPanel(data);
  } catch (e) {
    dom.adminMain.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h2>' + esc(e.message) + '</h2></div>';
  }
}

// ── Рендер панели витрины ────────────────────────────────────────
function renderShopPanel(shopData) {
  const shop = state.shops.find(s => s.id === state.activeShop) || {};

  dom.adminMain.innerHTML = `
    <div class="shop-panel">
      <div class="shop-panel-header">
        <div class="shop-panel-title">🏪 ${esc(shop.name || state.activeShop)}</div>
        <div class="shop-panel-actions">
          <a href="../shop/?id=${encodeURIComponent(state.activeShop)}" target="_blank" class="btn btn-ghost">↗ Открыть витрину</a>
          <button class="btn btn-ghost" id="edit-shop-btn">✏ Изменить</button>
          <button class="btn btn-ghost" style="color:var(--danger)" id="delete-shop-btn">🗑 Удалить витрину</button>
          <button class="btn btn-primary" id="add-lot-btn">+ Добавить лот</button>
        </div>
      </div>
      <div class="admin-lots-list" id="admin-lots-list">
        ${state.activeLots.length === 0
          ? '<div class="empty-state"><div class="empty-icon">📦</div><h2>Нет лотов</h2><p>Нажмите «+ Добавить лот»</p></div>'
          : ''
        }
      </div>
    </div>
  `;

  if (state.activeLots.length > 0) renderLots();

  // Привязка кнопок
  document.getElementById('add-lot-btn').addEventListener('click', () => openLotModal(null));
  document.getElementById('edit-shop-btn').addEventListener('click', () => openShopModal(state.activeShop));
  document.getElementById('delete-shop-btn').addEventListener('click', () => confirmDeleteShop(state.activeShop));
}

// ── Рендер лотов в панели ────────────────────────────────────────
function renderLots() {
  const list = document.getElementById('admin-lots-list');
  if (!list) return;
  list.innerHTML = '';

  state.activeLots.forEach((lot) => {
    const firstImg  = lot.images && lot.images[0];
    const thumbHtml = firstImg
      ? `<img class="admin-lot-thumb" src="../${firstImg}" alt="" loading="lazy">`
      : `<div class="admin-lot-thumb-placeholder">🎯</div>`;

    const card = document.createElement('div');
    card.className = 'admin-lot-card';
    card.dataset.id = lot.id;
    card.innerHTML = `
      ${thumbHtml}
      <div class="admin-lot-info">
        <div class="admin-lot-title">${esc(lot.title)}</div>
        <div class="admin-lot-meta">
          <span>📸 ${(lot.images || []).length} фото</span>
          ${lot.funpay ? `<a href="${lot.funpay}" target="_blank" style="color:var(--accent)">FunPay ↗</a>` : ''}
        </div>
      </div>
      <div class="admin-lot-actions">
        <button class="btn btn-ghost" data-action="images" data-lot="${lot.id}" title="Управление фото">🖼</button>
        <button class="btn btn-ghost" data-action="edit"   data-lot="${lot.id}" title="Редактировать">✏</button>
        <button class="btn btn-ghost" style="color:var(--danger)" data-action="delete" data-lot="${lot.id}" title="Удалить">🗑</button>
      </div>
    `;
    list.appendChild(card);
  });

  // Делегированные события
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
//  МОДАЛКИ
// ════════════════════════════════════════════════════════════════

function openModal(name) {
  dom[name + 'Overlay'].classList.add('open');
  dom[name + 'Modal'].style.display = 'block';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => dom[name + 'Modal'].classList.add('open'));
  });
}

function closeModal(name) {
  dom[name + 'Modal'].classList.remove('open');
  dom[name + 'Overlay'].classList.remove('open');
  setTimeout(() => dom[name + 'Modal'].style.display = '', 220);
}

// ── Settings modal ────────────────────────────────────────────────
document.getElementById('settings-btn').addEventListener('click', () => {
  loadSettingsToForm();
  openModal('settings');
});
document.getElementById('settings-close').addEventListener('click', () => closeModal('settings'));
dom.settingsOverlay.addEventListener('click', () => closeModal('settings'));

// Eye toggle
let tokenVisible = false;
dom.tokenEye.addEventListener('click', () => {
  tokenVisible = !tokenVisible;
  dom.tokenInput.type = tokenVisible ? 'text' : 'password';
  dom.tokenEye.textContent = tokenVisible ? '🙈' : '👁';
});

// Сохранить настройки
document.getElementById('settings-save').addEventListener('click', async () => {
  const token  = dom.tokenInput.value.trim();
  const repo   = dom.repoInput.value.trim();
  const branch = dom.branchInput.value.trim() || 'main';

  if (!token) { setStatus(dom.settingsStatus, 'Введите токен', 'err'); return; }
  if (!repo)  { setStatus(dom.settingsStatus, 'Введите репозиторий', 'err'); return; }

  GH.saveConfig(token, repo, branch);
  setStatus(dom.settingsStatus, 'Проверяю подключение…', 'info');

  try {
    await GH.ping();
    setStatus(dom.settingsStatus, '✓ Подключено!', 'ok');
    updateTokenStatus();
    setTimeout(() => {
      closeModal('settings');
      loadAllData();
    }, 800);
  } catch (e) {
    setStatus(dom.settingsStatus, 'Ошибка: ' + e.message, 'err');
  }
});

// ── Shop modal ────────────────────────────────────────────────────
document.getElementById('add-shop-btn').addEventListener('click', () => openShopModal(null));
document.getElementById('shop-modal-close').addEventListener('click', () => closeModal('shopModal'));
document.getElementById('shop-modal-cancel').addEventListener('click', () => closeModal('shopModal'));
dom.shopModalOvl.addEventListener('click', () => closeModal('shopModal'));

function openShopModal(editId) {
  const shop = editId ? state.shops.find(s => s.id === editId) : null;
  dom.shopModalTitle.textContent  = shop ? 'Редактировать витрину' : 'Новая витрина';
  dom.shopIdInput.value           = shop ? shop.id          : '';
  dom.shopIdInput.disabled        = !!shop; // нельзя менять id
  dom.shopNameInput.value         = shop ? shop.name        : '';
  dom.shopDescInput.value         = shop ? (shop.description || '') : '';
  dom.shopModalStatus.className   = 'status-msg';
  openModal('shopModal');
}

document.getElementById('shop-modal-save').addEventListener('click', async () => {
  const id   = dom.shopIdInput.value.trim();
  const name = dom.shopNameInput.value.trim();
  const desc = dom.shopDescInput.value.trim();

  if (!id)   { setStatus(dom.shopModalStatus, 'Введите ID', 'err'); return; }
  if (!name) { setStatus(dom.shopModalStatus, 'Введите название', 'err'); return; }
  if (!/^[a-z0-9_-]+$/.test(id)) { setStatus(dom.shopModalStatus, 'ID: только a-z, 0-9, _, -', 'err'); return; }

  setStatus(dom.shopModalStatus, 'Сохраняю…', 'info');

  try {
    const existing = state.shops.find(s => s.id === id);

    if (!existing) {
      // Создаём новую витрину
      state.shops.push({ id, name, description: desc });
      // Создаём файл данных витрины
      await GH.writeJSON('data/' + id + '.json', {
        id, name, description: desc, seller: id, lots: []
      }, 'Create shop ' + id);
    } else {
      // Обновляем существующую
      existing.name        = name;
      existing.description = desc;
    }

    // Обновляем shops.json
    await GH.writeJSON('data/shops.json', { shops: state.shops }, 'Update shops list');
    setStatus(dom.shopModalStatus, '✓ Сохранено', 'ok');

    setTimeout(() => {
      closeModal('shopModal');
      renderShopList();
      if (state.activeShop) selectShop(state.activeShop);
    }, 600);

  } catch (e) {
    setStatus(dom.shopModalStatus, 'Ошибка: ' + e.message, 'err');
  }
});

// ── Lot modal ─────────────────────────────────────────────────────
document.getElementById('lot-modal-close').addEventListener('click',  () => closeModal('lotModal'));
document.getElementById('lot-modal-cancel').addEventListener('click', () => closeModal('lotModal'));
dom.lotModalOvl.addEventListener('click', () => closeModal('lotModal'));

function openLotModal(editLotId) {
  const lot = editLotId ? state.activeLots.find(l => l.id === editLotId) : null;
  state.editingLot = editLotId;

  dom.lotModalTitle.textContent = lot ? 'Редактировать лот' : 'Новый лот';
  dom.lotTitleInput.value       = lot ? lot.title  : '';
  dom.lotFunpayInput.value      = lot ? (lot.funpay || '') : '';
  dom.lotModalStatus.className  = 'status-msg';
  openModal('lotModal');
}

document.getElementById('lot-modal-save').addEventListener('click', async () => {
  const title  = dom.lotTitleInput.value.trim();
  const funpay = dom.lotFunpayInput.value.trim();

  if (!title) { setStatus(dom.lotModalStatus, 'Введите название', 'err'); return; }
  setStatus(dom.lotModalStatus, 'Сохраняю…', 'info');

  try {
    if (state.editingLot) {
      // Редактирование
      const lot = state.activeLots.find(l => l.id === state.editingLot);
      if (lot) { lot.title = title; lot.funpay = funpay; }
    } else {
      // Создание нового лота
      const id = 'lot_' + Date.now();
      state.activeLots.push({ id, title, funpay, images: [] });
    }

    await saveLotsJSON();
    setStatus(dom.lotModalStatus, '✓ Сохранено', 'ok');

    setTimeout(() => {
      closeModal('lotModal');
      renderLots();
    }, 500);

  } catch (e) {
    setStatus(dom.lotModalStatus, 'Ошибка: ' + e.message, 'err');
  }
});

// ── Confirm modal ─────────────────────────────────────────────────
dom.confirmOverlay.addEventListener('click', () => closeModal('confirm'));
document.getElementById('confirm-cancel').addEventListener('click', () => closeModal('confirm'));

function openConfirm(text, onOk) {
  dom.confirmText.textContent = text;
  dom.confirmOk.onclick = async () => {
    dom.confirmOk.disabled = true;
    await onOk();
    dom.confirmOk.disabled = false;
    closeModal('confirm');
  };
  openModal('confirm');
}

function confirmDeleteShop(shopId) {
  const shop = state.shops.find(s => s.id === shopId);
  openConfirm(
    'Удалить витрину «' + (shop ? shop.name : shopId) + '»? Все лоты и изображения будут удалены.',
    () => deleteShop(shopId)
  );
}

function confirmDeleteLot(lotId) {
  const lot = state.activeLots.find(l => l.id === lotId);
  openConfirm(
    'Удалить лот «' + (lot ? lot.title : lotId) + '»? Изображения будут удалены.',
    () => deleteLot(lotId)
  );
}

// ════════════════════════════════════════════════════════════════
//  УДАЛЕНИЕ
// ════════════════════════════════════════════════════════════════

async function deleteShop(shopId) {
  try {
    // Удаляем из списка
    state.shops = state.shops.filter(s => s.id !== shopId);
    await GH.writeJSON('data/shops.json', { shops: state.shops }, 'Delete shop ' + shopId);

    // Пытаемся удалить JSON витрины и изображения (не критично если не получится)
    try { await GH.deleteFile('data/' + shopId + '.json', 'Delete shop data'); } catch (_) {}

    if (state.activeShop === shopId) {
      state.activeShop = null;
      state.activeLots = [];
      dom.adminMain.innerHTML = dom.emptyState ? dom.emptyState.outerHTML : '';
    }

    renderShopList();
  } catch (e) {
    alert('Ошибка удаления: ' + e.message);
  }
}

async function deleteLot(lotId) {
  const lot = state.activeLots.find(l => l.id === lotId);
  if (!lot) return;

  try {
    // Удаляем изображения
    if (lot.images && lot.images.length > 0) {
      await GH.deleteFiles(lot.images, 'Delete lot ' + lotId + ' images');
    }

    state.activeLots = state.activeLots.filter(l => l.id !== lotId);
    await saveLotsJSON();
    renderLots();
  } catch (e) {
    alert('Ошибка удаления: ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════════
//  IMAGE MANAGER
// ════════════════════════════════════════════════════════════════

let imLotId = null;       // id текущего лота в менеджере
let imImages = [];        // текущий массив путей

function openImageManager(lotId) {
  imLotId = lotId;
  const lot = state.activeLots.find(l => l.id === lotId);
  imImages  = lot ? [...(lot.images || [])] : [];

  // Создаём панель если не существует
  let panel = document.getElementById('image-manager');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'image-manager';
    panel.className = 'image-manager';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="image-manager-header">
      <button class="btn btn-ghost" id="im-back">← Назад</button>
      <div class="image-manager-title">📸 Изображения: ${esc(lot ? lot.title : lotId)}</div>
      <button class="btn btn-ghost" id="im-refresh-thumb" title="Перегенерировать превью из первого фото">🖼 Обновить превью</button>
      <button class="btn btn-primary" id="im-upload-trigger">+ Добавить фото</button>
    </div>
    <div class="image-manager-body">
      <div class="dropzone" id="im-dropzone">
        <input type="file" id="im-file-input" accept="image/*" multiple>
        <div class="dropzone-icon">📤</div>
        <div class="dropzone-text">Перетащите изображения сюда</div>
        <div class="dropzone-hint">или нажмите «+ Добавить фото» • PNG, JPG, GIF → WebP</div>
      </div>
      <div class="upload-queue" id="im-upload-queue"></div>
      <div class="managed-images" id="im-managed-images"></div>
    </div>
  `;

  renderManagedImages();
  bindImageManagerEvents(panel);

  requestAnimationFrame(() => panel.classList.add('open'));
}

function closeImageManager() {
  const panel = document.getElementById('image-manager');
  if (panel) panel.classList.remove('open');
}

function renderManagedImages() {
  const container = document.getElementById('im-managed-images');
  if (!container) return;
  container.innerHTML = '';

  if (imImages.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1">Нет изображений</p>';
    return;
  }

  imImages.forEach((src, idx) => {
    const card = document.createElement('div');
    card.className = 'managed-img-card';
    card.dataset.idx = idx;
    card.draggable = true;
    card.innerHTML = `
      <div class="drag-handle" title="Перетащить для сортировки">⠿</div>
      <img src="../${src}" alt="" loading="lazy">
      <div class="managed-img-footer">
        <span class="managed-img-num">${idx + 1}</span>
        <div class="managed-img-actions">
          <button class="img-action-btn" data-action="up"     data-idx="${idx}" title="Вверх">↑</button>
          <button class="img-action-btn" data-action="down"   data-idx="${idx}" title="Вниз">↓</button>
          <button class="img-action-btn danger" data-action="del" data-idx="${idx}" title="Удалить">🗑</button>
        </div>
      </div>
    `;
    container.appendChild(card);
    bindDragSort(card);
  });

  // Делегированные события кнопок
  container.onclick = async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx    = parseInt(btn.dataset.idx);
    const action = btn.dataset.action;

    if (action === 'up'   && idx > 0)               { swap(idx, idx - 1); await saveOrder(); }
    if (action === 'down' && idx < imImages.length-1){ swap(idx, idx + 1); await saveOrder(); }
    if (action === 'del') await deleteImage(idx);
  };
}

// ── Drag & drop сортировка ────────────────────────────────────────
let dragSrcIdx = null;

function bindDragSort(card) {
  card.addEventListener('dragstart', (e) => {
    dragSrcIdx = parseInt(card.dataset.idx);
    card.classList.add('dragging-card');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging-card');
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.managed-img-card').forEach(c => c.classList.remove('drag-over-card'));
    card.classList.add('drag-over-card');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over-card');
  });

  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    card.classList.remove('drag-over-card');
    const destIdx = parseInt(card.dataset.idx);
    if (dragSrcIdx !== null && dragSrcIdx !== destIdx) {
      // Вставляем на новое место
      const item = imImages.splice(dragSrcIdx, 1)[0];
      imImages.splice(destIdx, 0, item);
      renderManagedImages();
      await saveOrder();
    }
    dragSrcIdx = null;
  });
}

function swap(a, b) {
  [imImages[a], imImages[b]] = [imImages[b], imImages[a]];
  renderManagedImages();
}

// ── Сохранить порядок ────────────────────────────────────────────
async function saveOrder() {
  const lot = state.activeLots.find(l => l.id === imLotId);
  if (lot) lot.images = [...imImages];
  try { await saveLotsJSON(); } catch (e) { console.error(e); }
}

// ── Удалить изображение ──────────────────────────────────────────
async function deleteImage(idx) {
  if (!confirm('Удалить изображение ' + (idx + 1) + '?')) return;
  const path = imImages[idx];
  try {
    await GH.deleteFile(path, 'Delete image ' + path);
  } catch (e) {
    if (e.status !== 404) {
      alert('Не удалось удалить файл: ' + e.message);
      return;
    }
  }
  imImages.splice(idx, 1);
  await saveOrder();
  renderManagedImages();
  renderLots();
}

// ── Upload ────────────────────────────────────────────────────────
function bindImageManagerEvents(panel) {
  document.getElementById('im-back').addEventListener('click', closeImageManager);
  document.getElementById('im-refresh-thumb').addEventListener('click', regenerateThumb);
  document.getElementById('im-upload-trigger').addEventListener('click', () => {
    document.getElementById('im-file-input').click();
  });

  const fileInput = document.getElementById('im-file-input');
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) uploadFiles(fileInput.files);
    fileInput.value = '';
  });

  const dropzone = document.getElementById('im-dropzone');
  dropzone.addEventListener('click', () => document.getElementById('im-file-input').click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault(); dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  });
}

// ── Перегенерировать миниатюру из первого изображения ────────────
async function regenerateThumb() {
  if (imImages.length === 0) { alert('Нет изображений для генерации превью.'); return; }

  const btn = document.getElementById('im-refresh-thumb');
  if (btn) { btn.textContent = '⏳ Генерация…'; btn.disabled = true; }

  try {
    // Скачиваем первое изображение из репозитория
    const firstPath = imImages[0];
    const { content } = await GH.getFile(firstPath);

    // content — бинарные данные, конвертируем через Blob
    const byteChars  = content;
    const byteArrays = [];
    for (let i = 0; i < byteChars.length; i += 512) {
      const slice  = byteChars.slice(i, i + 512);
      const bytes  = new Uint8Array(slice.length);
      for (let j = 0; j < slice.length; j++) bytes[j] = slice.charCodeAt(j);
      byteArrays.push(bytes);
    }
    const blob = new Blob(byteArrays, { type: 'image/webp' });
    const file = new File([blob], 'source.webp', { type: 'image/webp' });

    const { base64, ext } = await ImageConvert.toWebP(file, 0.75, 480);
    const baseDir   = 'images/' + state.activeShop + '/' + imLotId;
    const thumbPath = baseDir + '/thumb.' + ext;

    await GH.putBinaryFile(thumbPath, base64, 'Regenerate thumb for ' + imLotId);

    const lot = state.activeLots.find(l => l.id === imLotId);
    if (lot) lot.thumb = thumbPath;
    await saveLotsJSON();

    if (btn) { btn.textContent = '✓ Превью обновлено'; }
    setTimeout(() => { if (btn) { btn.textContent = '🖼 Обновить превью'; btn.disabled = false; } }, 2000);

  } catch (e) {
    if (btn) { btn.textContent = '⚠ Ошибка'; btn.disabled = false; }
    alert('Не удалось обновить превью: ' + e.message);
  }
}

async function uploadFiles(files) {
  const queue    = document.getElementById('im-upload-queue');
  const fileList = Array.from(files);

  // Рендерим очередь загрузки
  queue.innerHTML = '';
  fileList.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'upload-item';
    div.id = 'upload-item-' + i;
    div.innerHTML = `
      <span class="upload-item-name">${esc(f.name)}</span>
      <span class="upload-item-status busy" id="upload-status-${i}">Подготовка…</span>
    `;
    queue.appendChild(div);
  });

  // Считаем startIdx ОДИН РАЗ до цикла — иначе при пакетной загрузке
  // каждый файл видит уже обновлённый imImages.length от предыдущего
  const startIdx = imImages.length;

  for (let i = 0; i < fileList.length; i++) {
    const file     = fileList[i];
    const statusEl = document.getElementById('upload-status-' + i);

    try {
      statusEl.textContent = 'Конвертация…';

      // Конвертируем в WebP
      const { base64, ext } = await ImageConvert.toWebP(file);

      // Нумерация: startIdx + i гарантирует уникальность в пакете
      const fileNum  = startIdx + i;
      const fileName = ImageConvert.numberedName(fileNum, ext);
      const baseDir  = 'images/' + state.activeShop + '/' + imLotId;
      const repoPath = baseDir + '/' + fileName;

      statusEl.textContent = 'Загрузка…';

      // Загружаем основной файл
      await GH.putBinaryFile(repoPath, base64, 'Upload ' + fileName);

      // Генерируем миниатюру для первого изображения лота (thumb.webp)
      // Это позволяет на странице витрины грузить маленький файл,
      // а не полный скриншот
      if (fileNum === 0) {
        statusEl.textContent = 'Генерация превью…';
        try {
          const { base64: thumbB64, ext: thumbExt } = await ImageConvert.toWebP(file, 0.75, 480);
          const thumbPath = baseDir + '/thumb.' + thumbExt;
          await GH.putBinaryFile(thumbPath, thumbB64, 'Generate thumb for ' + imLotId);
        } catch (_) {
          // Неудача с миниатюрой — не критично, продолжаем
        }
      }

      // Добавляем путь в локальный массив
      imImages.push(repoPath);
      const lot = state.activeLots.find(l => l.id === imLotId);
      if (lot) {
        lot.images = [...imImages];
        // Запоминаем путь к миниатюре если это первое фото
        if (fileNum === 0) {
          lot.thumb = baseDir + '/thumb.' + ext;
        }
      }

      await saveLotsJSON();

      statusEl.textContent = '✓ Готово';
      statusEl.className = 'upload-item-status ok';

    } catch (e) {
      // Детальное сообщение уже сформировано в github-api.js
      statusEl.textContent = e.message;
      statusEl.className = 'upload-item-status err';

      // Rate limit — прерываем всю очередь
      if (e.status === 403 && e.message.includes('лимит')) {
        const remaining = fileList.slice(i + 1);
        remaining.forEach((_, j) => {
          const el = document.getElementById('upload-status-' + (i + 1 + j));
          if (el) { el.textContent = 'Пропущено (rate limit)'; el.className = 'upload-item-status err'; }
        });
        break;
      }
    }
  }

  renderManagedImages();
  renderLots();

  // Скрываем очередь через 4 секунды
  setTimeout(() => { if (queue) queue.innerHTML = ''; }, 4000);
}

// ════════════════════════════════════════════════════════════════
//  СОХРАНЕНИЕ ЛОТОВ
// ════════════════════════════════════════════════════════════════

async function saveLotsJSON() {
  const shop = state.shops.find(s => s.id === state.activeShop) || {};
  const data = {
    id:          state.activeShop,
    name:        shop.name        || state.activeShop,
    description: shop.description || '',
    seller:      state.activeShop,
    lots:        state.activeLots,
  };
  await GH.writeJSON('data/' + state.activeShop + '.json', data, 'Update ' + state.activeShop + ' lots');
}

// ── Bind events ────────────────────────────────────────────────────
function bindEvents() {
  // ESC закрывает все модалки
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['settings', 'shopModal', 'lotModal', 'confirm'].forEach(n => {
      if (dom[n + 'Modal'] && dom[n + 'Modal'].classList.contains('open')) closeModal(n);
    });
    const imPanel = document.getElementById('image-manager');
    if (imPanel && imPanel.classList.contains('open')) closeImageManager();
  });
}

// ── Утилиты ────────────────────────────────────────────────────────
function setStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg visible ' + (type || '');
  if (type === 'ok') setTimeout(() => el.className = 'status-msg', 3000);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
