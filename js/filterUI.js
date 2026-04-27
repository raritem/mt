/* ================================================================
   TANKNEXUS — filterUI.js
   UI-компонент адаптивного фильтра (конфигуратор + капсулы)
   ================================================================ */

'use strict';

const FilterUI = (() => {

  // ── Элементы DOM ──────────────────────────────────────────────
  let _container = null;
  let _capsulesEl = null;
  let _panelEl = null;
  let _toggleBtn = null;
  let _isPanelOpen = false;
  let _currentOptions = {};

  // ── Иконки нации (флаги PNG) ──────────────────────────────────
  const NATION_FLAG_FILES = {
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
  function init(containerId) {
    _container = document.getElementById(containerId);
    if (!_container) return;
    _render();
  }

  // Вызывается из main.js через AdaptiveFilter.onChange
  function onFilterChange(filteredLots) {
    _onFilterChange(filteredLots);
  }

  function _render() {
    _container.innerHTML = `
      <div class="af-root">
        <!-- Строка: поиск + кнопка фильтра -->
        <div class="af-searchrow">
          <div class="af-search-wrap">
            <svg class="af-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" class="af-search-input" id="af-search-input" placeholder="Поиск по технике…" autocomplete="off">
            <button class="af-search-clear" id="af-search-clear" style="display:none" aria-label="Очистить поиск">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <button class="af-filter-btn" id="af-filter-toggle" type="button" aria-label="Фильтр">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span class="af-filter-btn-label">Фильтр</span>
            <span class="af-filter-count" id="af-filter-count" style="display:none">0</span>
          </button>
          <button class="af-reset-btn" id="af-reset-btn" type="button" style="display:none" aria-label="Сбросить всё">
            Сбросить
          </button>
        </div>

        <!-- Капсулы активных фильтров -->
        <div class="af-capsules" id="af-capsules"></div>

        <!-- Панель конфигуратора -->
        <div class="af-panel" id="af-panel" style="display:none">
          <div class="af-panel-inner">

            <!-- Техника -->
            <div class="af-section">
              <div class="af-section-row">
                <span class="af-section-label">Уровень</span>
                <div class="af-chips" id="af-tier-chips"></div>
              </div>
              <div class="af-section-row">
                <span class="af-section-label">Класс</span>
                <div class="af-chips" id="af-type-chips"></div>
              </div>
              <div class="af-section-row">
                <span class="af-section-label">Нация</span>
                <div class="af-chips" id="af-nation-chips"></div>
              </div>
              <div class="af-section-row">
                <span class="af-section-label">Техника</span>
                <div class="af-tank-selector" id="af-tank-selector">
                  <div class="af-tank-search-wrap">
                    <input type="text" class="af-tank-search" id="af-tank-search" placeholder="Найти танк…" autocomplete="off">
                  </div>
                  <div class="af-tank-list" id="af-tank-list"></div>
                </div>
              </div>
            </div>

            <!-- Дополнительно -->
            <div class="af-section">
              <div class="af-section-title">Дополнительно</div>
              <div class="af-section-row">
                <span class="af-section-label">Цена (₽)</span>
                <div class="af-range-row" id="af-price-range"></div>
              </div>
              <div class="af-section-row">
                <span class="af-section-label">Боны</span>
                <div class="af-range-row" id="af-bonds-range"></div>
              </div>
              <div class="af-section-row">
                <span class="af-section-label">Золото</span>
                <div class="af-range-row" id="af-gold-range"></div>
              </div>
              <div class="af-section-row">
                <span class="af-section-label">Серебро (млн)</span>
                <div class="af-range-row" id="af-silver-range"></div>
              </div>
              <div class="af-section-row">
                <label class="af-checkbox-label">
                  <input type="checkbox" id="af-no-battles" class="af-checkbox">
                  <span>Без боёв</span>
                </label>
              </div>
            </div>

          </div>
        </div>

        <!-- Счётчик результатов -->
        <div class="af-results-count" id="af-results-count" style="display:none"></div>
      </div>
    `;

    _capsulesEl = document.getElementById('af-capsules');
    _panelEl    = document.getElementById('af-panel');
    _toggleBtn  = document.getElementById('af-filter-toggle');

    // Поиск
    const searchInput = document.getElementById('af-search-input');
    const searchClear = document.getElementById('af-search-clear');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      searchClear.style.display = q ? '' : 'none';
      AdaptiveFilter.setSearch(q);
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      AdaptiveFilter.setSearch('');
    });

    // Тоггл панели
    _toggleBtn.addEventListener('click', () => {
      _isPanelOpen = !_isPanelOpen;
      _panelEl.style.display = _isPanelOpen ? '' : 'none';
      _toggleBtn.classList.toggle('af-filter-btn--active', _isPanelOpen);
    });

    // Кнопка сброса
    document.getElementById('af-reset-btn').addEventListener('click', () => {
      searchInput.value = '';
      searchClear.style.display = 'none';
      AdaptiveFilter.reset();
    });

    // Чекбокс без боёв
    document.getElementById('af-no-battles').addEventListener('change', (e) => {
      AdaptiveFilter.setNoBattles(e.target.checked);
    });

    // Поиск по танкам
    document.getElementById('af-tank-search').addEventListener('input', (e) => {
      _renderTankList(e.target.value.toLowerCase());
    });

    // Первоначальный рендер опций (через timeout чтобы дать время инициализации)
    _renderOptions(AdaptiveFilter.getAvailableOptions());
  }

  // ── Обработчик изменений фильтра ──────────────────────────────
  function _onFilterChange(filteredLots) {
    _renderCapsules();
    _renderOptions(AdaptiveFilter.getAvailableOptions());
    _updateCounters(filteredLots.length);
  }

  // ── Рендер капсул ─────────────────────────────────────────────
  function _renderCapsules() {
    if (!_capsulesEl) return;
    const capsules = AdaptiveFilter.getActiveCapsules();
    const inactiveTanks = new Set(AdaptiveFilter.getInactiveTanks());
    _capsulesEl.innerHTML = '';

    capsules.forEach(cap => {
      const el = document.createElement('span');
      // Танк-капсула: серая и пунктирная если в текущей выборке нет аккаунтов с этим танком
      const isInactiveTank = cap.type === 'tank' && inactiveTanks.has(cap.value);
      el.className = 'af-capsule' + (isInactiveTank ? ' af-capsule--inactive' : '');
      el.innerHTML = `<span class="af-capsule-label">${_esc(cap.label)}</span><button class="af-capsule-remove" aria-label="Удалить">✕</button>`;
      el.querySelector('.af-capsule-remove').addEventListener('click', () => {
        AdaptiveFilter.removeParam(cap.type, cap.value);
        // Синхронизируем поиск если нужно
        if (cap.type === 'search') {
          const si = document.getElementById('af-search-input');
          if (si) { si.value = ''; document.getElementById('af-search-clear').style.display = 'none'; }
        }
      });
      _capsulesEl.appendChild(el);
    });

    // Кнопка сброса
    const resetBtn = document.getElementById('af-reset-btn');
    if (resetBtn) resetBtn.style.display = AdaptiveFilter.hasActiveFilters() ? '' : 'none';

    // Счётчик фильтров
    const countEl = document.getElementById('af-filter-count');
    const nonSearchCaps = capsules.filter(c => c.type !== 'search');
    if (countEl) {
      countEl.style.display = nonSearchCaps.length > 0 ? '' : 'none';
      countEl.textContent = nonSearchCaps.length;
    }
  }

  // ── Рендер опций конфигуратора ────────────────────────────────
  function _renderOptions(options) {
    _currentOptions = options;
    const state = AdaptiveFilter.getState();

    // Уровни (5–10 в едином блоке)
    _renderChips('af-tier-chips', options.tiers, state.tier, (tier) => {
      AdaptiveFilter.toggleTier(tier);
    }, (k) => `${k} ур.`, ['5','6','7','8','9','10']);

    // Нации — с PNG флагами
    _renderNationChips('af-nation-chips', options.nations, state.nation);

    // Типы
    _renderChips('af-type-chips', options.types, state.type, (tp) => {
      AdaptiveFilter.toggleType(tp);
    }, (k) => `${TYPE_ICONS[k] || ''} ${k}`, ['ТТ','СТ','ЛТ','ПТ','САУ']);

    // Список танков
    const tankSearch = document.getElementById('af-tank-search');
    _renderTankList(tankSearch ? tankSearch.value.toLowerCase() : '');

    // Чекбокс без боёв
    const noBattlesCheck = document.getElementById('af-no-battles');
    if (noBattlesCheck) noBattlesCheck.checked = state.noBattles;

    // Диапазоны
    _renderRange('af-price-range', 'price', options.price, state.priceMin, state.priceMax);
    _renderRange('af-bonds-range', 'bonds', options.bonds, state.bondsMin, state.bondsMax);
    _renderRange('af-gold-range', 'gold', options.gold, state.goldMin, state.goldMax);
    _renderRange('af-silver-range', 'silver', options.silver, state.silverMin, state.silverMax);
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

  // Специальный рендер нация-чипов с PNG-флагами
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
        chip.addEventListener('click', () => { chip.blur(); AdaptiveFilter.toggleNation(k); });
      }
      el.appendChild(chip);
    });
  }

  function _renderTankList(filterQuery) {
    const el = document.getElementById('af-tank-list');
    if (!el) return;
    el.innerHTML = '';

    const available = AdaptiveFilter.getAvailableTanks();
    const state = AdaptiveFilter.getState();

    let entries = Object.entries(available);

    // Фильтрация по поиску внутри списка
    if (filterQuery) {
      entries = entries.filter(([name]) => name.toLowerCase().includes(filterQuery));
    }

    // Сортировка: выбранные сначала, потом по группе (прем 8-9 → 10 → прем 7 → 6 → 5) и interest_level
    function _groupOrder(info) {
      const tier   = String(info.tier || '');
      const isPrem = !!info.isPrem;
      if ((tier === '8' || tier === '9') && isPrem) return 0;
      if (tier === '10') return 1;
      if (tier === '7' && isPrem) return 2;
      if (tier === '6' && isPrem) return 3;
      if (tier === '5' && isPrem) return 4;
      return 5;
    }
    entries.sort(([a, ai], [b, bi]) => {
      const aS = state.tanks.includes(a) ? 1 : 0;
      const bS = state.tanks.includes(b) ? 1 : 0;
      if (bS !== aS) return bS - aS;
      const ga = _groupOrder(ai), gb = _groupOrder(bi);
      if (ga !== gb) return ga - gb;
      return (parseInt(bi.interest_level || '0', 10) || 0) -
             (parseInt(ai.interest_level || '0', 10) || 0);
    });

    // Ограничиваем количество отображаемых (чтобы не тормозить)
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
      item.addEventListener('click', () => { item.blur(); AdaptiveFilter.toggleTank(name); });
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

        const state = AdaptiveFilter.getState();
        if (key === 'price') {
          const min = bound === 'min' ? val : state.priceMin;
          const max = bound === 'max' ? val : state.priceMax;
          AdaptiveFilter.setPrice(min, max);
        } else {
          const minK = key + 'Min';
          const maxK = key + 'Max';
          const min = bound === 'min' ? val : state[minK];
          const max = bound === 'max' ? val : state[maxK];
          AdaptiveFilter.setResources(key, min, max);
        }
      };
      input.addEventListener('change', applyValue);
      input.addEventListener('blur', applyValue);
    });
  }

  // ── Счётчик результатов ───────────────────────────────────────
  function _updateCounters(count) {
    // Счётчик результатов скрыт по дизайн-решению
    const el = document.getElementById('af-results-count');
    if (el) el.style.display = 'none';
  }

  function _plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ── Публичный API ─────────────────────────────────────────────
  return {
    init,
    onFilterChange,
  };

})();
