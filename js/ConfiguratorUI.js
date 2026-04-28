/* ================================================================
   TANKNEXUS — ConfiguratorUI.js
   UI-компонент конфигуратора — полностью независимый дубликат
   UI адаптивного фильтра.
   НЕ зависит от FilterUI, AdaptiveFilter, FilterEngine.
   Работает только через AdaptiveConfigurator.
   ================================================================ */

'use strict';

const ConfiguratorUI = (() => {

  // ── Элементы DOM ──────────────────────────────────────────────
  let _container    = null;
  let _capsulesEl   = null;
  let _panelEl      = null;
  let _toggleBtn    = null;
  let _isPanelOpen  = false;
  let _currentOptions = {};

  // Колбэк, который вызывается когда конфигуратор применён
  // (галерея перерисовывает лоты)
  let _onResultCallback = null;

  // ── Флаги взаимодействия с фильтром и сценариями ──────────────
  // Эти функции инжектируются из main.js при инициализации
  let _collapseFilterFn   = null;  // () => void — свернуть/выключить основной фильтр
  let _collapseScenarioFn = null;  // () => void — деактивировать сценарий

  // ── Иконки нации (флаги PNG) ──────────────────────────────────
  const NATION_FLAG_FILES = {
    'СССР':          'ussr.png',
    'США':           'usa.png',
    'Германия':      'germany.png',
    'Франция':       'france.png',
    'Британия':      'uk.png',
    'Япония':        'japan.png',
    'Китай':         'china.png',
    'Швеция':        'sweden.png',
    'Польша':        'poland.png',
    'Италия':        'italy.png',
    'Чехословакия':  'czech.png',
    'Сборная нация': 'intunion.png',
  };

  function _flagImg(nation) {
    const file = NATION_FLAG_FILES[nation];
    if (!file) return '';
    const base = (typeof assetUrl === 'function') ? assetUrl('icons/flags/' + file) : ('icons/flags/' + file);
    return `<img src="${base}" alt="${nation}" class="af-nation-flag" onerror="this.style.display='none'">`;
  }

  const TYPE_ICONS = {
    'ТТ': '🛡️', 'СТ': '⚡', 'ЛТ': '💨', 'ПТ': '🎯', 'САУ': '💥',
  };

  // ── Инициализация UI ──────────────────────────────────────────
  /**
   * @param {string} containerId — ID контейнера в DOM
   * @param {object} opts
   *   opts.onResult(lots)      — коллбэк, когда конфигуратор меняет выборку
   *   opts.collapseFilter()    — вызвать чтобы свернуть/выключить основной фильтр
   *   opts.collapseScenario()  — вызвать чтобы деактивировать текущий сценарий
   */
  function init(containerId, opts = {}) {
    _container          = document.getElementById(containerId);
    _onResultCallback   = opts.onResult       || null;
    _collapseFilterFn   = opts.collapseFilter  || null;
    _collapseScenarioFn = opts.collapseScenario || null;
    if (!_container) return;
    _render();
  }

  // ── Публичный: вызывается снаружи когда конфигуратор нужно свернуть
  function collapse() {
    if (_isPanelOpen) {
      _isPanelOpen = false;
      if (_panelEl)   _panelEl.style.display = 'none';
      if (_toggleBtn) {
        _toggleBtn.classList.remove('cfg-toggle-btn--active');
      }
    }
  }

  // ── Рендер разметки ──────────────────────────────────────────
  function _render() {
    _container.innerHTML = `
      <div class="cfg-root">

        <!-- Заголовок-переключатель конфигуратора -->
        <div class="cfg-headerrow">
          <button class="cfg-toggle-btn" id="cfg-toggle-btn" type="button" aria-label="Конфигуратор">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span class="cfg-toggle-label">Конфигуратор</span>
            <span class="cfg-active-count" id="cfg-active-count" style="display:none">0</span>
          </button>
        </div>

        <!-- Панель конфигуратора -->
        <div class="cfg-panel" id="cfg-panel" style="display:none">
          <div class="cfg-panel-inner">

            <!-- Техника -->
            <div class="cfg-section">
              <div class="cfg-section-row">
                <span class="cfg-section-label">Уровень</span>
                <div class="cfg-chips" id="cfg-tier-chips"></div>
              </div>
              <div class="cfg-section-row">
                <span class="cfg-section-label">Класс</span>
                <div class="cfg-chips" id="cfg-type-chips"></div>
              </div>
              <div class="cfg-section-row">
                <span class="cfg-section-label">Нация</span>
                <div class="cfg-chips" id="cfg-nation-chips"></div>
              </div>
              <div class="cfg-section-row">
                <span class="cfg-section-label">Техника</span>
                <div class="cfg-tank-selector" id="cfg-tank-selector">
                  <div class="cfg-tank-search-wrap">
                    <input type="text" class="cfg-tank-search" id="cfg-tank-search" placeholder="Найти танк…" autocomplete="off">
                  </div>
                  <div class="cfg-tank-list" id="cfg-tank-list"></div>
                </div>
              </div>
            </div>

            <!-- Дополнительно -->
            <div class="cfg-section">
              <div class="cfg-section-title">Дополнительно</div>
              <div class="cfg-section-row">
                <span class="cfg-section-label">Цена (₽)</span>
                <div class="cfg-range-row" id="cfg-price-range"></div>
              </div>
              <div class="cfg-section-row">
                <span class="cfg-section-label">Боны</span>
                <div class="cfg-range-row" id="cfg-bonds-range"></div>
              </div>
              <div class="cfg-section-row">
                <span class="cfg-section-label">Золото</span>
                <div class="cfg-range-row" id="cfg-gold-range"></div>
              </div>
              <div class="cfg-section-row">
                <span class="cfg-section-label">Серебро (млн)</span>
                <div class="cfg-range-row" id="cfg-silver-range"></div>
              </div>
              <div class="cfg-section-row">
                <label class="cfg-checkbox-label">
                  <input type="checkbox" id="cfg-no-battles" class="cfg-checkbox">
                  <span>Без боёв</span>
                </label>
              </div>
            </div>

          </div>

          <!-- Капсулы + Сброс внутри панели -->
          <div class="cfg-panel-footer">
            <div class="cfg-capsules" id="cfg-capsules"></div>
            <button class="cfg-reset-btn" id="cfg-reset-btn" type="button" style="display:none" aria-label="Сбросить конфигуратор">
              Сбросить
            </button>
          </div>
        </div>

      </div>
    `;

    _capsulesEl = document.getElementById('cfg-capsules');
    _panelEl    = document.getElementById('cfg-panel');
    _toggleBtn  = document.getElementById('cfg-toggle-btn');

    // Тоггл панели
    _toggleBtn.addEventListener('click', () => {
      _isPanelOpen = !_isPanelOpen;
      _panelEl.style.display = _isPanelOpen ? '' : 'none';
      _toggleBtn.classList.toggle('cfg-toggle-btn--active', _isPanelOpen);

      // Если открываем конфигуратор — скрываем фильтр и деактивируем сценарий
      if (_isPanelOpen) {
        if (typeof _collapseFilterFn === 'function')   _collapseFilterFn();
        if (typeof _collapseScenarioFn === 'function') _collapseScenarioFn();
      }
    });

    // Кнопка сброса
    document.getElementById('cfg-reset-btn').addEventListener('click', () => {
      AdaptiveConfigurator.reset();
    });

    // Чекбокс без боёв
    document.getElementById('cfg-no-battles').addEventListener('change', (e) => {
      AdaptiveConfigurator.setNoBattles(e.target.checked);
      _notifyActivity();
    });

    // Поиск по танкам
    document.getElementById('cfg-tank-search').addEventListener('input', (e) => {
      _renderTankList(e.target.value.toLowerCase());
    });

    // Первичный рендер опций
    _renderOptions(AdaptiveConfigurator.getAvailableOptions());
  }

  // ── Вызывается после каждого изменения конфигуратора ─────────
  function _notifyActivity() {
    // Если конфигуратор активен — коллапсить фильтр
    if (AdaptiveConfigurator.hasActiveFilters()) {
      if (typeof _collapseFilterFn === 'function')   _collapseFilterFn();
      if (typeof _collapseScenarioFn === 'function') _collapseScenarioFn();
    }
  }

  // ── Обработчик изменений конфигуратора ────────────────────────
  function onConfiguratorChange(filteredLots) {
    _renderCapsules();
    _renderOptions(AdaptiveConfigurator.getAvailableOptions());
    if (_onResultCallback) _onResultCallback(filteredLots);
  }

  // ── Рендер капсул ─────────────────────────────────────────────
  function _renderCapsules() {
    if (!_capsulesEl) return;
    const capsules = AdaptiveConfigurator.getActiveCapsules();
    const inactiveTanks = new Set(AdaptiveConfigurator.getInactiveTanks());
    _capsulesEl.innerHTML = '';

    capsules.forEach(cap => {
      const el = document.createElement('span');
      const isInactiveTank = cap.type === 'tank' && inactiveTanks.has(cap.value);
      el.className = 'af-capsule' + (isInactiveTank ? ' af-capsule--inactive' : '');
      el.innerHTML = `<span class="af-capsule-label">${_esc(cap.label)}</span><button class="af-capsule-remove" aria-label="Удалить">✕</button>`;
      el.querySelector('.af-capsule-remove').addEventListener('click', () => {
        AdaptiveConfigurator.removeParam(cap.type, cap.value);
      });
      _capsulesEl.appendChild(el);
    });

    // Кнопка сброса
    const resetBtn = document.getElementById('cfg-reset-btn');
    if (resetBtn) resetBtn.style.display = AdaptiveConfigurator.hasActiveFilters() ? '' : 'none';

    // Счётчик активных параметров на кнопке
    const countEl = document.getElementById('cfg-active-count');
    if (countEl) {
      countEl.style.display = capsules.length > 0 ? '' : 'none';
      countEl.textContent   = capsules.length;
    }
  }

  // ── Рендер опций ─────────────────────────────────────────────
  function _renderOptions(options) {
    _currentOptions = options;
    const state = AdaptiveConfigurator.getState();

    // Уровни
    _renderChips('cfg-tier-chips', options.tiers, state.tier, (tier) => {
      AdaptiveConfigurator.toggleTier(tier);
      _notifyActivity();
    }, (k) => `${k} ур.`, ['5','6','7','8','9','10']);

    // Нации
    _renderNationChips('cfg-nation-chips', options.nations, state.nation);

    // Типы
    _renderChips('cfg-type-chips', options.types, state.type, (tp) => {
      AdaptiveConfigurator.toggleType(tp);
      _notifyActivity();
    }, (k) => `${TYPE_ICONS[k] || ''} ${k}`, ['ТТ','СТ','ЛТ','ПТ','САУ']);

    // Список танков
    const tankSearch = document.getElementById('cfg-tank-search');
    _renderTankList(tankSearch ? tankSearch.value.toLowerCase() : '');

    // Чекбокс без боёв
    const noBattlesCheck = document.getElementById('cfg-no-battles');
    if (noBattlesCheck) noBattlesCheck.checked = state.noBattles;

    // Диапазоны
    _renderRange('cfg-price-range', 'price',  options.price,  state.priceMin,  state.priceMax);
    _renderRange('cfg-bonds-range', 'bonds',  options.bonds,  state.bondsMin,  state.bondsMax);
    _renderRange('cfg-gold-range',  'gold',   options.gold,   state.goldMin,   state.goldMax);
    _renderRange('cfg-silver-range','silver', options.silver, state.silverMin, state.silverMax);
  }

  function _renderChips(containerId, optionsMap, selected, onClick, labelFn, order) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    let keys = order
      ? order.filter(k => optionsMap[k] !== undefined)
      : Object.keys(optionsMap).sort();

    keys.forEach(k => {
      const count = optionsMap[k] || 0;
      const isActive = selected.includes(k);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'af-chip' + (isActive ? ' af-chip--active' : '') + (count === 0 ? ' af-chip--disabled' : '');
      chip.innerHTML = `${_esc(labelFn(k))}`;
      if (count > 0) {
        chip.addEventListener('click', () => { chip.blur(); onClick(k); });
      }
      el.appendChild(chip);
    });
  }

  function _renderNationChips(containerId, optionsMap, selected) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    const NATION_ORDER = ['СССР','США','Германия','Франция','Британия','Япония','Китай','Швеция','Польша','Италия','Чехословакия','Сборная нация'];
    const keys = NATION_ORDER.filter(k => optionsMap[k] !== undefined);

    keys.forEach(k => {
      const count = optionsMap[k] || 0;
      const isActive = selected.includes(k);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'af-chip af-chip--nation' + (isActive ? ' af-chip--active' : '') + (count === 0 ? ' af-chip--disabled' : '');
      const flagHtml = _flagImg(k);
      chip.innerHTML = `${flagHtml}<span class="af-nation-name">${_esc(k)}</span>`;
      if (count > 0) {
        chip.addEventListener('click', () => {
          chip.blur();
          AdaptiveConfigurator.toggleNation(k);
          _notifyActivity();
        });
      }
      el.appendChild(chip);
    });
  }

  function _renderTankList(filterQuery) {
    const el = document.getElementById('cfg-tank-list');
    if (!el) return;
    el.innerHTML = '';

    const available = AdaptiveConfigurator.getAvailableTanks();
    const state = AdaptiveConfigurator.getState();

    let entries = Object.entries(available);

    if (filterQuery) {
      entries = entries.filter(([name]) => name.toLowerCase().includes(filterQuery));
    }

    entries.sort(([a, ai], [b, bi]) => {
      const aS = state.tanks.includes(a) ? 1 : 0;
      const bS = state.tanks.includes(b) ? 1 : 0;
      if (bS !== aS) return bS - aS;
      return (bi.count || 0) - (ai.count || 0);
    });

    const shown = entries.slice(0, 50);

    shown.forEach(([name, info]) => {
      const isActive = state.tanks.includes(name);

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'af-tank-item' + (isActive ? ' af-tank-item--active' : '');

      const iconUrl = info.icon && typeof assetUrl === 'function'
        ? assetUrl('icons/small/' + info.icon)
        : null;
      const imgHtml = iconUrl
        ? `<img src="${_esc(iconUrl)}" alt="${_esc(name)}" class="af-tank-icon" onerror="this.style.display='none'">`
        : `<span class="af-tank-no-icon">🛡</span>`;

      const tierBadge = info.tier ? `<span class="af-tank-tier">${info.tier}</span>` : '';
      item.innerHTML = `
        ${imgHtml}
        <span class="af-tank-name">${_esc(name)}</span>
        ${tierBadge}
      `;
      item.addEventListener('click', () => {
        item.blur();
        AdaptiveConfigurator.toggleTank(name);
        _notifyActivity();
      });
      el.appendChild(item);
    });

    if (entries.length > 50) {
      const more = document.createElement('div');
      more.className = 'af-tank-more';
      more.textContent = `+${entries.length - 50} танков — уточните фильтры`;
      el.appendChild(more);
    }

    if (shown.length === 0) {
      el.innerHTML = '<div class="af-tank-empty">Нет доступных танков</div>';
    }
  }

  function _renderRange(containerId, resourceKey, range, currentMin, currentMax) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const hasData = range && (range.max > 0);
    if (!hasData) {
      el.innerHTML = '<span class="af-range-empty">нет данных</span>';
      return;
    }

    const minVal = currentMin !== null ? currentMin : '';
    const maxVal = currentMax !== null ? currentMax : '';

    el.innerHTML = `
      <input type="text" inputmode="numeric" pattern="[0-9]*" class="af-range-input" data-key="${resourceKey}" data-bound="min"
        placeholder="${Math.floor(range.min)}" value="${minVal}">
      <span class="af-range-dash">—</span>
      <input type="text" inputmode="numeric" pattern="[0-9]*" class="af-range-input" data-key="${resourceKey}" data-bound="max"
        placeholder="${Math.ceil(range.max)}" value="${maxVal}">
    `;

    el.querySelectorAll('.af-range-input').forEach(input => {
      const applyValue = () => {
        const key   = input.dataset.key;
        const bound = input.dataset.bound;
        let val = input.value === '' ? null : parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));

        if (val !== null && !isNaN(val)) {
          if (bound === 'min' && val < range.min) { val = range.min; input.value = val; }
          if (bound === 'min' && val > range.max) { val = range.max; input.value = val; }
          if (bound === 'max' && val < range.min) { val = range.min; input.value = val; }
          if (bound === 'max' && val > range.max) { val = range.max; input.value = val; }
        } else if (val !== null && isNaN(val)) {
          val = null;
          input.value = '';
        }

        const state = AdaptiveConfigurator.getState();
        if (key === 'price') {
          const min = bound === 'min' ? val : state.priceMin;
          const max = bound === 'max' ? val : state.priceMax;
          AdaptiveConfigurator.setPrice(min, max);
        } else {
          const minK = key + 'Min';
          const maxK = key + 'Max';
          const min = bound === 'min' ? val : state[minK];
          const max = bound === 'max' ? val : state[maxK];
          AdaptiveConfigurator.setResources(key, min, max);
        }
        _notifyActivity();
      };
      input.addEventListener('change', applyValue);
      input.addEventListener('blur',   applyValue);
    });
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ── Публичный API ─────────────────────────────────────────────
  return {
    init,
    collapse,
    onConfiguratorChange,
  };

})();
