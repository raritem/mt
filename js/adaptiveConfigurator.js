/* ================================================================
   TANKNEXUS — adaptiveConfigurator.js
   Конфигуратор подбора аккаунта по технике (полностью независимый)
   ================================================================ */

'use strict';

// ── ENGINE ────────────────────────────────────────────────────────

const ConfiguratorEngine = (() => {

  let _state = {
    tier: null,          // выбранный уровень (строка '5'–'10') или null
    type: null,          // выбранный класс ('ТТ','СТ','ЛТ','ПТ','САУ') или null
    nation: null,        // выбранная нация или null
    tanks: [],           // выбранные конкретные танки
    priceMin: null,
    priceMax: null,
    bondsMin: null,
    bondsMax: null,
    goldMin: null,
    goldMax: null,
    silverMin: null,
    silverMax: null,
    noBattles: false,
  };

  let _allLots = [];
  let _tanksIndex = {};
  let _nationIndex = {};
  let _tierIndex = {};
  let _typeIndex = {};
  let _tanksData = {};
  let _lotsById = {};

  let _onChangeCallback = null;

  // ── Init ─────────────────────────────────────────────────────
  function init({ allLots, tanksIndex, nationIndex, tierIndex, typeIndex, tanksData }) {
    _allLots = allLots || [];
    _tanksIndex = tanksIndex || {};
    _nationIndex = nationIndex || {};
    _tierIndex = tierIndex || {};
    _typeIndex = typeIndex || {};
    _tanksData = tanksData || {};
    _lotsById = {};
    for (const lot of _allLots) {
      _lotsById[String(lot.id)] = lot;
    }
  }

  function onChange(cb) { _onChangeCallback = cb; }

  function _notify() {
    if (_onChangeCallback) _onChangeCallback(getResult());
  }

  function getState() { return { ..._state }; }

  // ── Переключение уровня: при смене — сброс класса и нации ────
  function setTier(tier) {
    const t = tier ? String(tier) : null;
    if (_state.tier === t) {
      _state.tier = null;
    } else {
      _state.tier = t;
      _state.type = null;
      _state.nation = null;
    }
    _notify();
  }

  // ── Переключение класса: при смене — сброс нации ─────────────
  function setType(type) {
    if (_state.type === type) {
      _state.type = null;
    } else {
      _state.type = type;
      _state.nation = null;
    }
    _notify();
  }

  // ── Переключение нации ───────────────────────────────────────
  function setNation(nation) {
    _state.nation = _state.nation === nation ? null : nation;
    _notify();
  }

  // ── Танки: добавление/удаление (toggle) ──────────────────────
  function toggleTank(tankName) {
    const idx = _state.tanks.indexOf(tankName);
    if (idx === -1) _state.tanks = [..._state.tanks, tankName];
    else _state.tanks = _state.tanks.filter(t => t !== tankName);
    _notify();
  }

  function removeTank(tankName) {
    _state.tanks = _state.tanks.filter(t => t !== tankName);
    _notify();
  }

  function setPrice(min, max) {
    _state.priceMin = min;
    _state.priceMax = max;
    _notify();
  }

  function setResources(type, min, max) {
    _state[type + 'Min'] = min;
    _state[type + 'Max'] = max;
    _notify();
  }

  function setNoBattles(val) {
    _state.noBattles = !!val;
    _notify();
  }

  function removeParam(paramType, value) {
    switch (paramType) {
      case 'tank':      _state.tanks = _state.tanks.filter(t => t !== value); break;
      case 'tier':      _state.tier = null; break;
      case 'type':      _state.type = null; break;
      case 'nation':    _state.nation = null; break;
      case 'price':     _state.priceMin = null; _state.priceMax = null; break;
      case 'bonds':     _state.bondsMin = null; _state.bondsMax = null; break;
      case 'gold':      _state.goldMin = null;  _state.goldMax = null;  break;
      case 'silver':    _state.silverMin = null; _state.silverMax = null; break;
      case 'noBattles': _state.noBattles = false; break;
    }
    _notify();
  }

  function reset() {
    _state = {
      tier: null, type: null, nation: null, tanks: [],
      priceMin: null, priceMax: null,
      bondsMin: null, bondsMax: null,
      goldMin: null,  goldMax: null,
      silverMin: null, silverMax: null,
      noBattles: false,
    };
    _notify();
  }

  // ── Вспомогательные ─────────────────────────────────────────
  function _intersect(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    const setB = new Set(b);
    return a.filter(id => setB.has(id));
  }

  function _normStr(str) {
    if (!str) return '';
    return String(str).toLowerCase().trim();
  }

  function _parseNum(val) {
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // ── Получение IDs по выбранным танкам (AND-логика для конкретных танков) ──
  // Для конфигуратора: аккаунт должен содержать ВСЕ выбранные танки
  function _getFilteredIds() {
    let result = null;

    // Конкретные танки: AND — аккаунт должен иметь все выбранные
    if (_state.tanks.length > 0) {
      for (const tankName of _state.tanks) {
        const ids = (_tanksIndex[tankName] || []).map(String);
        result = _intersect(result, ids);
      }
    }

    if (result === null) result = _allLots.map(l => String(l.id));
    return result;
  }

  function _applyLotFilters(lots) {
    return lots.filter(lot => {
      if (_state.priceMin !== null || _state.priceMax !== null) {
        const price = _parseNum(lot.price);
        if (_state.priceMin !== null && price < _state.priceMin) return false;
        if (_state.priceMax !== null && price > _state.priceMax) return false;
      }
      if (_state.bondsMin !== null || _state.bondsMax !== null) {
        const bonds = _parseNum((lot.resources || {}).bonds);
        if (_state.bondsMin !== null && bonds < _state.bondsMin) return false;
        if (_state.bondsMax !== null && bonds > _state.bondsMax) return false;
      }
      if (_state.goldMin !== null || _state.goldMax !== null) {
        const gold = _parseNum((lot.resources || {}).gold);
        if (_state.goldMin !== null && gold < _state.goldMin) return false;
        if (_state.goldMax !== null && gold > _state.goldMax) return false;
      }
      if (_state.silverMin !== null || _state.silverMax !== null) {
        const silver = _parseNum((lot.resources || {}).silver);
        if (_state.silverMin !== null && silver < _state.silverMin) return false;
        if (_state.silverMax !== null && silver > _state.silverMax) return false;
      }
      if (_state.noBattles) {
        const nb = lot.no_battles === true || lot.no_battles === 'true' || lot.no_battles === 'Без боёв';
        if (!nb) return false;
      }
      return true;
    });
  }

  function getResult() {
    const ids = _getFilteredIds();
    const idSet = new Set(ids);
    let lots = _allLots.filter(l => idSet.has(String(l.id)));
    lots = _applyLotFilters(lots);
    return lots;
  }

  // ── Доступные опции (для tier/type/nation — взаимозависимые) ──
  // После выбора уровня — показываем только классы, доступные на этом уровне
  // После выбора класса — показываем только нации, доступные для этого уровня+класса
  // Вся логика считается по танкам, а не по аккаунтам (для навигации по технике)

  function _getTanksMatchingFilters(filterTier, filterType, filterNation) {
    const result = {};
    for (const [name, info] of Object.entries(_tanksData)) {
      if (filterTier   && String(info.tier) !== filterTier) continue;
      if (filterType   && info.type !== filterType) continue;
      if (filterNation && info.nation !== filterNation) continue;
      result[name] = info;
    }
    return result;
  }

  // Доступные уровни — все, у которых есть танки и аккаунты
  function getAvailableTiers() {
    const result = {};
    for (const [tier, lotIds] of Object.entries(_tierIndex)) {
      if (lotIds.length > 0) result[tier] = lotIds.length;
    }
    return result;
  }

  // Доступные классы при выбранном уровне
  function getAvailableTypes() {
    if (!_state.tier) {
      // Нет уровня — показываем все
      const result = {};
      for (const [tp, lotIds] of Object.entries(_typeIndex)) {
        if (lotIds.length > 0) result[tp] = lotIds.length;
      }
      return result;
    }
    // Ищем классы среди танков данного уровня
    const types = {};
    for (const [name, info] of Object.entries(_tanksData)) {
      if (String(info.tier) !== _state.tier) continue;
      const lotIds = _tanksIndex[name] || [];
      if (lotIds.length === 0) continue;
      types[info.type] = (types[info.type] || 0) + lotIds.length;
    }
    return types;
  }

  // Доступные нации при выбранном уровне+классе
  function getAvailableNations() {
    const nations = {};
    for (const [name, info] of Object.entries(_tanksData)) {
      if (_state.tier && String(info.tier) !== _state.tier) continue;
      if (_state.type && info.type !== _state.type) continue;
      const lotIds = _tanksIndex[name] || [];
      if (lotIds.length === 0) continue;
      nations[info.nation] = (nations[info.nation] || 0) + lotIds.length;
    }
    return nations;
  }

  // ── Доступные танки для выбора в текущей навигации ───────────
  // Показывает технику по tier/type/nation, исключая уже выбранные
  function getAvailableTanksInNavigator() {
    const result = {};
    for (const [name, info] of Object.entries(_tanksData)) {
      if (_state.tanks.includes(name)) continue; // уже выбран — в другой блок
      if (_state.tier   && String(info.tier) !== _state.tier) continue;
      if (_state.type   && info.type !== _state.type) continue;
      if (_state.nation && info.nation !== _state.nation) continue;
      const lotIds = _tanksIndex[name] || [];
      if (lotIds.length === 0) continue;
      result[name] = { ...info, count: lotIds.length };
    }
    return result;
  }

  // ── Комбо-доступность: аккаунты, содержащие ВСЕ выбранные танки + ещё один ──
  // Используется для блока "доступные комбинации"
  function getCompatibleTanks() {
    if (_state.tanks.length === 0) return {};

    // Базовые аккаунты (содержат все выбранные)
    const baseIds = _getFilteredIds();
    const baseSet = new Set(baseIds);

    const result = {};
    for (const [name, info] of Object.entries(_tanksData)) {
      if (_state.tanks.includes(name)) continue;
      // Применяем текущую навигацию к кандидатам тоже
      if (_state.tier   && String(info.tier) !== _state.tier) continue;
      if (_state.type   && info.type !== _state.type) continue;
      if (_state.nation && info.nation !== _state.nation) continue;

      const lotIds = (_tanksIndex[name] || []).map(String);
      // Сколько аккаунтов имеют и все выбранные и ещё этот танк
      const count = lotIds.filter(id => baseSet.has(id)).length;
      if (count > 0) {
        result[name] = { ...info, count };
      }
    }
    return result;
  }

  // ── Активные капсулы ─────────────────────────────────────────
  function getActiveCapsules() {
    const capsules = [];

    for (const tank of _state.tanks) {
      capsules.push({ type: 'tank', value: tank, label: tank });
    }

    if (_state.priceMin !== null || _state.priceMax !== null) {
      capsules.push({ type: 'price', value: 'price', label: `₽ ${_state.priceMin || '0'}–${_state.priceMax || '∞'}` });
    }
    if (_state.bondsMin !== null || _state.bondsMax !== null) {
      capsules.push({ type: 'bonds', value: 'bonds', label: `🔵 ${_state.bondsMin || '0'}–${_state.bondsMax || '∞'} бон.` });
    }
    if (_state.goldMin !== null || _state.goldMax !== null) {
      capsules.push({ type: 'gold', value: 'gold', label: `🟡 ${_state.goldMin || '0'}–${_state.goldMax || '∞'} зол.` });
    }
    if (_state.silverMin !== null || _state.silverMax !== null) {
      capsules.push({ type: 'silver', value: 'silver', label: `⚪ ${_state.silverMin || '0'}–${_state.silverMax || '∞'} сер.` });
    }
    if (_state.noBattles) {
      capsules.push({ type: 'noBattles', value: 'noBattles', label: '0 боёв' });
    }

    return capsules;
  }

  function hasActiveFilters() {
    return (
      _state.tanks.length > 0 ||
      _state.tier !== null ||
      _state.type !== null ||
      _state.nation !== null ||
      _state.priceMin !== null || _state.priceMax !== null ||
      _state.bondsMin !== null || _state.bondsMax !== null ||
      _state.goldMin !== null  || _state.goldMax !== null  ||
      _state.silverMin !== null || _state.silverMax !== null ||
      _state.noBattles
    );
  }

  function getAvailableOptions() {
    const currentIds = _getFilteredIds();
    const currentIdSet = new Set(currentIds);
    const filteredLots = _applyLotFilters(_allLots.filter(l => currentIdSet.has(String(l.id))));

    const prices = filteredLots.map(l => _parseNum(l.price)).filter(x => x > 0);
    const bonds  = filteredLots.map(l => _parseNum((l.resources || {}).bonds)).filter(x => x > 0);
    const gold   = filteredLots.map(l => _parseNum((l.resources || {}).gold)).filter(x => x > 0);
    const silver = filteredLots.map(l => _parseNum((l.resources || {}).silver)).filter(x => x > 0);

    return {
      price:  { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
      bonds:  { min: bonds.length  ? Math.min(...bonds)  : 0, max: bonds.length  ? Math.max(...bonds)  : 0 },
      gold:   { min: gold.length   ? Math.min(...gold)   : 0, max: gold.length   ? Math.max(...gold)   : 0 },
      silver: { min: silver.length ? Math.min(...silver) : 0, max: silver.length ? Math.max(...silver) : 0 },
      totalFiltered: filteredLots.length,
    };
  }

  return {
    init,
    onChange,
    getState,
    setTier,
    setType,
    setNation,
    toggleTank,
    removeTank,
    setPrice,
    setResources,
    setNoBattles,
    removeParam,
    reset,
    getResult,
    getActiveCapsules,
    hasActiveFilters,
    getAvailableTiers,
    getAvailableTypes,
    getAvailableNations,
    getAvailableTanksInNavigator,
    getCompatibleTanks,
    getAvailableOptions,
  };
})();


// ── UI ────────────────────────────────────────────────────────────

const ConfiguratorUI = (() => {

  let _container = null;
  let _isOpen = false;
  let _currentOptions = {};
  let _onResultCallback = null;

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

  const NATION_ORDER = ['СССР','США','Германия','Франция','Британия','Япония','Китай','Швеция','Польша','Италия','Чехословакия','Сборная нация'];
  const TYPE_ORDER = ['ТТ','СТ','ЛТ','ПТ','САУ'];
  const TIER_ORDER = ['5','6','7','8','9','10'];

  const TYPE_ICONS = {
    'ТТ': '🛡️', 'СТ': '⚡', 'ЛТ': '💨', 'ПТ': '🎯', 'САУ': '💥',
  };

  function _flagImg(nation) {
    const file = NATION_FLAG_FILES[nation];
    if (!file) return '';
    const base = (typeof assetUrl === 'function') ? assetUrl('icons/flags/' + file) : ('icons/flags/' + file);
    return `<img src="${base}" alt="${nation}" class="af-nation-flag" onerror="this.style.display='none'">`;
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ── Публичный API ─────────────────────────────────────────────
  function init(containerId, onResult) {
    _container = document.getElementById(containerId);
    if (!_container) return;
    _onResultCallback = onResult || null;
    _render();
    ConfiguratorEngine.onChange(_onEngineChange);
  }

  function _onEngineChange(filteredLots) {
    _renderUI();
    if (_onResultCallback) _onResultCallback(filteredLots);
  }

  // ── Основной рендер оболочки ──────────────────────────────────
  function _render() {
    _container.innerHTML = `
      <div class="cfg-root" id="cfg-root">
        <!-- Заголовок-тоглер -->
        <button class="cfg-toggle" id="cfg-toggle" type="button">
          <span class="cfg-toggle-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          </span>
          <span class="cfg-toggle-label">Конфигуратор подбора</span>
          <span class="cfg-toggle-sub">Подберите аккаунт по технике</span>
          <span class="cfg-toggle-chevron" id="cfg-chevron">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
          <span class="cfg-active-badge" id="cfg-active-badge" style="display:none"></span>
        </button>

        <!-- Тело конфигуратора -->
        <div class="cfg-body" id="cfg-body" style="display:none">

          <!-- Блок навигации по технике -->
          <div class="cfg-section cfg-section--nav">

            <!-- Уровень -->
            <div class="cfg-nav-row" id="cfg-tier-row">
              <span class="cfg-nav-label">Уровень</span>
              <div class="cfg-nav-chips" id="cfg-tier-chips"></div>
            </div>

            <!-- Класс -->
            <div class="cfg-nav-row" id="cfg-type-row">
              <span class="cfg-nav-label">Класс</span>
              <div class="cfg-nav-chips" id="cfg-type-chips"></div>
            </div>

            <!-- Нация -->
            <div class="cfg-nav-row" id="cfg-nation-row">
              <span class="cfg-nav-label">Нация</span>
              <div class="cfg-nav-chips" id="cfg-nation-chips"></div>
            </div>

            <!-- Поиск танка -->
            <div class="cfg-nav-row cfg-nav-row--search">
              <span class="cfg-nav-label">Техника</span>
              <div class="cfg-tank-selector">
                <div class="cfg-tank-search-wrap">
                  <svg class="cfg-tank-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input type="text" class="cfg-tank-search" id="cfg-tank-search" placeholder="Найти танк…" autocomplete="off">
                </div>
                <!-- Выбрано -->
                <div class="cfg-tank-section" id="cfg-selected-section" style="display:none">
                  <div class="cfg-tank-section-title">Выбрано</div>
                  <div class="cfg-tank-list" id="cfg-selected-list"></div>
                </div>
                <!-- Доступные комбинации (только когда есть хотя бы 1 выбранный) -->
                <div class="cfg-tank-section" id="cfg-combos-section" style="display:none">
                  <div class="cfg-tank-section-title">Доступные комбинации</div>
                  <div class="cfg-tank-list" id="cfg-combos-list"></div>
                </div>
                <!-- Все доступные (при пустом выборе) -->
                <div class="cfg-tank-section" id="cfg-available-section">
                  <div class="cfg-tank-list" id="cfg-available-list"></div>
                </div>
              </div>
            </div>

          </div>

          <!-- Капсулы выбранных параметров -->
          <div class="cfg-capsules-wrap" id="cfg-capsules-wrap" style="display:none">
            <div class="cfg-capsules" id="cfg-capsules"></div>
          </div>

          <!-- Дополнительные фильтры -->
          <div class="cfg-section cfg-section--extra">
            <div class="cfg-extra-title">Дополнительно</div>
            <div class="cfg-nav-row">
              <span class="cfg-nav-label">Цена (₽)</span>
              <div class="cfg-range-row" id="cfg-price-range"></div>
            </div>
            <div class="cfg-nav-row">
              <span class="cfg-nav-label">Боны</span>
              <div class="cfg-range-row" id="cfg-bonds-range"></div>
            </div>
            <div class="cfg-nav-row">
              <span class="cfg-nav-label">Золото</span>
              <div class="cfg-range-row" id="cfg-gold-range"></div>
            </div>
            <div class="cfg-nav-row">
              <span class="cfg-nav-label">Серебро (млн)</span>
              <div class="cfg-range-row" id="cfg-silver-range"></div>
            </div>
            <div class="cfg-nav-row">
              <label class="cfg-checkbox-label">
                <input type="checkbox" id="cfg-no-battles" class="cfg-checkbox">
                <span>Без боёв</span>
              </label>
            </div>
          </div>

          <!-- Футер: счётчик + сброс -->
          <div class="cfg-footer">
            <span class="cfg-result-count" id="cfg-result-count"></span>
            <button class="cfg-reset-btn" id="cfg-reset-btn" type="button" style="display:none">Сбросить всё</button>
          </div>
        </div>
      </div>
    `;

    // Тогл
    document.getElementById('cfg-toggle').addEventListener('click', _toggleOpen);

    // Сброс
    document.getElementById('cfg-reset-btn').addEventListener('click', () => {
      ConfiguratorEngine.reset();
    });

    // Чекбокс
    document.getElementById('cfg-no-battles').addEventListener('change', (e) => {
      ConfiguratorEngine.setNoBattles(e.target.checked);
    });

    // Поиск
    document.getElementById('cfg-tank-search').addEventListener('input', (e) => {
      _renderTankLists(e.target.value.toLowerCase());
    });

    _renderUI();
  }

  function _toggleOpen() {
    _isOpen = !_isOpen;
    const body = document.getElementById('cfg-body');
    const chevron = document.getElementById('cfg-chevron');
    const root = document.getElementById('cfg-root');
    if (body)   body.style.display = _isOpen ? '' : 'none';
    if (chevron) chevron.classList.toggle('cfg-chevron--open', _isOpen);
    if (root)    root.classList.toggle('cfg-root--open', _isOpen);
  }

  // ── Главный рендер состояния ──────────────────────────────────
  function _renderUI() {
    const state = ConfiguratorEngine.getState();

    _renderTierChips(state);
    _renderTypeChips(state);
    _renderNationChips(state);
    _renderTankLists(
      document.getElementById('cfg-tank-search')
        ? document.getElementById('cfg-tank-search').value.toLowerCase()
        : ''
    );
    _renderCapsules(state);
    _renderBadge(state);
    _renderRanges(state);

    // Чекбокс
    const noBattles = document.getElementById('cfg-no-battles');
    if (noBattles) noBattles.checked = state.noBattles;

    // Сброс
    const resetBtn = document.getElementById('cfg-reset-btn');
    if (resetBtn) resetBtn.style.display = ConfiguratorEngine.hasActiveFilters() ? '' : 'none';

    // Счётчик
    const countEl = document.getElementById('cfg-result-count');
    if (countEl) {
      const count = ConfiguratorEngine.getResult().length;
      countEl.textContent = count > 0
        ? `Найдено: ${count} ${_plural(count, 'аккаунт', 'аккаунта', 'аккаунтов')}`
        : 'Нет аккаунтов';
    }
  }

  // ── Рендер уровней ───────────────────────────────────────────
  function _renderTierChips(state) {
    const el = document.getElementById('cfg-tier-chips');
    if (!el) return;
    el.innerHTML = '';
    const available = ConfiguratorEngine.getAvailableTiers();

    TIER_ORDER.forEach(tier => {
      if (available[tier] === undefined) return;
      const isActive = state.tier === tier;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cfg-chip' + (isActive ? ' cfg-chip--active' : '');
      btn.textContent = `${tier} ур.`;
      btn.addEventListener('click', () => { btn.blur(); ConfiguratorEngine.setTier(tier); });
      el.appendChild(btn);
    });
  }

  // ── Рендер классов ───────────────────────────────────────────
  function _renderTypeChips(state) {
    const el = document.getElementById('cfg-type-chips');
    if (!el) return;
    el.innerHTML = '';
    const available = ConfiguratorEngine.getAvailableTypes();

    TYPE_ORDER.forEach(tp => {
      const count = available[tp];
      if (count === undefined) return;
      const isActive = state.type === tp;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cfg-chip' + (isActive ? ' cfg-chip--active' : '') + (count === 0 ? ' cfg-chip--disabled' : '');
      btn.innerHTML = `${TYPE_ICONS[tp] || ''} ${_esc(tp)}`;
      if (count > 0) btn.addEventListener('click', () => { btn.blur(); ConfiguratorEngine.setType(tp); });
      el.appendChild(btn);
    });
  }

  // ── Рендер наций ─────────────────────────────────────────────
  function _renderNationChips(state) {
    const el = document.getElementById('cfg-nation-chips');
    if (!el) return;
    el.innerHTML = '';
    const available = ConfiguratorEngine.getAvailableNations();

    NATION_ORDER.forEach(nation => {
      const count = available[nation];
      if (count === undefined) return;
      const isActive = state.nation === nation;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cfg-chip af-chip--nation' + (isActive ? ' cfg-chip--active' : '') + (count === 0 ? ' cfg-chip--disabled' : '');
      btn.innerHTML = `${_flagImg(nation)}<span class="af-nation-name">${_esc(nation)}</span>`;
      if (count > 0) btn.addEventListener('click', () => { btn.blur(); ConfiguratorEngine.setNation(nation); });
      el.appendChild(btn);
    });
  }

  // ── Рендер списков танков ────────────────────────────────────
  function _renderTankLists(filterQuery) {
    const state = ConfiguratorEngine.getState();
    const hasSelected = state.tanks.length > 0;

    // ── Выбранные ──
    const selectedSection = document.getElementById('cfg-selected-section');
    const selectedList    = document.getElementById('cfg-selected-list');
    if (selectedSection && selectedList) {
      selectedSection.style.display = hasSelected ? '' : 'none';
      selectedList.innerHTML = '';
      state.tanks.forEach(name => {
        const info = ConfiguratorEngine.getState(); // just for icon
        selectedList.appendChild(_buildTankItem(name, null, true, true));
      });
    }

    // ── Доступные комбинации (только когда выбран хотя бы 1 танк) ──
    const combosSection = document.getElementById('cfg-combos-section');
    const combosList    = document.getElementById('cfg-combos-list');
    if (combosSection && combosList) {
      if (hasSelected) {
        const combos = ConfiguratorEngine.getCompatibleTanks();
        const entries = Object.entries(combos);

        // Применяем фильтр поиска к комбинациям тоже
        const filtered = filterQuery
          ? entries.filter(([name]) => name.toLowerCase().includes(filterQuery))
          : entries;

        filtered.sort(([,a],[,b]) => (b.count || 0) - (a.count || 0));

        combosSection.style.display = filtered.length > 0 ? '' : 'none';
        combosList.innerHTML = '';
        const shown = filtered.slice(0, 40);
        shown.forEach(([name, info]) => {
          combosList.appendChild(_buildTankItem(name, info, false, false));
        });
        if (filtered.length > 40) {
          const more = document.createElement('div');
          more.className = 'cfg-tank-more';
          more.textContent = `+${filtered.length - 40} — уточните фильтры`;
          combosList.appendChild(more);
        }
        if (shown.length === 0) {
          combosSection.style.display = 'none';
        }
      } else {
        combosSection.style.display = 'none';
      }
    }

    // ── Все доступные (когда нет выбранных — показываем навигацию) ──
    const availSection = document.getElementById('cfg-available-section');
    const availList    = document.getElementById('cfg-available-list');
    if (availSection && availList) {
      // Этот блок показываем всегда (для первоначального выбора)
      availSection.style.display = '';
      availList.innerHTML = '';

      const available = ConfiguratorEngine.getAvailableTanksInNavigator();
      let entries = Object.entries(available);

      if (filterQuery) {
        entries = entries.filter(([name]) => name.toLowerCase().includes(filterQuery));
      }

      entries.sort(([,a],[,b]) => (b.count || 0) - (a.count || 0));

      if (entries.length === 0) {
        if (state.tier || state.type || state.nation) {
          availList.innerHTML = '<div class="cfg-tank-empty">Нет доступных танков с такими фильтрами</div>';
        } else {
          availList.innerHTML = '';
          availSection.style.display = 'none';
        }
      } else {
        const shown = entries.slice(0, 50);
        shown.forEach(([name, info]) => {
          availList.appendChild(_buildTankItem(name, info, false, false));
        });
        if (entries.length > 50) {
          const more = document.createElement('div');
          more.className = 'cfg-tank-more';
          more.textContent = `+${entries.length - 50} — уточните фильтры`;
          availList.appendChild(more);
        }
      }
    }
  }

  function _buildTankItem(name, info, isSelected, isSelectedBlock) {
    // Получаем info из tanksData если не передан
    if (!info && typeof window._tanksData !== 'undefined') {
      info = window._tanksData[name] || {};
    }
    info = info || {};

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'cfg-tank-item' + (isSelected ? ' cfg-tank-item--active' : '');

    const iconUrl = info.icon && typeof assetUrl === 'function'
      ? assetUrl('icons/small/' + info.icon)
      : null;
    const imgHtml = iconUrl
      ? `<img src="${_esc(iconUrl)}" alt="${_esc(name)}" class="cfg-tank-icon" onerror="this.style.display='none'">`
      : `<span class="cfg-tank-no-icon">🛡</span>`;

    const tierBadge = info.tier ? `<span class="cfg-tank-tier">${info.tier}</span>` : '';
    const countBadge = (info.count && !isSelectedBlock)
      ? `<span class="cfg-tank-count">${info.count}</span>`
      : '';
    const removeIcon = isSelectedBlock
      ? `<span class="cfg-tank-remove">✕</span>`
      : '';

    item.innerHTML = `
      ${imgHtml}
      <span class="cfg-tank-name">${_esc(name)}</span>
      ${tierBadge}
      ${countBadge}
      ${removeIcon}
    `;

    item.addEventListener('click', () => {
      item.blur();
      ConfiguratorEngine.toggleTank(name);
    });

    return item;
  }

  // ── Рендер капсул ────────────────────────────────────────────
  function _renderCapsules(state) {
    const wrap = document.getElementById('cfg-capsules-wrap');
    const el   = document.getElementById('cfg-capsules');
    if (!wrap || !el) return;

    const capsules = ConfiguratorEngine.getActiveCapsules();
    wrap.style.display = capsules.length > 0 ? '' : 'none';
    el.innerHTML = '';

    capsules.forEach(cap => {
      const span = document.createElement('span');
      span.className = 'cfg-capsule';
      span.innerHTML = `<span class="cfg-capsule-label">${_esc(cap.label)}</span><button class="cfg-capsule-remove" aria-label="Удалить">✕</button>`;
      span.querySelector('.cfg-capsule-remove').addEventListener('click', () => {
        ConfiguratorEngine.removeParam(cap.type, cap.value);
      });
      el.appendChild(span);
    });
  }

  // ── Бейдж активных фильтров на тогглере ──────────────────────
  function _renderBadge(state) {
    const badge = document.getElementById('cfg-active-badge');
    if (!badge) return;
    const count = state.tanks.length +
      (state.tier ? 1 : 0) + (state.type ? 1 : 0) + (state.nation ? 1 : 0);
    if (count > 0) {
      badge.style.display = '';
      badge.textContent = count;
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Рендер диапазонов ────────────────────────────────────────
  function _renderRanges(state) {
    const options = ConfiguratorEngine.getAvailableOptions();
    _renderRange('cfg-price-range', 'price', options.price, state.priceMin, state.priceMax);
    _renderRange('cfg-bonds-range', 'bonds', options.bonds, state.bondsMin, state.bondsMax);
    _renderRange('cfg-gold-range',  'gold',  options.gold,  state.goldMin,  state.goldMax);
    _renderRange('cfg-silver-range','silver',options.silver,state.silverMin,state.silverMax);
  }

  function _renderRange(containerId, resourceKey, range, currentMin, currentMax) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const hasData = range && range.max > 0;
    if (!hasData) {
      el.innerHTML = '<span class="cfg-range-empty">нет данных</span>';
      return;
    }

    const minVal = currentMin !== null ? currentMin : '';
    const maxVal = currentMax !== null ? currentMax : '';

    el.innerHTML = `
      <input type="text" inputmode="numeric" pattern="[0-9]*" class="cfg-range-input" data-key="${resourceKey}" data-bound="min"
        placeholder="${Math.floor(range.min)}" value="${minVal}">
      <span class="cfg-range-dash">—</span>
      <input type="text" inputmode="numeric" pattern="[0-9]*" class="cfg-range-input" data-key="${resourceKey}" data-bound="max"
        placeholder="${Math.ceil(range.max)}" value="${maxVal}">
    `;

    el.querySelectorAll('.cfg-range-input').forEach(input => {
      const applyValue = () => {
        const key   = input.dataset.key;
        const bound = input.dataset.bound;
        let val = input.value === '' ? null : parseFloat(input.value.replace(/\s/g,'').replace(',','.'));
        if (val !== null && !isNaN(val)) {
          if (bound === 'min' && val < range.min) { val = range.min; input.value = val; }
          if (bound === 'min' && val > range.max) { val = range.max; input.value = val; }
          if (bound === 'max' && val < range.min) { val = range.min; input.value = val; }
          if (bound === 'max' && val > range.max) { val = range.max; input.value = val; }
        } else if (val !== null && isNaN(val)) {
          val = null; input.value = '';
        }
        const st = ConfiguratorEngine.getState();
        if (key === 'price') {
          ConfiguratorEngine.setPrice(
            bound === 'min' ? val : st.priceMin,
            bound === 'max' ? val : st.priceMax
          );
        } else {
          ConfiguratorEngine.setResources(key,
            bound === 'min' ? val : st[key + 'Min'],
            bound === 'max' ? val : st[key + 'Max']
          );
        }
      };
      input.addEventListener('change', applyValue);
      input.addEventListener('blur',   applyValue);
    });
  }

  function _plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  return { init };
})();
