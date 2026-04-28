/* ================================================================
   TANKNEXUS — adaptiveConfigurator.js
   Конфигуратор аккаунтов — полностью независимый дубликат
   логики адаптивного фильтра.
   НЕ зависит от AdaptiveFilter, FilterUI, FilterEngine.
   ================================================================ */

'use strict';

const AdaptiveConfigurator = (() => {

  // ── Состояние конфигуратора ───────────────────────────────────
  let _state = {
    tanks:     [],    // массив имён выбранных танков (AND-логика)
    nation:    [],    // массив наций
    tier:      [],    // массив уровней (строки: '5','6',...,'10')
    type:      [],    // массив типов ('ТТ','СТ','ЛТ','ПТ','САУ')
    priceMin:  null,
    priceMax:  null,
    bondsMin:  null,
    bondsMax:  null,
    goldMin:   null,
    goldMax:   null,
    silverMin: null,
    silverMax: null,
    noBattles: false,
  };

  // Данные (заполняются при инициализации)
  let _allLots   = [];
  let _tanksIndex  = {};   // tankName -> [lotId, ...]
  let _nationIndex = {};   // nation   -> [lotId, ...]
  let _tierIndex   = {};   // tier     -> [lotId, ...]
  let _typeIndex   = {};   // type     -> [lotId, ...]
  let _tanksData   = {};   // tankName -> { tier, type, nation, tags, icon, ... }

  let _onChangeCallback = null;

  // ── Инициализация ─────────────────────────────────────────────
  function init({ allLots, tanksIndex, nationIndex, tierIndex, typeIndex, tanksData }) {
    _allLots     = allLots     || [];
    _tanksIndex  = tanksIndex  || {};
    _nationIndex = nationIndex || {};
    _tierIndex   = tierIndex   || {};
    _typeIndex   = typeIndex   || {};
    _tanksData   = tanksData   || {};
  }

  function onChange(cb) {
    _onChangeCallback = cb;
  }

  function _notify() {
    if (_onChangeCallback) _onChangeCallback(getResult());
  }

  // ── Получение состояния ───────────────────────────────────────
  function getState() {
    return { ..._state };
  }

  // ── Установка параметров ──────────────────────────────────────
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
      case 'tank':     _state.tanks  = _state.tanks.filter(t => t !== value); break;
      case 'nation':   _state.nation = _state.nation.filter(n => n !== value); break;
      case 'tier':     _state.tier   = _state.tier.filter(t => t !== value); break;
      case 'type':     _state.type   = _state.type.filter(t => t !== value); break;
      case 'price':    _state.priceMin  = null; _state.priceMax  = null; break;
      case 'bonds':    _state.bondsMin  = null; _state.bondsMax  = null; break;
      case 'gold':     _state.goldMin   = null; _state.goldMax   = null; break;
      case 'silver':   _state.silverMin = null; _state.silverMax = null; break;
      case 'noBattles': _state.noBattles = false; break;
    }
    _notify();
  }

  function reset() {
    _state = {
      tanks: [], nation: [], tier: [], type: [],
      priceMin: null, priceMax: null,
      bondsMin: null, bondsMax: null,
      goldMin:  null, goldMax:  null,
      silverMin: null, silverMax: null,
      noBattles: false,
    };
    _notify();
  }

  // ── Вспомогательные ───────────────────────────────────────────
  function _toggle(arr, val) {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

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

  // ── Основная фильтрация через индексы ─────────────────────────
  // tier/nation/type используются только для сужения списка техники в UI
  function _getFilteredIds() {
    let result = null;

    // Конкретные танки (AND-логика)
    if (_state.tanks.length > 0) {
      for (const tankName of _state.tanks) {
        const ids = (_tanksIndex[tankName] || []).map(String);
        result = _intersect(result, ids);
      }
    }

    if (result === null) {
      result = _allLots.map(l => String(l.id));
    }

    return result;
  }

  // ── Фильтрация лотов по ресурсам и цене ──────────────────────
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

  // ── Основной метод: получить отфильтрованный список лотов ─────
  function getResult() {
    const ids = _getFilteredIds();
    const idSet = new Set(ids);
    let lots = _allLots.filter(l => idSet.has(String(l.id)));
    lots = _applyLotFilters(lots);
    return lots;
  }

  // Танки без аккаунтов в текущей выборке (для визуала капсул)
  function getInactiveTanks() {
    const ids = _getFilteredIds();
    const idSet = new Set(ids);
    return _state.tanks.filter(tankName => {
      const lotIds = (_tanksIndex[tankName] || []).map(String);
      return !lotIds.some(id => idSet.has(id));
    });
  }

  // ── Доступные опции (faceted search) ─────────────────────────
  function getAvailableOptions() {
    function _idsWithout(withoutDimension) {
      let result = null;

      // Выбранные танки
      for (const tankName of _state.tanks) {
        result = _intersect(result, (_tanksIndex[tankName] || []).map(String));
      }
      // Tier
      if (withoutDimension !== 'tier' && _state.tier.length > 0) {
        let ids = [];
        for (const t of _state.tier) ids = [...new Set([...ids, ...(_tierIndex[t] || []).map(String)])];
        result = _intersect(result, ids);
      }
      // Nation
      if (withoutDimension !== 'nation' && _state.nation.length > 0) {
        let ids = [];
        for (const n of _state.nation) ids = [...new Set([...ids, ...(_nationIndex[n] || []).map(String)])];
        result = _intersect(result, ids);
      }
      // Type
      if (withoutDimension !== 'type' && _state.type.length > 0) {
        let ids = [];
        for (const tp of _state.type) ids = [...new Set([...ids, ...(_typeIndex[tp] || []).map(String)])];
        result = _intersect(result, ids);
      }

      if (result === null) result = _allLots.map(l => String(l.id));
      return new Set(result);
    }

    const idsForTier   = _idsWithout('tier');
    const idsForNation = _idsWithout('nation');
    const idsForType   = _idsWithout('type');

    const tiers = {};
    for (const [tier, lotIds] of Object.entries(_tierIndex)) {
      const count = lotIds.filter(id => idsForTier.has(String(id))).length;
      if (count > 0) tiers[tier] = count;
    }

    const nations = {};
    for (const [nation, lotIds] of Object.entries(_nationIndex)) {
      const count = lotIds.filter(id => idsForNation.has(String(id))).length;
      if (count > 0) nations[nation] = count;
    }

    const types = {};
    for (const [tp, lotIds] of Object.entries(_typeIndex)) {
      const count = lotIds.filter(id => idsForType.has(String(id))).length;
      if (count > 0) types[tp] = count;
    }

    const currentIds = _getFilteredIds();
    const currentIdSet = new Set(currentIds);
    const filteredLots = _applyLotFilters(_allLots.filter(l => currentIdSet.has(String(l.id))));

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

  // ── Доступные танки (с учётом нации/уровня/типа) ─────────────
  function getAvailableTanks() {
    const ids = _getFilteredIds();
    const idSet = new Set(ids);

    const tankCounts = {};
    for (const [tankName, lotIds] of Object.entries(_tanksIndex)) {
      const info = _tanksData[tankName];
      if (!info) continue;

      const isSelected = _state.tanks.includes(tankName);
      if (isSelected) {
        const count = lotIds.filter(id => idSet.has(String(id))).length;
        tankCounts[tankName] = { count, ...info };
        continue;
      }

      const count = lotIds.filter(id => idSet.has(String(id))).length;
      if (count > 0) {
        if (_state.nation.length > 0 && !_state.nation.includes(info.nation)) continue;
        if (_state.tier.length > 0   && !_state.tier.includes(String(info.tier))) continue;
        if (_state.type.length > 0   && !_state.type.includes(info.type)) continue;
        tankCounts[tankName] = { count, ...info };
      }
    }
    return tankCounts;
  }

  // ── Активные капсулы ──────────────────────────────────────────
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
      _state.priceMin  !== null || _state.priceMax  !== null ||
      _state.bondsMin  !== null || _state.bondsMax  !== null ||
      _state.goldMin   !== null || _state.goldMax   !== null ||
      _state.silverMin !== null || _state.silverMax !== null ||
      _state.noBattles
    );
  }

  // ── Публичный API ─────────────────────────────────────────────
  return {
    init,
    onChange,
    getState,
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
    getInactiveTanks,
    getAvailableOptions,
    getAvailableTanks,
    getActiveCapsules,
    hasActiveFilters,
  };

})();
