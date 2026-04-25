/* ================================================================
   TANKNEXUS — adaptiveFilter.js
   Динамический адаптивный фильтр аккаунтов
   ================================================================ */

'use strict';

const AdaptiveFilter = (() => {

  // ── Состояние фильтра ─────────────────────────────────────────
  let _state = {
    search: '',          // поисковый запрос
    scenario: null,      // id активного сценария или null
    tanks: [],           // массив имён выбранных танков (AND-логика)
    nation: [],          // массив наций
    tier: [],            // массив уровней (строки: '5','6',...,'10')
    type: [],            // массив типов ('ТТ','СТ','ЛТ','ПТ','САУ')
    priceMin: null,      // мин. цена
    priceMax: null,      // макс. цена
    bondsMin: null,
    bondsMax: null,
    goldMin: null,
    goldMax: null,
    silverMin: null,
    silverMax: null,
    noBattles: false,    // чекбокс "без боёв"
  };

  // Индексы и данные (заполняются при инициализации)
  let _allLots = [];
  let _tanksIndex = {};    // tankName -> [lotId, ...]
  let _nationIndex = {};   // nation -> [lotId, ...]
  let _tierIndex = {};     // tier -> [lotId, ...]
  let _typeIndex = {};     // type -> [lotId, ...]
  let _lotsById = {};      // lotId -> lot
  let _tanksData = {};     // tankName -> { tier, type, nation, tags, ... }

  let _onChangeCallback = null;

  // ── Кэш вычислений (сбрасывается при каждом изменении state) ──
  let _cache = null;

  function _invalidateCache() {
    _cache = null;
  }

  // Получить (или вычислить) Set ID без навигационных фильтров
  function _getNoNavIdSet() {
    if (_cache && _cache.noNavIdSet) return _cache.noNavIdSet;
    if (!_cache) _cache = {};
    _cache.noNavIdSet = _getFilteredIds_noNav();
    return _cache.noNavIdSet;
  }

  // ── Инициализация ─────────────────────────────────────────────
  function init({ allLots, tanksIndex, nationIndex, tierIndex, typeIndex, tanksData }) {
    _allLots = allLots || [];
    _tanksIndex = tanksIndex || {};
    _nationIndex = nationIndex || {};
    _tierIndex = tierIndex || {};
    _typeIndex = typeIndex || {};
    _tanksData = tanksData || {};

    // Строим лоты по ID
    _lotsById = {};
    for (const lot of _allLots) {
      _lotsById[String(lot.id)] = lot;
    }
  }

  function onChange(cb) {
    _onChangeCallback = cb;
  }

  let _notifyTimer = null;
  function _notify() {
    _invalidateCache();
    if (!_onChangeCallback) return;
    // Debounce: схлопываем серию быстрых изменений в один вызов
    if (_notifyTimer) clearTimeout(_notifyTimer);
    _notifyTimer = setTimeout(() => {
      _notifyTimer = null;
      if (_onChangeCallback) _onChangeCallback(getResult());
    }, 40);
  }

  // ── Получение состояния ───────────────────────────────────────
  function getState() {
    return { ..._state };
  }

  // ── Установка отдельных параметров ────────────────────────────
  function setSearch(query) {
    _state.search = (query || '').trim();
    _notify();
  }

  function setScenario(scenarioId) {
    _state.scenario = scenarioId || null;
    _notify();
  }

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

  function toggleNation(nation) {
    _state.nation = _toggle(_state.nation, nation);
    _notify();
  }

  function toggleTier(tier) {
    _state.tier = _toggle(_state.tier, String(tier));
    _notify();
  }

  function toggleType(type) {
    _state.type = _toggle(_state.type, type);
    _notify();
  }

  function setPrice(min, max) {
    _state.priceMin = min;
    _state.priceMax = max;
    _notify();
  }

  function setResources(type, min, max) {
    // type: 'bonds' | 'gold' | 'silver'
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
      case 'search': _state.search = ''; break;
      case 'scenario': _state.scenario = null; break;
      case 'tank': _state.tanks = _state.tanks.filter(t => t !== value); break;
      case 'nation': _state.nation = _state.nation.filter(n => n !== value); break;
      case 'tier': _state.tier = _state.tier.filter(t => t !== value); break;
      case 'type': _state.type = _state.type.filter(t => t !== value); break;
      case 'price': _state.priceMin = null; _state.priceMax = null; break;
      case 'bonds': _state.bondsMin = null; _state.bondsMax = null; break;
      case 'gold': _state.goldMin = null; _state.goldMax = null; break;
      case 'silver': _state.silverMin = null; _state.silverMax = null; break;
      case 'noBattles': _state.noBattles = false; break;
    }
    _notify();
  }

  function reset() {
    _state = {
      search: '', scenario: null, tanks: [], nation: [], tier: [], type: [],
      priceMin: null, priceMax: null,
      bondsMin: null, bondsMax: null,
      goldMin: null, goldMax: null,
      silverMin: null, silverMax: null,
      noBattles: false,
    };
    _notify();
  }

  // ── Вспомогательная: toggle элемента в массиве ────────────────
  function _toggle(arr, val) {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  // ── Пересечение массивов ID ────────────────────────────────────
  function _intersect(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    const setB = new Set(b);
    return a.filter(id => setB.has(id));
  }

  function _getFilteredIds() {
    // Берём базу из кэша (сценарий + поиск + танки)
    const baseIdSet = _getNoNavIdSet();
    return [...baseIdSet];
  }

  function _normStr(str) {
    if (!str) return '';
    return String(str).toLowerCase().trim();
  }

  // ── Фильтрация лотов по ресурсам и цене ──────────────────────
  function _applyLotFilters(lots) {
    return lots.filter(lot => {
      // Цена
      if (_state.priceMin !== null || _state.priceMax !== null) {
        const price = _parseNum(lot.price);
        if (_state.priceMin !== null && price < _state.priceMin) return false;
        if (_state.priceMax !== null && price > _state.priceMax) return false;
      }
      // Боны
      if (_state.bondsMin !== null || _state.bondsMax !== null) {
        const bonds = _parseNum((lot.resources || {}).bonds);
        if (_state.bondsMin !== null && bonds < _state.bondsMin) return false;
        if (_state.bondsMax !== null && bonds > _state.bondsMax) return false;
      }
      // Золото
      if (_state.goldMin !== null || _state.goldMax !== null) {
        const gold = _parseNum((lot.resources || {}).gold);
        if (_state.goldMin !== null && gold < _state.goldMin) return false;
        if (_state.goldMax !== null && gold > _state.goldMax) return false;
      }
      // Серебро
      if (_state.silverMin !== null || _state.silverMax !== null) {
        const silver = _parseNum((lot.resources || {}).silver);
        if (_state.silverMin !== null && silver < _state.silverMin) return false;
        if (_state.silverMax !== null && silver > _state.silverMax) return false;
      }
      // Без боёв
      if (_state.noBattles) {
        const nb = lot.no_battles === true || lot.no_battles === 'true' || lot.no_battles === 'Без боёв';
        if (!nb) return false;
      }
      return true;
    });
  }

  function _parseNum(val) {
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // ── Основной метод: получить отфильтрованный список лотов ─────
  function getResult() {
    const ids = _getFilteredIds();
    const idSet = new Set(ids);

    // Получаем объекты лотов в порядке из _allLots
    let lots = _allLots.filter(l => idSet.has(String(l.id)));

    // Применяем скоринг сценария (для сортировки)
    if (_state.scenario && typeof FilterEngine !== 'undefined') {
      const scenario = FilterEngine.SCENARIOS.find(s => s.id === _state.scenario);
      if (scenario && scenario.type !== 'advanced') {
        lots = lots.map(lot => ({
          ...lot,
          _score: FilterEngine.calculateLotScore(lot, scenario),
        }));
        if (scenario.type === 'prems_count') {
          lots.sort((a, b) => {
            const d = (b.premcount || 0) - (a.premcount || 0);
            return d !== 0 ? d : (b._score || 0) - (a._score || 0);
          });
        } else {
          lots.sort((a, b) => {
            const d = (b._score || 0) - (a._score || 0);
            return d !== 0 ? d : (b.premcount || 0) - (a.premcount || 0);
          });
        }
      }
    }

    // Применяем фильтры по цене/ресурсам (не через индекс)
    lots = _applyLotFilters(lots);

    return lots;
  }

  // ── Доступные опции фильтра (для динамического UI) ────────────
  function getAvailableOptions() {
    const baseIdSet = _getNoNavIdSet();
    const filteredLots = _applyLotFilters(
      _allLots.filter(l => baseIdSet.has(String(l.id)))
    );
    const filteredIds = new Set(filteredLots.map(l => String(l.id)));

    // Нации/уровни/типы — считаем только по отфильтрованным лотам
    // (т.е. нации, которые реально присутствуют на аккаунтах с выбранными танками)
    const nations = {};
    for (const [nation, ids] of Object.entries(_nationIndex)) {
      const count = ids.filter(id => filteredIds.has(String(id))).length;
      if (count > 0) nations[nation] = count;
    }

    const tiers = {};
    for (const [tier, ids] of Object.entries(_tierIndex)) {
      const count = ids.filter(id => filteredIds.has(String(id))).length;
      if (count > 0) tiers[tier] = count;
    }

    const types = {};
    for (const [tp, ids] of Object.entries(_typeIndex)) {
      const count = ids.filter(id => filteredIds.has(String(id))).length;
      if (count > 0) types[tp] = count;
    }

    const prices = filteredLots.map(l => _parseNum(l.price)).filter(x => x > 0);
    const bonds  = filteredLots.map(l => _parseNum((l.resources || {}).bonds)).filter(x => x > 0);
    const gold   = filteredLots.map(l => _parseNum((l.resources || {}).gold)).filter(x => x > 0);
    const silver = filteredLots.map(l => _parseNum((l.resources || {}).silver)).filter(x => x > 0);

    return {
      nations,
      tiers,
      types,
      price:  { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
      bonds:  { min: bonds.length  ? Math.min(...bonds)  : 0, max: bonds.length  ? Math.max(...bonds)  : 0 },
      gold:   { min: gold.length   ? Math.min(...gold)   : 0, max: gold.length   ? Math.max(...gold)   : 0 },
      silver: { min: silver.length ? Math.min(...silver) : 0, max: silver.length ? Math.max(...silver) : 0 },
      totalFiltered: filteredLots.length,
    };
  }

  // IDs без учёта навигационных (nation/tier/type) — для расчёта доступных опций
  function _getFilteredIds_noNav() {
    let result = null;

    if (_state.scenario && typeof FilterEngine !== 'undefined') {
      const scenario = FilterEngine.SCENARIOS.find(s => s.id === _state.scenario);
      if (scenario && scenario.type !== 'advanced') {
        const scenarioLots = FilterEngine.applyScenario(_allLots, scenario);
        result = _intersect(result, scenarioLots.map(l => String(l.id)));
      }
    }

    if (_state.search) {
      const q = _normStr(_state.search);
      const searchIds = _allLots
        .filter(l => {
          const title = _normStr(l.title || '');
          const tanks10 = _normStr(l.tanks10 || '');
          const prems = (l.prems_8_9_array || []).map(t => _normStr(t)).join(' ');
          return title.includes(q) || tanks10.includes(q) || prems.includes(q);
        })
        .map(l => String(l.id));
      result = _intersect(result, searchIds);
    }

    if (_state.tanks.length > 0) {
      for (const tankName of _state.tanks) {
        const ids = (_tanksIndex[tankName] || []).map(String);
        result = _intersect(result, ids);
      }
    }

    if (result === null) result = _allLots.map(l => String(l.id));
    return new Set(result);
  }

  // ── Доступные танки для выбора (с учётом навигации нация/уровень/тип) ──
  function getAvailableTanks() {
    const baseIdSet = _getNoNavIdSet();

    const tankCounts = {};
    for (const [tankName, lotIds] of Object.entries(_tanksIndex)) {
      const count = lotIds.filter(id => baseIdSet.has(String(id))).length;
      const info = _tanksData[tankName];
      if (!info) continue;

      // Уже выбранный танк — всегда включаем (не скрываем при смене навигации)
      const isSelected = _state.tanks.includes(tankName);

      if (!isSelected) {
        // Невыбранный — показываем только если проходит навигационные фильтры
        if (_state.nation.length > 0 && !_state.nation.includes(info.nation)) continue;
        if (_state.tier.length > 0 && !_state.tier.includes(String(info.tier))) continue;
        if (_state.type.length > 0 && !_state.type.includes(info.type)) continue;
        if (count === 0) continue; // нет аккаунтов с этим танком
      }

      tankCounts[tankName] = { count, ...info };
    }
    return tankCounts;
  }

  // ── Активные капсулы (для отображения в UI) ──────────────────
  function getActiveCapsules() {
    const capsules = [];

    if (_state.scenario) {
      const scenario = typeof FilterEngine !== 'undefined'
        ? FilterEngine.SCENARIOS.find(s => s.id === _state.scenario) : null;
      capsules.push({
        type: 'scenario',
        value: _state.scenario,
        label: scenario ? `${scenario.emoji} ${scenario.title}` : _state.scenario,
      });
    }

    if (_state.search) {
      const short = _state.search.length > 12 ? _state.search.slice(0, 12) + '…' : _state.search;
      capsules.push({ type: 'search', value: _state.search, label: `🔍 ${short}` });
    }

    // Только выбранные танки — реальные фильтры аккаунтов
    for (const tank of _state.tanks) {
      capsules.push({ type: 'tank', value: tank, label: tank });
    }

    // nation/tier/type — навигационные, в капсулы НЕ добавляются

    if (_state.priceMin !== null || _state.priceMax !== null) {
      const label = `₽ ${_state.priceMin || '0'}–${_state.priceMax || '∞'}`;
      capsules.push({ type: 'price', value: 'price', label });
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
      _state.search !== '' ||
      _state.scenario !== null ||
      _state.tanks.length > 0 ||
      _state.priceMin !== null || _state.priceMax !== null ||
      _state.bondsMin !== null || _state.bondsMax !== null ||
      _state.goldMin !== null  || _state.goldMax !== null  ||
      _state.silverMin !== null || _state.silverMax !== null ||
      _state.noBattles
    );
  }

  // ── Публичный API ─────────────────────────────────────────────
  return {
    init,
    onChange,
    getState,
    setSearch,
    setScenario,
    toggleTank,
    removeTank,
    toggleNation,
    toggleTier,
    toggleType,
    setPrice,
    setResources,
    setNoBattles,
    removeParam,
    reset,
    getResult,
    getAvailableOptions,
    getAvailableTanks,
    getActiveCapsules,
    hasActiveFilters,
  };

})();
