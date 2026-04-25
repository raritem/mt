/* ================================================================
   TANKNEXUS — Precompute (precompute.js)
   Генерирует индексные файлы для быстрой фильтрации лотов.
   Вызывается после каждого импорта CSV файлов.

   Создаёт /data/indexes/:
     tanks_index.json  — { "ИС-7": ["id1", "id5"], … }
     nation_index.json — { "СССР": ["id1"], … }
     tier_index.json   — { "8": ["id1", "id2"], … }
     type_index.json   — { "ТТ": ["id1"], … }
   ================================================================ */

const Precompute = (() => {
  'use strict';

  /**
   * Строит все четыре индекса из набора лотов и карты танков.
   *
   * @param {object} lots     - объект { [id]: { data: { all_tanks: [] } } }
   * @param {object} tanksMap - объект из tanks.json: { [tankName]: { tier, type, nation, … } }
   * @returns {{ tanksIndex, nationIndex, tierIndex, typeIndex }}
   */
  function buildIndexes(lots, tanksMap) {
    // Используем Map для накопления, в конце превратим в plain-объекты
    const tanksIndex  = {};  // tankName  → Set<id>
    const nationIndex = {};  // nation    → Set<id>
    const tierIndex   = {};  // tier(str) → Set<id>
    const typeIndex   = {};  // type      → Set<id>

    // Вспомогательная функция: добавить id в группу, создав её при необходимости
    function addToIndex(index, key, id) {
      if (!key && key !== 0) return; // пропускаем пустые ключи
      const k = String(key);
      if (!index[k]) index[k] = new Set();
      index[k].add(id);
    }

    for (const [id, lot] of Object.entries(lots)) {
      // Работаем только с активными лотами (inactive уже не актуальны)
      if (lot.status === 'inactive') continue;

      const allTanks = (lot.data && Array.isArray(lot.data.all_tanks))
        ? lot.data.all_tanks
        : [];

      for (const tankName of allTanks) {
        // 1. tanks_index: прямой индекс по имени танка
        addToIndex(tanksIndex, tankName, id);

        // 2–4. nation / tier / type из tanks.json
        const info = tanksMap[tankName];

        if (!info) {
          // Танк не найден в tanks.json — пропускаем без ошибки
          continue;
        }

        addToIndex(nationIndex, info.nation, id);
        addToIndex(tierIndex,   info.tier,   id);
        addToIndex(typeIndex,   info.type,   id);
      }
    }

    // Конвертируем Set → отсортированный массив (предсказуемый порядок, нет дублей)
    function setsToArrays(index) {
      const result = {};
      for (const [key, set] of Object.entries(index)) {
        result[key] = [...set].sort();
      }
      return result;
    }

    return {
      tanksIndex:  setsToArrays(tanksIndex),
      nationIndex: setsToArrays(nationIndex),
      tierIndex:   setsToArrays(tierIndex),
      typeIndex:   setsToArrays(typeIndex),
    };
  }

  /**
   * Строит forward-индекс аккаунтов для быстрой фильтрации и расчёта available options.
   *
   * @param {object} lots     - объект { [id]: { data: { all_tanks, price, bonds, gold, silver }, no_battles } }
   * @param {object} tanksMap - объект из tanks.json: { [tankName]: { tier, type, nation, … } }
   * @returns {object} accountsIndex - { [accountId]: { tanks, nations, tiers, types, price, bonds, gold, silver, hasBattles } }
   */
  function buildAccountsIndex(lots, tanksMap) {
    const accountsIndex = {};

    for (const [id, lot] of Object.entries(lots)) {
      // Пропускаем неактивные лоты
      if (lot.status === 'inactive') continue;

      const data = lot.data || {};
      const allTanks = Array.isArray(data.all_tanks) ? data.all_tanks : [];

      // Собираем уникальные nations/tiers/types через Set для скорости
      const nationsSet = new Set();
      const tiersSet   = new Set();
      const typesSet   = new Set();

      for (const tankName of allTanks) {
        const info = tanksMap[tankName];
        if (!info) continue; // танк не найден в tanks.json — пропускаем

        if (info.nation) nationsSet.add(String(info.nation));
        if (info.tier   || info.tier === 0) tiersSet.add(String(info.tier));
        if (info.type)  typesSet.add(String(info.type));
      }

      // Ресурсы — приводим к числам
      const price  = Number(data.price)  || 0;
      const bonds  = Number(data.bonds)  || 0;
      const gold   = Number(data.gold)   || 0;
      const silver = Number(data.silver) || 0;

      // hasBattles: true если у лота ЕСТЬ бои (no_battles === false)
      // Используем тот же флаг, что проставляет importer.js
      const hasBattles = !(lot.no_battles === true || lot.no_battles === 'true' || lot.no_battles === 'Без боёв');

      accountsIndex[id] = {
        tanks:   allTanks,
        nations: [...nationsSet],
        tiers:   [...tiersSet],
        types:   [...typesSet],
        price,
        bonds,
        gold,
        silver,
        hasBattles,
      };
    }

    return accountsIndex;
  }

  /**
   * Основная точка входа: строит индексы и сохраняет их на GitHub.
   *
   * @param {object}   lots        - lots из обновлённого lots.json
   * @param {object}   tanksMap    - объект из tanks.json
   * @param {function} onProgress  - колбэк(msg) для прогресса
   * @returns {Promise<{ tanksIndex, nationIndex, tierIndex, typeIndex, accountsIndex }>}
   */
  async function run(lots, tanksMap, onProgress = () => {}) {
    onProgress('Precompute: строю индексы…');

    const { tanksIndex, nationIndex, tierIndex, typeIndex } = buildIndexes(lots, tanksMap);
    const accountsIndex = buildAccountsIndex(lots, tanksMap);

    const indexFiles = [
      { path: 'data/indexes/tanks_index.json',    data: tanksIndex    },
      { path: 'data/indexes/nation_index.json',   data: nationIndex   },
      { path: 'data/indexes/tier_index.json',     data: tierIndex     },
      { path: 'data/indexes/type_index.json',     data: typeIndex     },
      { path: 'data/indexes/accounts_index.json', data: accountsIndex },
    ];

    const summary = {
      tanks:    Object.keys(tanksIndex).length,
      nations:  Object.keys(nationIndex).length,
      tiers:    Object.keys(tierIndex).length,
      types:    Object.keys(typeIndex).length,
      accounts: Object.keys(accountsIndex).length,
    };

    onProgress(
      `Precompute: уникальных танков ${summary.tanks}, ` +
      `наций ${summary.nations}, тиров ${summary.tiers}, типов ${summary.types}, ` +
      `аккаунтов ${summary.accounts}`
    );

    // Сохраняем на GitHub (идемпотентно — просто перезаписываем)
    if (window.GH && GH.isConfigured()) {
      onProgress('Precompute: сохраняю индексы на GitHub…');
      for (const { path, data } of indexFiles) {
        try {
          await GH.writeJSON(path, data, 'Precompute: update ' + path.split('/').pop());
        } catch (err) {
          // Не ломаем процесс если один файл не сохранился — логируем и продолжаем
          console.warn(`[Precompute] Не удалось сохранить ${path}:`, err.message);
        }
      }
      onProgress('Precompute: индексы обновлены ✓');
    } else {
      // GitHub не настроен — просто возвращаем результат (для тестов / dev)
      onProgress('Precompute: GitHub не настроен, индексы сгенерированы локально');
    }

    return { tanksIndex, nationIndex, tierIndex, typeIndex, accountsIndex };
  }

  /**
   * Загрузить один индексный файл (для использования в main.js / quickview.js).
   *
   * @param {'tanks'|'nation'|'tier'|'type'} name
   * @returns {Promise<object>} - содержимое индекса
   */
  async function loadIndex(name) {
    const path = `../data/indexes/${name}_index.json`;
    try {
      if (window.GH && GH.isConfigured()) {
        const { data } = await GH.readJSON(`data/indexes/${name}_index.json`);
        return data || {};
      }
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      console.warn(`[Precompute] Не удалось загрузить индекс ${name}:`, err.message);
      return {};
    }
  }

  /**
   * Пересечение нескольких массивов ID.
   * Используется фильтром: intersection([idsByNation, idsByTier]) → итоговый список.
   *
   * @param {string[][]} arrays
   * @returns {string[]}
   */
  function intersect(arrays) {
    if (!arrays || arrays.length === 0) return [];
    if (arrays.length === 1) return [...arrays[0]];
    const [first, ...rest] = arrays;
    const result = new Set(first);
    for (const arr of rest) {
      const s = new Set(arr);
      for (const id of result) {
        if (!s.has(id)) result.delete(id);
      }
    }
    return [...result];
  }

  return { run, buildIndexes, buildAccountsIndex, loadIndex, intersect };
})();
