/* ================================================================
   TANKNEXUS — adaptiveFilter.js
   Динамический адаптивный фильтр аккаунтов

   Источники данных:
     RESULT  → индексы (tanks/nation/tier/type_index)
     AVAILABLE, ресурсы, hasBattles → accounts_index
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

  // Индексы для RESULT (обратные: значение → [id,...])
  let _allLots      = [];
  let _tanksIndex   = {};  // tankName  → [lotId, ...]
  let _nationIndex  = {};  // nation    → [lotId, ...]
  let _tierIndex    = {};  // tier      → [lotId, ...]
  let _typeIndex    = {};  // type      → [lotId, ...]
  let _lotsById     = {};  // lotId     → lot (для scoreBase / поиска)

  // Forward-индекс аккаунтов: основной runtime-слой
  let _accountsIndex = {}; // lotId → { tanks, nations, tiers, types, price, bonds, gold, silver, hasBattles }

  let _onChangeCallback = null;

  // ── Инициализация ─────────────────────────────────────────────
  function init({ allLots, tanksIndex, nationIndex, tierIndex, typeIndex, accountsIndex }) {
    _allLots      = allLots      || [];
    _tanksIndex   = tanksIndex   || {};
    _nationIndex  = nationIndex  || {};
    _tierIndex    = tierIndex    || {};
    _typeIndex    = typeIndex    || {};
    _accountsIndex = accountsIndex || {};

    _lotsById = {};
    for (const lot of _allLots) {
      _lotsById[String(lot.id)] = lot;
    }
  }

  function onChange(cb) { _onChangeCallback = cb; }
  function _notify() { if (_onChangeCallback) _onChangeCallback(getResult()); }

  // ── Получение состояния ───────────────────────────────────────
  function getState() { return { ..._state }; }

  // ── Установка параметров ──────────────────────────────────────
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
    // Сбрасываем выбранные танки, которых нет в доступных нациях
    if (_state.nation.length > 0) {
      _state.tanks = _state.tanks.filter(t => {
        for (const id of Object.keys(_accountsIndex)) {
          const acc = _accountsIndex[id];
          if (acc.tanks.includes(t) && acc.nations.some(n => _state.nation.includes(n))) return true;
        }
        return false;
      });
    }
    _notify();
  }

  function toggleTier(tier) {
    _state.tier = _toggle(_state.tier, String(tier));
    if (_state.tier.length > 0) {
      _state.tanks = _state.tanks.filter(t => {
        for (const id of Object.keys(_accountsIndex)) {
          const acc = _accountsIndex[id];
          if (acc.tanks.includes(t) && acc.tiers.some(tr => _state.tier.includes(tr))) return true;
        }
        return false;
      });
    }
    _notify();
  }

  function toggleType(type) {
    _state.type = _toggle(_state.type, type);
    if (_state.type.length > 0) {
      _state.tanks = _state.tanks.filter(t => {
        for (const id of Object.keys(_accountsIndex)) {
          const acc = _accountsIndex[id];
          if (acc.tanks.includes(t) && acc.types.some(tp => _state.type.includes(tp))) return true;
        }
        return false;
      });
    }
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
      case 'search':   _state.search = ''; break;
      case 'scenario': _state.scenario = null; break;
      case 'tank':     _state.tanks = _state.tanks.filter(t => t !== value); break;
      case 'nation':   _state.nation = _state.nation.filter(n => n !== value); break;
      case 'tier':     _state.tier = _state.tier.filter(t => t !== value); break;
      case 'type':     _state.type = _state.type.filter(t => t !== value); break;
      case 'price':    _state.priceMin = null; _state.priceMax = null; break;
      case 'bonds':    _state.bondsMin = null; _state.bondsMax = null; break;
      case 'gold':     _state.goldMin  = null; _state.goldMax  = null; break;
      case 'silver':   _state.silverMin = null; _state.silverMax = null; break;
      case 'noBattles': _state.noBattles = false; break;
    }
    _notify();
  }

  function reset() {
    _state = {
      search: '', scenario: null, tanks: [], nation: [], tier: [], type: [],
      priceMin: null, priceMax: null,
      bondsMin: null, bondsMax: null,
      goldMin: null,  goldMax: null,
      silverMin: null, silverMax: null,
      noBattles: false,
    };
    _notify();
  }

  // ── Вспомогательные ──────────────────────────────────────────
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

  // ── RESULT: фильтрация через индексы ─────────────────────────
  // Возвращает массив id, прошедших индексную фильтрацию
  function _getFilteredIds() {
    let result = null; // null = "все"

    // 1. Сценарий (scoreBase из lot — не из accounts_index)
    if (_state.scenario && typeof FilterEngine !== 'undefined') {
      const scenario = FilterEngine.SCENARIOS.find(s => s.id === _state.scenario);
      if (scenario && scenario.type !== 'advanced') {
        const scenarioLots = FilterEngine.applyScenario(_allLots, scenario);
        result = _intersect(result, scenarioLots.map(l => String(l.id)));
      }
    }

    // 2. Поиск по тексту (по данным лота — не по accounts_index)
    if (_state.search) {
      const q = _normStr(_state.search);
      const searchIds = _allLots
        .filter(l => {
          const title  = _normStr(l.title || '');
          const tanks10 = _normStr(l.tanks10 || '');
          const prems  = (l.prems_8_9_array || []).map(t => _normStr(t)).join(' ');
          return title.includes(q) || tanks10.includes(q) || prems.includes(q);
        })
        .map(l => String(l.id));
      result = _intersect(result, searchIds);
    }

    // 3. Нации (обратный индекс)
    if (_state.nation.length > 0) {
      let nationIds = [];
      for (const nat of _state.nation) {
        const ids = (_nationIndex[nat] || []).map(String);
        nationIds = [...new Set([...nationIds, ...ids])];
      }
      result = _intersect(result, nationIds);
    }

    // 4. Уровни (обратный индекс)
    if (_state.tier.length > 0) {
      let tierIds = [];
      for (const tier of _state.tier) {
        const ids = (_tierIndex[tier] || []).map(String);
        tierIds = [...new Set([...tierIds, ...ids])];
      }
      result = _intersect(result, tierIds);
    }

    // 5. Типы (обратный индекс)
    if (_state.type.length > 0) {
      let typeIds = [];
      for (const tp of _state.type) {
        const ids = (_typeIndex[tp] || []).map(String);
        typeIds = [...new Set([...typeIds, ...ids])];
      }
      result = _intersect(result, typeIds);
    }

    // 6. Конкретные танки (обратный индекс, AND-логика)
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

  // ── Фильтрация по ресурсам и hasBattles через accounts_index ─
  // Принимает массив id, возвращает отфильтрованный массив id
  function _applyResourceFilters(ids) {
    const hasPrice  = _state.priceMin  !== null || _state.priceMax  !== null;
    const hasBonds  = _state.bondsMin  !== null || _state.bondsMax  !== null;
    const hasGold   = _state.goldMin   !== null || _state.goldMax   !== null;
    const hasSilver = _state.silverMin !== null || _state.silverMax !== null;

    if (!hasPrice && !hasBonds && !hasGold && !hasSilver && !_state.noBattles) {
      return ids; // ничего фильтровать
    }

    return ids.filter(id => {
      const acc = _accountsIndex[id];
      if (!acc) return true; // нет в индексе — не блокируем

      if (hasPrice) {
        if (_state.priceMin !== null && acc.price < _state.priceMin) return false;
        if (_state.priceMax !== null && acc.price > _state.priceMax) return false;
      }
      if (hasBonds) {
        if (_state.bondsMin !== null && acc.bonds < _state.bondsMin) return false;
        if (_state.bondsMax !== null && acc.bonds > _state.bondsMax) return false;
      }
      if (hasGold) {
        if (_state.goldMin !== null  && acc.gold  < _state.goldMin)  return false;
        if (_state.goldMax !== null  && acc.gold  > _state.goldMax)  return false;
      }
      if (hasSilver) {
        if (_state.silverMin !== null && acc.silver < _state.silverMin) return false;
        if (_state.silverMax !== null && acc.silver > _state.silverMax) return false;
      }
      if (_state.noBattles && acc.hasBattles) return false;

      return true;
    });
  }

  // ── Основной метод: RESULT ────────────────────────────────────
  function getResult() {
    let ids = _getFilteredIds();
    ids = _applyResourceFilters(ids);

    const idSet = new Set(ids);
    let lots = _allLots.filter(l => idSet.has(String(l.id)));

    // Скоринг и сортировка по сценарию
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

    return lots;
  }

  // ── AVAILABLE: агрегация через accounts_index ─────────────────
  // Вычисляет доступные опции по набору result-id
  // ignoreDimension: исключить одно измерение, чтобы оно "не блокировало само себя"
  function _computeAvailable(ids) {
    const nations = new Set();
    const tiers   = new Set();
    const types   = new Set();
    const tanks   = new Set();

    let priceMin = Infinity,  priceMax = -Infinity;
    let bondsMin = Infinity,  bondsMax = -Infinity;
    let goldMin  = Infinity,  goldMax  = -Infinity;
    let silverMin = Infinity, silverMax = -Infinity;

    for (const id of ids) {
      const acc = _accountsIndex[id];
      if (!acc) continue;

      for (const n of acc.nations) nations.add(n);
      for (const t of acc.tiers)   tiers.add(t);
      for (const t of acc.types)   types.add(t);
      for (const t of acc.tanks)   tanks.add(t);

      if (acc.price  > 0) { priceMin  = Math.min(priceMin,  acc.price);  priceMax  = Math.max(priceMax,  acc.price);  }
      if (acc.bonds  > 0) { bondsMin  = Math.min(bondsMin,  acc.bonds);  bondsMax  = Math.max(bondsMax,  acc.bonds);  }
      if (acc.gold   > 0) { goldMin   = Math.min(goldMin,   acc.gold);   goldMax   = Math.max(goldMax,   acc.gold);   }
      if (acc.silver > 0) { silverMin = Math.min(silverMin, acc.silver); silverMax = Math.max(silverMax, acc.silver); }
    }

    // Счётчики наций/уровней/типов (сколько лотов в result содержат значение)
    const idSet = new Set(ids);
    const nationsCount = {};
    const tiersCount   = {};
    const typesCount   = {};

    for (const nation of nations) {
      nationsCount[nation] = (_nationIndex[nation] || []).filter(id => idSet.has(String(id))).length;
    }
    for (const tier of tiers) {
      tiersCount[tier] = (_tierIndex[tier] || []).filter(id => idSet.has(String(id))).length;
    }
    for (const type of types) {
      typesCount[type] = (_typeIndex[type] || []).filter(id => idSet.has(String(id))).length;
    }

    const safe = v => isFinite(v) ? v : 0;

    return {
      nations: nationsCount,
      tiers:   tiersCount,
      types:   typesCount,
      tanks,
      price:  { min: safe(priceMin),  max: safe(priceMax)  },
      bonds:  { min: safe(bondsMin),  max: safe(bondsMax)  },
      gold:   { min: safe(goldMin),   max: safe(goldMax)   },
      silver: { min: safe(silverMin), max: safe(silverMax) },
      totalFiltered: ids.length,
    };
  }

  // ── Публичный метод: доступные опции фильтра ─────────────────
  // Не учитывает фильтры нации/уровня/типа (чтобы они не блокировали сами себя),
  // но учитывает сценарий, поиск и ресурсы.
  function getAvailableOptions() {
    // Базовые IDs: сценарий + поиск (без nation/tier/type/tanks)
    const baseIds = _getBaseIds();
    // Применяем ресурсы поверх базы
    const filteredIds = _applyResourceFilters(baseIds);

    return _computeAvailable(filteredIds);
  }

  // Базовые IDs: только сценарий + поиск (без dimension-фильтров)
  function _getBaseIds() {
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
          const title  = _normStr(l.title || '');
          const tanks10 = _normStr(l.tanks10 || '');
          const prems  = (l.prems_8_9_array || []).map(t => _normStr(t)).join(' ');
          return title.includes(q) || tanks10.includes(q) || prems.includes(q);
        })
        .map(l => String(l.id));
      result = _intersect(result, searchIds);
    }

    if (result === null) result = _allLots.map(l => String(l.id));
    return result;
  }

  // ── Доступные танки (с учётом текущей нации/уровня/типа) ─────
  function getAvailableTanks() {
    const ids = _getFilteredIds();
    const idSet = new Set(ids);

    // Собираем танки из accounts_index для id из result
    const tankCounts = {};
    for (const id of ids) {
      const acc = _accountsIndex[id];
      if (!acc) continue;
      for (const tankName of acc.tanks) {
        // Применяем фильтр по нации/уровню/типу аккаунта
        if (_state.nation.length > 0 && !acc.nations.some(n => _state.nation.includes(n))) continue;
        if (_state.tier.length   > 0 && !acc.tiers.some(t  => _state.tier.includes(t)))   continue;
        if (_state.type.length   > 0 && !acc.types.some(tp => _state.type.includes(tp)))  continue;

        tankCounts[tankName] = (tankCounts[tankName] || 0) + 1;
      }
    }
    return tankCounts;
  }

  // ── Активные капсулы (для UI) ─────────────────────────────────
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

    for (const tank of _state.tanks)
      capsules.push({ type: 'tank', value: tank, label: tank });
    for (const n of _state.nation)
      capsules.push({ type: 'nation', value: n, label: n });
    for (const t of _state.tier)
      capsules.push({ type: 'tier', value: t, label: `${t} ур.` });
    for (const tp of _state.type)
      capsules.push({ type: 'type', value: tp, label: tp });

    if (_state.priceMin !== null || _state.priceMax !== null)
      capsules.push({ type: 'price',  value: 'price',  label: `₽ ${_state.priceMin || '0'}–${_state.priceMax || '∞'}` });
    if (_state.bondsMin !== null || _state.bondsMax !== null)
      capsules.push({ type: 'bonds',  value: 'bonds',  label: `🔵 ${_state.bondsMin || '0'}–${_state.bondsMax || '∞'} бон.` });
    if (_state.goldMin !== null || _state.goldMax !== null)
      capsules.push({ type: 'gold',   value: 'gold',   label: `🟡 ${_state.goldMin || '0'}–${_state.goldMax || '∞'} зол.` });
    if (_state.silverMin !== null || _state.silverMax !== null)
      capsules.push({ type: 'silver', value: 'silver', label: `⚪ ${_state.silverMin || '0'}–${_state.silverMax || '∞'} сер.` });
    if (_state.noBattles)
      capsules.push({ type: 'noBattles', value: 'noBattles', label: '0 боёв' });

    return capsules;
  }

  function hasActiveFilters() {
    return (
      _state.search !== '' ||
      _state.scenario !== null ||
      _state.tanks.length > 0 ||
      _state.nation.length > 0 ||
      _state.tier.length > 0 ||
      _state.type.length > 0 ||
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
