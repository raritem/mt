/* ================================================================
   TANKNEXUS — ConfiguratorUI.js
   UI-компонент конфигуратора аккаунтов
   ПОЛНОСТЬЮ ИЗОЛИРОВАННАЯ КОПИЯ filterUI.js
   Не импортирует, не вызывает, не зависит от FilterUI/AdaptiveFilter
   Все DOM id/классы: af- → cf-
   ================================================================ */

'use strict';

const ConfiguratorUI = (() => {

  // ── Элементы DOM ──────────────────────────────────────────────
  let _cfContainer = null;
  let _cfCapsulesEl = null;
  let _cfPanelEl = null;
  let _cfToggleBtn = null;
  let _cfCollapsedEl = null;
  let _cfIsPanelOpen = false;
  let _cfCurrentOptions = {};

  // ── Состояние взаимодействия с фильтром и сценариями ─────────
  let _cfIsDisabled = false; // конфигуратор отключён (фильтр или сценарий активны)

  // Колбэки для координации с внешним миром (main.js)
  let _cfOnActivate = null;   // вызывается когда конфигуратор разворачивается
  let _cfOnDeactivate = null; // вызывается когда конфигуратор сворачивается

  // ── Иконки нации (флаги PNG) ──────────────────────────────────
  const CF_NATION_FLAG_FILES = {
    'СССР':         'ussr.png',
    'США':          'usa.png',
    'Германия':     'germany.png',
    'Франция':      'france.png',
    'Британия':     'uk.png',
    'Япония':       'japan.png',
    'Китай':        'china.png',
    'Швеция':       'sweden.png',
    'Польша':       'poland.png',
    'Италия':       'italy.png',
    'Чехословакия': 'czech.png',
    'Сборная нация':'intunion.png',
  };

  function _cfFlagImg(nation) {
    const file = CF_NATION_FLAG_FILES[nation];
    if (!file) return '';
    const base = (typeof assetUrl === 'function') ? assetUrl('icons/flags/' + file) : ('icons/flags/' + file);
    return `<img src="${base}" alt="${nation}" class="cf-nation-flag" onerror="this.style.display='none'">`;
  }

  const CF_TYPE_ICONS = {
    'ТТ': '🛡️', 'СТ': '⚡', 'ЛТ': '💨', 'ПТ': '🎯', 'САУ': '💥',
  };

  // ── Инициализация UI ──────────────────────────────────────────
  function init(containerId, { onActivate, onDeactivate } = {}) {
    _cfContainer = document.getElementById(containerId);
    if (!_cfContainer) return;
    _cfOnActivate = onActivate || null;
    _cfOnDeactivate = onDeactivate || null;
    _cfRender();
  }

  // Вызывается из main.js через ConfiguratorFilter.onChange
  function onFilterChange(filteredLots) {
    _cfOnFilterChange(filteredLots);
  }

  // Внешний вызов: принудительно свернуть конфигуратор (без сброса состояния)
  function collapse() {
    _cfIsPanelOpen = false;
    _cfIsDisabled = false;
    const expandedEl = document.getElementById('cf-expanded');
    if (expandedEl) expandedEl.style.display = 'none';
    if (_cfCollapsedEl) _cfCollapsedEl.style.display = '';
    _cfUpdateRootState();
  }

  // Внешний вызов: затемнить конфигуратор пока он развёрнут (адаптивный фильтр активен)
  function dim() {
    _cfIsDisabled = true;
    _cfUpdateRootState();
  }

  // Внешний вызов: разрешить конфигуратор снова
  function enable() {
    _cfIsDisabled = false;
    _cfUpdateRootState();
  }

  function _cfUpdateRootState() {
    if (!_cfContainer) return;
    const rootEl = _cfContainer.querySelector('.cf-root');
    if (!rootEl) return;
    if (_cfIsDisabled) {
      rootEl.classList.add('cf-root--disabled');
    } else {
      rootEl.classList.remove('cf-root--disabled');
    }
  }

  function _cfRender() {
    _cfContainer.innerHTML = `
      <div class="cf-root">
        <!-- Свёрнутое состояние: конструктор-приглашение -->
        <div class="cf-collapsed" id="cf-collapsed">
          <div class="cf-collapsed-inner">
            <div class="cf-collapsed-title">Подбери аккаунт по комбинации техники</div>
            <div class="cf-constructor-preview">
              <div class="cf-constructor-block">
                <span class="cf-constructor-plus-inner">+</span>
              </div>
              <span class="cf-constructor-sep">+</span>
              <div class="cf-constructor-block">
                <span class="cf-constructor-plus-inner">+</span>
              </div>
              <span class="cf-constructor-sep">+</span>
              <div class="cf-constructor-block">
                <span class="cf-constructor-plus-inner">+</span>
              </div>
            </div>
            <button class="cf-collapsed-btn" id="cf-collapsed-btn" type="button">
              Выбрать танки
            </button>
          </div>
        </div>

        <!-- Развёрнутое состояние: фильтр конфигуратора -->
        <div class="cf-expanded" id="cf-expanded" style="display:none">

          <!-- Заголовок панели с кнопками управления -->
          <div class="cf-panel-header">
            <div class="cf-panel-header-left">
              <span class="cf-panel-header-title">Подбери аккаунт по комбинации техники</span>
            </div>
            <div class="cf-panel-header-right">
              <button class="cf-reset-btn" id="cf-reset-btn" type="button" style="display:none" aria-label="Сбросить всё">
                Сбросить
              </button>
              <button class="cf-close-btn" id="cf-close-btn" type="button" aria-label="Свернуть конфигуратор">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <!-- Капсулы активных фильтров -->
          <div class="cf-capsules" id="cf-capsules"></div>

          <!-- Панель конфигуратора (всегда открыта) -->
          <div class="cf-panel" id="cf-panel">
            <div class="cf-panel-inner">

              <!-- Техника -->
              <div class="cf-section">
                <div class="cf-section-row">
                  <span class="cf-section-label">Уровень</span>
                  <div class="cf-chips" id="cf-tier-chips"></div>
                </div>
                <div class="cf-section-row">
                  <span class="cf-section-label">Класс</span>
                  <div class="cf-chips" id="cf-type-chips"></div>
                </div>
                <div class="cf-section-row">
                  <span class="cf-section-label">Нация</span>
                  <div class="cf-chips" id="cf-nation-chips"></div>
                </div>
                <div class="cf-section-row">
                  <span class="cf-section-label">Техника</span>
                  <div class="cf-tank-selector" id="cf-tank-selector">
                    <div class="cf-tank-search-wrap">
                      <input type="text" class="cf-tank-search" id="cf-tank-search" placeholder="Найти танк…" autocomplete="off">
                    </div>
                    <div class="cf-tank-list" id="cf-tank-list"></div>
                  </div>
                </div>
              </div>

              <!-- Дополнительно -->
              <div class="cf-section">
                <div class="cf-section-title">Дополнительно</div>
                <div class="cf-section-row">
                  <span class="cf-section-label">Цена (₽)</span>
                  <div class="cf-range-row" id="cf-price-range"></div>
                </div>
                <div class="cf-section-row">
                  <span class="cf-section-label">Боны</span>
                  <div class="cf-range-row" id="cf-bonds-range"></div>
                </div>
                <div class="cf-section-row">
                  <span class="cf-section-label">Золото</span>
                  <div class="cf-range-row" id="cf-gold-range"></div>
                </div>
                <div class="cf-section-row">
                  <span class="cf-section-label">Серебро (млн)</span>
                  <div class="cf-range-row" id="cf-silver-range"></div>
                </div>
                <div class="cf-section-row">
                  <label class="cf-checkbox-label">
                    <input type="checkbox" id="cf-no-battles" class="cf-checkbox">
                    <span>Без боёв</span>
                  </label>
                </div>
              </div>

            </div>
          </div>

          <!-- Счётчик результатов -->
          <div class="cf-results-count" id="cf-results-count" style="display:none"></div>
        </div>
      </div>
    `;

    _cfCollapsedEl = document.getElementById('cf-collapsed');
    _cfCapsulesEl  = document.getElementById('cf-capsules');
    _cfPanelEl     = document.getElementById('cf-panel');
    _cfToggleBtn   = null; // Кнопки фильтра больше нет

    // Кнопка "Выбрать танки" — разворачивает конфигуратор
    document.getElementById('cf-collapsed-btn').addEventListener('click', () => {
      if (_cfIsDisabled) return;
      _cfExpandConfigurator();
    });

    // Кнопка закрытия развёрнутого конфигуратора
    document.getElementById('cf-close-btn').addEventListener('click', () => {
      _cfCollapseConfigurator();
    });

    // Кнопка сброса
    document.getElementById('cf-reset-btn').addEventListener('click', () => {
      ConfiguratorFilter.reset();
    });

    // Чекбокс без боёв
    document.getElementById('cf-no-battles').addEventListener('change', (e) => {
      ConfiguratorFilter.setNoBattles(e.target.checked);
    });

    // Поиск по танкам
    document.getElementById('cf-tank-search').addEventListener('input', (e) => {
      _cfRenderTankList(e.target.value.toLowerCase());
    });

    // Первоначальный рендер опций (через timeout чтобы дать время инициализации)
    _cfRenderOptions(ConfiguratorFilter.getAvailableOptions());
  }

  // ── Развернуть / свернуть конфигуратор ───────────────────────
  function _cfExpandConfigurator() {
    const expandedEl = document.getElementById('cf-expanded');
    if (_cfCollapsedEl) _cfCollapsedEl.style.display = 'none';
    if (expandedEl) expandedEl.style.display = '';
    if (_cfPanelEl) _cfPanelEl.style.display = ''; // панель всегда открыта
    _cfIsPanelOpen = true;
    if (_cfOnActivate) _cfOnActivate();
  }

  function _cfCollapseConfigurator() {
    const expandedEl = document.getElementById('cf-expanded');
    if (_cfCollapsedEl) _cfCollapsedEl.style.display = '';
    if (expandedEl) expandedEl.style.display = 'none';
    _cfIsPanelOpen = false;
    if (_cfOnDeactivate) _cfOnDeactivate();
  }

  // ── Обработчик изменений конфигуратора ───────────────────────
  function _cfOnFilterChange(filteredLots) {
    _cfRenderCapsules();
    _cfRenderOptions(ConfiguratorFilter.getAvailableOptions());
    _cfUpdateCounters(filteredLots.length);
  }

  // ── Рендер капсул ─────────────────────────────────────────────
  function _cfRenderCapsules() {
    if (!_cfCapsulesEl) return;
    const capsules = ConfiguratorFilter.getActiveCapsules();
    const inactiveTanks = new Set(ConfiguratorFilter.getInactiveTanks());
    _cfCapsulesEl.innerHTML = '';

    capsules.forEach(cap => {
      const el = document.createElement('span');
      // Танк-капсула: серая и пунктирная если в текущей выборке нет аккаунтов с этим танком
      const isInactiveTank = cap.type === 'tank' && inactiveTanks.has(cap.value);
      el.className = 'cf-capsule' + (isInactiveTank ? ' cf-capsule--inactive' : '');
      el.innerHTML = `<span class="cf-capsule-label">${_cfEsc(cap.label)}</span><button class="cf-capsule-remove" aria-label="Удалить">✕</button>`;
      el.querySelector('.cf-capsule-remove').addEventListener('click', () => {
        ConfiguratorFilter.removeParam(cap.type, cap.value);
      });
      _cfCapsulesEl.appendChild(el);
    });

    // Кнопка сброса
    const resetBtn = document.getElementById('cf-reset-btn');
    if (resetBtn) resetBtn.style.display = ConfiguratorFilter.hasActiveFilters() ? '' : 'none';
  }

  // ── Рендер опций конфигуратора ────────────────────────────────
  function _cfRenderOptions(options) {
    _cfCurrentOptions = options;
    const state = ConfiguratorFilter.getState();

    // Уровни (5–10 в едином блоке)
    _cfRenderChips('cf-tier-chips', options.tiers, state.tier, (tier) => {
      ConfiguratorFilter.toggleTier(tier);
    }, (k) => `${k} ур.`, ['5','6','7','8','9','10']);

    // Нации — с PNG флагами
    _cfRenderNationChips('cf-nation-chips', options.nations, state.nation);

    // Типы
    _cfRenderChips('cf-type-chips', options.types, state.type, (tp) => {
      ConfiguratorFilter.toggleType(tp);
    }, (k) => `${CF_TYPE_ICONS[k] || ''} ${k}`, ['ТТ','СТ','ЛТ','ПТ','САУ']);

    // Список танков
    const tankSearch = document.getElementById('cf-tank-search');
    _cfRenderTankList(tankSearch ? tankSearch.value.toLowerCase() : '');

    // Чекбокс без боёв
    const noBattlesCheck = document.getElementById('cf-no-battles');
    if (noBattlesCheck) noBattlesCheck.checked = state.noBattles;

    // Диапазоны
    _cfRenderRange('cf-price-range', 'price', options.price, state.priceMin, state.priceMax);
    _cfRenderRange('cf-bonds-range', 'bonds', options.bonds, state.bondsMin, state.bondsMax);
    _cfRenderRange('cf-gold-range', 'gold', options.gold, state.goldMin, state.goldMax);
    _cfRenderRange('cf-silver-range', 'silver', options.silver, state.silverMin, state.silverMax);
  }

  function _cfRenderChips(containerId, optionsMap, selected, onClick, labelFn, order) {
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
      chip.className = 'cf-chip' + (isActive ? ' cf-chip--active' : '') + (count === 0 ? ' cf-chip--disabled' : '');
      chip.innerHTML = `${_cfEsc(labelFn(k))}`;
      if (count > 0) {
        chip.addEventListener('click', () => { chip.blur(); onClick(k); });
      }
      el.appendChild(chip);
    });
  }

  // Специальный рендер нация-чипов с PNG-флагами
  function _cfRenderNationChips(containerId, optionsMap, selected) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    const CF_NATION_ORDER = ['СССР','США','Германия','Франция','Британия','Япония','Китай','Швеция','Польша','Италия','Чехословакия','Сборная нация'];
    const keys = CF_NATION_ORDER.filter(k => optionsMap[k] !== undefined);

    keys.forEach(k => {
      const count = optionsMap[k] || 0;
      const isActive = selected.includes(k);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cf-chip cf-chip--nation' + (isActive ? ' cf-chip--active' : '') + (count === 0 ? ' cf-chip--disabled' : '');
      const flagHtml = _cfFlagImg(k);
      chip.innerHTML = `${flagHtml}<span class="cf-nation-name">${_cfEsc(k)}</span>`;
      if (count > 0) {
        chip.addEventListener('click', () => { chip.blur(); ConfiguratorFilter.toggleNation(k); });
      }
      el.appendChild(chip);
    });
  }

  function _cfRenderTankList(filterQuery) {
    const el = document.getElementById('cf-tank-list');
    if (!el) return;
    el.innerHTML = '';

    const available = ConfiguratorFilter.getAvailableTanks();
    const state = ConfiguratorFilter.getState();

    let entries = Object.entries(available);

    // Фильтрация по поиску внутри списка
    if (filterQuery) {
      entries = entries.filter(([name]) => name.toLowerCase().includes(filterQuery));
    }

    // Сортировка: выбранные сначала, потом по количеству
    entries.sort(([a, ai], [b, bi]) => {
      const aS = state.tanks.includes(a) ? 1 : 0;
      const bS = state.tanks.includes(b) ? 1 : 0;
      if (bS !== aS) return bS - aS;
      return (bi.count || 0) - (ai.count || 0);
    });

    // Ограничиваем количество отображаемых (чтобы не тормозить)
    const shown = entries.slice(0, 50);

    shown.forEach(([name, info]) => {
      const isActive = state.tanks.includes(name);

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'cf-tank-item' + (isActive ? ' cf-tank-item--active' : '');

      const iconUrl = info.icon && typeof assetUrl === 'function'
        ? assetUrl('icons/small/' + info.icon)
        : null;
      const imgHtml = iconUrl
        ? `<img src="${_cfEsc(iconUrl)}" alt="${_cfEsc(name)}" class="cf-tank-icon" onerror="this.style.display='none'">`
        : `<span class="cf-tank-no-icon">🛡</span>`;

      const tierBadge = info.tier ? `<span class="cf-tank-tier">${info.tier}</span>` : '';
      item.innerHTML = `
        ${imgHtml}
        <span class="cf-tank-name">${_cfEsc(name)}</span>
        ${tierBadge}
      `;
      item.addEventListener('click', () => { item.blur(); ConfiguratorFilter.toggleTank(name); });
      el.appendChild(item);
    });

    if (entries.length > 50) {
      const more = document.createElement('div');
      more.className = 'cf-tank-more';
      more.textContent = `+${entries.length - 50} танков — уточните фильтры`;
      el.appendChild(more);
    }

    if (shown.length === 0) {
      el.innerHTML = '<div class="cf-tank-empty">Нет доступных танков</div>';
    }
  }

  function _cfRenderRange(containerId, resourceKey, range, currentMin, currentMax) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const hasData = range && (range.max > 0);
    if (!hasData) {
      el.innerHTML = '<span class="cf-range-empty">нет данных</span>';
      return;
    }

    const minVal = currentMin !== null ? currentMin : '';
    const maxVal = currentMax !== null ? currentMax : '';

    el.innerHTML = `
      <input type="text" inputmode="numeric" pattern="[0-9]*" class="cf-range-input" data-key="${resourceKey}" data-bound="min"
        placeholder="${Math.floor(range.min)}" value="${minVal}">
      <span class="cf-range-dash">—</span>
      <input type="text" inputmode="numeric" pattern="[0-9]*" class="cf-range-input" data-key="${resourceKey}" data-bound="max"
        placeholder="${Math.ceil(range.max)}" value="${maxVal}">
    `;

    el.querySelectorAll('.cf-range-input').forEach(input => {
      const applyValue = () => {
        const key = input.dataset.key;
        const bound = input.dataset.bound;
        let val = input.value === '' ? null : parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));

        // Clamp: если ввод меньше мин — ставим мин, если больше макс — ставим макс
        if (val !== null && !isNaN(val)) {
          if (bound === 'min' && val < range.min) { val = range.min; input.value = val; }
          if (bound === 'min' && val > range.max) { val = range.max; input.value = val; }
          if (bound === 'max' && val < range.min) { val = range.min; input.value = val; }
          if (bound === 'max' && val > range.max) { val = range.max; input.value = val; }
        } else if (val !== null && isNaN(val)) {
          val = null;
          input.value = '';
        }

        const state = ConfiguratorFilter.getState();
        if (key === 'price') {
          const min = bound === 'min' ? val : state.priceMin;
          const max = bound === 'max' ? val : state.priceMax;
          ConfiguratorFilter.setPrice(min, max);
        } else {
          const minK = key + 'Min';
          const maxK = key + 'Max';
          const min = bound === 'min' ? val : state[minK];
          const max = bound === 'max' ? val : state[maxK];
          ConfiguratorFilter.setResources(key, min, max);
        }
      };
      input.addEventListener('change', applyValue);
      input.addEventListener('blur', applyValue);
    });
  }

  // ── Счётчик результатов ───────────────────────────────────────
  function _cfUpdateCounters(count) {
    // Счётчик результатов скрыт по дизайн-решению
    const el = document.getElementById('cf-results-count');
    if (el) el.style.display = 'none';
  }

  function _cfEsc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ── Публичный API ─────────────────────────────────────────────
  return {
    init,
    onFilterChange,
    collapse,
    dim,
    enable,
  };

})();
