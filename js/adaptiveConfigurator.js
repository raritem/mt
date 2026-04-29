/* ================================================================
   TANKNEXUS — adaptiveConfigurator.js
   Динамический адаптивный конфигуратор аккаунтов
   ПОЛНОСТЬЮ ИЗОЛИРОВАННАЯ КОПИЯ adaptiveFilter.js
   Не импортирует, не вызывает, не зависит от AdaptiveFilter
   ================================================================ */

'use strict';

const ConfiguratorFilter = (() => {

  // ── Состояние конфигуратора ───────────────────────────────────
  let _configuratorState = {
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
  let _configuratorAllLots = [];
  let _configuratorTanksIndex = {};    // tankName -> [lotId, ...]
  let _configuratorNationIndex = {};   // nation -> [lotId, ...]
  let _configuratorTierIndex = {};     // tier -> [lotId, ...]
  let _configuratorTypeIndex = {};     // type -> [lotId, ...]
  let _configuratorLotsById = {};      // lotId -> lot
  let _configuratorTanksData = {};     // tankName -> { tier, type, nation, tags, ... }

  let _configuratorOnChangeCallback = null;

  // ── Инициализация ─────────────────────────────────────────────
  function init({ allLots, tanksIndex, nationIndex, tierIndex, typeIndex, tanksData }) {
    _configuratorAllLots = allLots || [];
    _configuratorTanksIndex = tanksIndex || {};
    _configuratorNationIndex = nationIndex || {};
    _configuratorTierIndex = tierIndex || {};
    _configuratorTypeIndex = typeIndex || {};
    _configuratorTanksData = tanksData || {};

    // Строим лоты по ID
    _configuratorLotsById = {};
    for (const lot of _configuratorAllLots) {
      _configuratorLotsById[String(lot.id)] = lot;
    }
  }

  function onChange(cb) {
    _configuratorOnChangeCallback = cb;
  }

  function _configuratorNotify() {
    if (_configuratorOnChangeCallback) _configuratorOnChangeCallback(getResult());
  }

  // ── Получение состояния ───────────────────────────────────────
  function getState() {
    return { ..._configuratorState };
  }

  // ── Установка отдельных параметров ────────────────────────────
  function setSearch(query) {
    _configuratorState.search = (query || '').trim();
    _configuratorNotify();
  }

  function setScenario(scenarioId) {
    _configuratorState.scenario = scenarioId || null;
    _configuratorNotify();
  }

  function toggleTank(tankName) {
    const idx = _configuratorState.tanks.indexOf(tankName);
    if (idx === -1) _configuratorState.tanks = [..._configuratorState.tanks, tankName];
    else _configuratorState.tanks = _configuratorState.tanks.filter(t => t !== tankName);
    _configuratorNotify();
  }

  function removeTank(tankName) {
    _configuratorState.tanks = _configuratorState.tanks.filter(t => t !== tankName);
    _configuratorNotify();
  }

  function toggleNation(nation) {
    // Радио-режим: выбор одного, повторный клик — снять
    _configuratorState.nation = _configuratorState.nation.includes(nation) ? [] : [nation];
    _configuratorNotify();
  }

  function toggleTier(tier) {
    // Радио-режим: выбор одного, повторный клик — снять
    _configuratorState.tier = _configuratorState.tier.includes(String(tier)) ? [] : [String(tier)];
    _configuratorNotify();
  }

  function toggleType(type) {
    // Радио-режим: выбор одного, повторный клик — снять
    _configuratorState.type = _configuratorState.type.includes(type) ? [] : [type];
    _configuratorNotify();
  }

  function setPrice(min, max) {
    _configuratorState.priceMin = min;
    _configuratorState.priceMax = max;
    _configuratorNotify();
  }

  function setResources(type, min, max) {
    // type: 'bonds' | 'gold' | 'silver'
    _configuratorState[type + 'Min'] = min;
    _configuratorState[type + 'Max'] = max;
    _configuratorNotify();
  }

  function setNoBattles(val) {
    _configuratorState.noBattles = !!val;
    _configuratorNotify();
  }

  function removeParam(paramType, value) {
    switch (paramType) {
      case 'search': _configuratorState.search = ''; break;
      case 'scenario': _configuratorState.scenario = null; break;
      case 'tank': _configuratorState.tanks = _configuratorState.tanks.filter(t => t !== value); break;
      case 'nation': _configuratorState.nation = _configuratorState.nation.filter(n => n !== value); break;
      case 'tier': _configuratorState.tier = _configuratorState.tier.filter(t => t !== value); break;
      case 'type': _configuratorState.type = _configuratorState.type.filter(t => t !== value); break;
      case 'price': _configuratorState.priceMin = null; _configuratorState.priceMax = null; break;
      case 'bonds': _configuratorState.bondsMin = null; _configuratorState.bondsMax = null; break;
      case 'gold': _configuratorState.goldMin = null; _configuratorState.goldMax = null; break;
      case 'silver': _configuratorState.silverMin = null; _configuratorState.silverMax = null; break;
      case 'noBattles': _configuratorState.noBattles = false; break;
    }
    _configuratorNotify();
  }

  function reset() {
    _configuratorState = {
      search: '', scenario: null, tanks: [], nation: [], tier: [], type: [],
      priceMin: null, priceMax: null,
      bondsMin: null, bondsMax: null,
      goldMin: null, goldMax: null,
      silverMin: null, silverMax: null,
      noBattles: false,
    };
    _configuratorNotify();
  }

  // ── Вспомогательная: toggle элемента в массиве ────────────────
  function _configuratorToggle(arr, val) {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  }

  // ── Пересечение массивов ID ────────────────────────────────────
  function _configuratorIntersect(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    const setB = new Set(b);
    return a.filter(id => setB.has(id));
  }

  // ── Основная фильтрация через индексы ─────────────────────────
  // tier/nation/type НЕ фильтруют аккаунты — они используются только для
  // сужения списка техники внутри панели конфигуратора (см. getAvailableTanks, _configuratorIdsWithout).
  function _configuratorGetFilteredIds() {
    let result = null; // null = все

    // 1. Сценарий
    if (_configuratorState.scenario && typeof FilterEngine !== 'undefined') {
      const scenario = FilterEngine.SCENARIOS.find(s => s.id === _configuratorState.scenario);
      if (scenario && scenario.type !== 'advanced') {
        const scenarioLots = FilterEngine.applyScenario(_configuratorAllLots, scenario);
        result = _configuratorIntersect(result, scenarioLots.map(l => String(l.id)));
      }
    }

    // 2. Поиск
    if (_configuratorState.search) {
      const q = _configuratorNormStr(_configuratorState.search);
      const searchIds = _configuratorAllLots
        .filter(l => {
          const title = _configuratorNormStr(l.title || '');
          const tanks10 = _configuratorNormStr(l.tanks10 || '');
          const prems = (l.prems_8_9_array || []).map(t => _configuratorNormStr(t)).join(' ');
          return title.includes(q) || tanks10.includes(q) || prems.includes(q);
        })
        .map(l => String(l.id));
      result = _configuratorIntersect(result, searchIds);
    }

    // 3. Конкретные танки (AND-логика)
    if (_configuratorState.tanks.length > 0) {
      for (const tankName of _configuratorState.tanks) {
        const ids = (_configuratorTanksIndex[tankName] || []).map(String);
        result = _configuratorIntersect(result, ids);
      }
    }

    // 4. Если результат null — возвращаем все IDs
    if (result === null) {
      result = _configuratorAllLots.map(l => String(l.id));
    }

    return result;
  }

  function _configuratorNormStr(str) {
    if (!str) return '';
    return String(str).toLowerCase().trim();
  }

  // ── Фильтрация лотов по ресурсам и цене ──────────────────────
  function _configuratorApplyLotFilters(lots) {
    return lots.filter(lot => {
      // Цена
      if (_configuratorState.priceMin !== null || _configuratorState.priceMax !== null) {
        const price = _configuratorParseNum(lot.price);
        if (_configuratorState.priceMin !== null && price < _configuratorState.priceMin) return false;
        if (_configuratorState.priceMax !== null && price > _configuratorState.priceMax) return false;
      }
      // Боны
      if (_configuratorState.bondsMin !== null || _configuratorState.bondsMax !== null) {
        const bonds = _configuratorParseNum((lot.resources || {}).bonds);
        if (_configuratorState.bondsMin !== null && bonds < _configuratorState.bondsMin) return false;
        if (_configuratorState.bondsMax !== null && bonds > _configuratorState.bondsMax) return false;
      }
      // Золото
      if (_configuratorState.goldMin !== null || _configuratorState.goldMax !== null) {
        const gold = _configuratorParseNum((lot.resources || {}).gold);
        if (_configuratorState.goldMin !== null && gold < _configuratorState.goldMin) return false;
        if (_configuratorState.goldMax !== null && gold > _configuratorState.goldMax) return false;
      }
      // Серебро
      if (_configuratorState.silverMin !== null || _configuratorState.silverMax !== null) {
        const silver = _configuratorParseNum((lot.resources || {}).silver);
        if (_configuratorState.silverMin !== null && silver < _configuratorState.silverMin) return false;
        if (_configuratorState.silverMax !== null && silver > _configuratorState.silverMax) return false;
      }
      // Без боёв
      if (_configuratorState.noBattles) {
        const nb = lot.no_battles === true || lot.no_battles === 'true' || lot.no_battles === 'Без боёв';
        if (!nb) return false;
      }
      return true;
    });
  }

  function _configuratorParseNum(val) {
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // ── Основной метод: получить отфильтрованный список лотов ─────
  function getResult() {
    const ids = _configuratorGetFilteredIds();
    const idSet = new Set(ids);

    // Получаем объекты лотов в порядке из _configuratorAllLots
    let lots = _configuratorAllLots.filter(l => idSet.has(String(l.id)));

    // Применяем скоринг сценария (для сортировки)
    if (_configuratorState.scenario && typeof FilterEngine !== 'undefined') {
      const scenario = FilterEngine.SCENARIOS.find(s => s.id === _configuratorState.scenario);
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
    lots = _configuratorApplyLotFilters(lots);

    return lots;
  }

  // Возвращает имена выбранных танков, у которых 0 аккаунтов в текущей выборке
  // (используется UI для визуального выделения «недоступных» капсул)
  function getInactiveTanks() {
    const ids = _configuratorGetFilteredIds();
    const idSet = new Set(ids);
    return _configuratorState.tanks.filter(tankName => {
      const lotIds = (_configuratorTanksIndex[tankName] || []).map(String);
      return !lotIds.some(id => idSet.has(id));
    });
  }

  // ── Доступные опции конфигуратора (для динамического UI) ──────
  // Классический faceted search: для каждого измерения (tier/nation/type)
  // показываем только те значения, которые реально встречаются в лотах,
  // прошедших через ВСЕ остальные активные фильтры (кроме самого этого измерения).
  //
  // Таким образом:
  // - Нельзя выбрать уровень, который не встречается среди аккаунтов с выбранными танками
  // - После выбора типа — показываем только нации/уровни, которые есть среди аккаунтов
  //   с этим типом И выбранными танками
  // - Нет парадоксов: ни расширения, ни пустых результатов после клика
  function getAvailableOptions() {
    // Вспомогательная: получить Set ID лотов, прошедших через все фильтры КРОМЕ одного измерения
    // withoutDimension: 'tier' | 'nation' | 'type'
    function _configuratorIdsWithout(withoutDimension) {
      let result = null;

      // Сценарий
      if (_configuratorState.scenario && typeof FilterEngine !== 'undefined') {
        const scenario = FilterEngine.SCENARIOS.find(s => s.id === _configuratorState.scenario);
        if (scenario && scenario.type !== 'advanced') {
          result = _configuratorIntersect(result, FilterEngine.applyScenario(_configuratorAllLots, scenario).map(l => String(l.id)));
        }
      }
      // Поиск
      if (_configuratorState.search) {
        const q = _configuratorNormStr(_configuratorState.search);
        const searchIds = _configuratorAllLots.filter(l => {
          return _configuratorNormStr(l.title || '').includes(q) ||
                 _configuratorNormStr(l.tanks10 || '').includes(q) ||
                 (l.prems_8_9_array || []).some(t => _configuratorNormStr(t).includes(q));
        }).map(l => String(l.id));
        result = _configuratorIntersect(result, searchIds);
      }
      // Выбранные танки
      for (const tankName of _configuratorState.tanks) {
        result = _configuratorIntersect(result, (_configuratorTanksIndex[tankName] || []).map(String));
      }
      // Tier (если не исключаем)
      if (withoutDimension !== 'tier' && _configuratorState.tier.length > 0) {
        let ids = [];
        for (const t of _configuratorState.tier) ids = [...new Set([...ids, ...(_configuratorTierIndex[t] || []).map(String)])];
        result = _configuratorIntersect(result, ids);
      }
      // Nation (если не исключаем)
      if (withoutDimension !== 'nation' && _configuratorState.nation.length > 0) {
        let ids = [];
        for (const n of _configuratorState.nation) ids = [...new Set([...ids, ...(_configuratorNationIndex[n] || []).map(String)])];
        result = _configuratorIntersect(result, ids);
      }
      // Type (если не исключаем)
      if (withoutDimension !== 'type' && _configuratorState.type.length > 0) {
        let ids = [];
        for (const tp of _configuratorState.type) ids = [...new Set([...ids, ...(_configuratorTypeIndex[tp] || []).map(String)])];
        result = _configuratorIntersect(result, ids);
      }

      if (result === null) result = _configuratorAllLots.map(l => String(l.id));

      // Применяем фильтры из блока "Дополнительно" (noBattles, цена, ресурсы)
      // Эти параметры имеют ПРИОРИТЕТ: сначала фильтрация по ним, потом пересчёт техники
      const resultSet = new Set(result);
      const lotsForDimension = _configuratorAllLots.filter(l => resultSet.has(String(l.id)));
      const filteredForDimension = _configuratorApplyLotFilters(lotsForDimension);
      return new Set(filteredForDimension.map(l => String(l.id)));
    }

    // Базовые наборы для каждого измерения
    const idsForTier   = _configuratorIdsWithout('tier');
    const idsForNation = _configuratorIdsWithout('nation');
    const idsForType   = _configuratorIdsWithout('type');

    // Все уровни — всегда показываем, count=0 → недоступен (серый, некликабельный)
    const tiers = {};
    for (const [tier, lotIds] of Object.entries(_configuratorTierIndex)) {
      tiers[tier] = lotIds.filter(id => idsForTier.has(String(id))).length;
    }

    // Все нации
    const nations = {};
    for (const [nation, lotIds] of Object.entries(_configuratorNationIndex)) {
      nations[nation] = lotIds.filter(id => idsForNation.has(String(id))).length;
    }

    // Все типы
    const types = {};
    for (const [tp, lotIds] of Object.entries(_configuratorTypeIndex)) {
      types[tp] = lotIds.filter(id => idsForType.has(String(id))).length;
    }

    // Диапазоны цен/ресурсов — по текущей полной фильтрации
    const currentIds = _configuratorGetFilteredIds();
    const currentIdSet = new Set(currentIds);
    const filteredLots = _configuratorApplyLotFilters(_configuratorAllLots.filter(l => currentIdSet.has(String(l.id))));

    const prices = filteredLots.map(l => _configuratorParseNum(l.price)).filter(x => x > 0);
    const bonds  = filteredLots.map(l => _configuratorParseNum((l.resources || {}).bonds)).filter(x => x > 0);
    const gold   = filteredLots.map(l => _configuratorParseNum((l.resources || {}).gold)).filter(x => x > 0);
    const silver = filteredLots.map(l => _configuratorParseNum((l.resources || {}).silver)).filter(x => x > 0);

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

  // Базовые IDs: сценарий + поиск + выбранные танки (без tier/nation/type)
  // Используется как основа для вычисления доступных опций.
  function _configuratorGetBaseIds() {
    let result = null;

    // Сценарий
    if (_configuratorState.scenario && typeof FilterEngine !== 'undefined') {
      const scenario = FilterEngine.SCENARIOS.find(s => s.id === _configuratorState.scenario);
      if (scenario && scenario.type !== 'advanced') {
        const scenarioLots = FilterEngine.applyScenario(_configuratorAllLots, scenario);
        result = _configuratorIntersect(result, scenarioLots.map(l => String(l.id)));
      }
    }

    // Поиск
    if (_configuratorState.search) {
      const q = _configuratorNormStr(_configuratorState.search);
      const searchIds = _configuratorAllLots
        .filter(l => {
          const title = _configuratorNormStr(l.title || '');
          const tanks10 = _configuratorNormStr(l.tanks10 || '');
          const prems = (l.prems_8_9_array || []).map(t => _configuratorNormStr(t)).join(' ');
          return title.includes(q) || tanks10.includes(q) || prems.includes(q);
        })
        .map(l => String(l.id));
      result = _configuratorIntersect(result, searchIds);
    }

    // Выбранные танки — включаем в базу, чтобы доступные tier/nation/type
    // вычислялись только среди аккаунтов, на которых есть эти танки
    if (_configuratorState.tanks.length > 0) {
      for (const tankName of _configuratorState.tanks) {
        const ids = (_configuratorTanksIndex[tankName] || []).map(String);
        result = _configuratorIntersect(result, ids);
      }
    }

    if (result === null) result = _configuratorAllLots.map(l => String(l.id));
    return result;
  }

  // ── Доступные танки для выбора (с учётом нации/уровня/типа) ──
  function getAvailableTanks() {
    const ids = _configuratorGetFilteredIds();
    const idSet = new Set(ids);

    const tankCounts = {};
    for (const [tankName, lotIds] of Object.entries(_configuratorTanksIndex)) {
      const info = _configuratorTanksData[tankName];
      if (!info) continue;

      // Выбранный пользователем танк — защищённый слой:
      // всегда отображается в списке как активный, даже если текущие фильтры
      // уровня/нации/типа его не включают.
      const isSelected = _configuratorState.tanks.includes(tankName);
      if (isSelected) {
        const count = lotIds.filter(id => idSet.has(String(id))).length;
        tankCounts[tankName] = { count, ...info };
        continue;
      }

      // Для не-выбранных танков применяем фильтрацию по нации/уровню/типу
      const count = lotIds.filter(id => idSet.has(String(id))).length;
      if (count > 0) {
        if (_configuratorState.nation.length > 0 && !_configuratorState.nation.includes(info.nation)) continue;
        if (_configuratorState.tier.length > 0 && !_configuratorState.tier.includes(String(info.tier))) continue;
        if (_configuratorState.type.length > 0 && !_configuratorState.type.includes(info.type)) continue;
        tankCounts[tankName] = { count, ...info };
      }
    }
    return tankCounts;
  }

  // ── Активные капсулы (для отображения в UI) ──────────────────
  function getActiveCapsules() {
    const capsules = [];

    if (_configuratorState.scenario) {
      const scenario = typeof FilterEngine !== 'undefined'
        ? FilterEngine.SCENARIOS.find(s => s.id === _configuratorState.scenario) : null;
      capsules.push({
        type: 'scenario',
        value: _configuratorState.scenario,
        label: scenario ? `${scenario.emoji} ${scenario.title}` : _configuratorState.scenario,
      });
    }

    if (_configuratorState.search) {
      const short = _configuratorState.search.length > 12 ? _configuratorState.search.slice(0, 12) + '…' : _configuratorState.search;
      capsules.push({ type: 'search', value: _configuratorState.search, label: `🔍 ${short}` });
    }

    for (const tank of _configuratorState.tanks) {
      capsules.push({ type: 'tank', value: tank, label: tank });
    }

    // tier/nation/type — вспомогательные фильтры для панели техники,
    // не порождают капсулы и не считаются «активными фильтрами»

    if (_configuratorState.priceMin !== null || _configuratorState.priceMax !== null) {
      const label = `₽ ${_configuratorState.priceMin || '0'}–${_configuratorState.priceMax || '∞'}`;
      capsules.push({ type: 'price', value: 'price', label });
    }

    if (_configuratorState.bondsMin !== null || _configuratorState.bondsMax !== null) {
      capsules.push({ type: 'bonds', value: 'bonds', label: `🔵 ${_configuratorState.bondsMin || '0'}–${_configuratorState.bondsMax || '∞'} бон.` });
    }

    if (_configuratorState.goldMin !== null || _configuratorState.goldMax !== null) {
      capsules.push({ type: 'gold', value: 'gold', label: `🟡 ${_configuratorState.goldMin || '0'}–${_configuratorState.goldMax || '∞'} зол.` });
    }

    if (_configuratorState.silverMin !== null || _configuratorState.silverMax !== null) {
      capsules.push({ type: 'silver', value: 'silver', label: `⚪ ${_configuratorState.silverMin || '0'}–${_configuratorState.silverMax || '∞'} сер.` });
    }

    if (_configuratorState.noBattles) {
      capsules.push({ type: 'noBattles', value: 'noBattles', label: '0 боёв' });
    }

    return capsules;
  }

  function hasActiveFilters() {
    return (
      _configuratorState.search !== '' ||
      _configuratorState.scenario !== null ||
      _configuratorState.tanks.length > 0 ||
      _configuratorState.priceMin !== null || _configuratorState.priceMax !== null ||
      _configuratorState.bondsMin !== null || _configuratorState.bondsMax !== null ||
      _configuratorState.goldMin !== null  || _configuratorState.goldMax !== null  ||
      _configuratorState.silverMin !== null || _configuratorState.silverMax !== null ||
      _configuratorState.noBattles
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
    getInactiveTanks,
    getAvailableOptions,
    getAvailableTanks,
    getActiveCapsules,
    hasActiveFilters,
  };

})();
