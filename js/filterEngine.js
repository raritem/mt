/* ================================================================
   TANKNEXUS — filterEngine.js
   Сценарная система подбора лотов (preset scoring system)
   ================================================================ */

'use strict';

const FilterEngine = (() => {

  // ── Определения сценариев ─────────────────────────────────────
  const SCENARIOS = [
    {
      id: 'popular',
      emoji: '🎁',
      title: 'Не знаю что выбрать',
      subtitle: 'Аккаунты с техникой, которую чаще всего выбирают игроки',
      weights: { popular: 3, strong: 2, imba: 2, forgiving: 2, alpha: 1 },
      type: 'score',
    },
    {
      id: 'fat_start',
      emoji: '🚀',
      title: 'Жирный старт',
      subtitle: null, // подпись добавится позже
      weights: { imba: 3, strong: 3, alpha: 2 },
      type: 'score',
    },
    {
      id: 'many_prems',
      emoji: '💎',
      title: 'Много PREM танков',
      subtitle: 'От 14 PREM\'ов для разнообразия геймплея и стабильного фарма',
      weights: { popular: 2, rare: 1 },
      type: 'prems_count', // основная сортировка по prems_8_9_count
    },
    {
      id: 'newbie',
      emoji: '👶',
      title: 'Идеально для новичка',
      subtitle: 'Стабильная, сильная техника, которую легче освоить с первых боёв (прощает ошибки)',
      weights: { forgiving: 3, armor_heavy: 2, strong: 2, alpha: 1 },
      type: 'score',
    },
    {
      id: 'return',
      emoji: '🔄',
      title: 'Вернуться в игру',
      subtitle: 'Мощные новинки и старые машины, которые раскрылись в новом формате боёв ±1 уровень',
      weights: { new: 3, meta_buffed: 3, strong: 2, popular: 1 },
      type: 'score',
    },
    {
      id: 'unusual',
      emoji: '🧪',
      title: 'Необычный геймплей',
      subtitle: 'Танки с уникальной механикой — двустволки, ракеты, турбины и другие',
      weights: { mechanics: 3, strong: 2, imba: 2 },
      type: 'score',
    },
    {
      id: 'collector',
      emoji: '👑',
      title: 'Коллекционная техника',
      subtitle: 'Редкие танки, которые есть далеко не у всех',
      weights: { rare: 3, popular: 1, mechanics: 1 },
      type: 'score',
    },
    {
      id: 'twink',
      emoji: '📃',
      title: 'Твинк',
      subtitle: 'Чистая статистика без боёв',
      weights: { strong: 3, imba: 2, meta_buffed: 2, popular: 1 },
      type: 'score',
    },
    {
      id: 'advanced',
      emoji: '⚙️',
      title: 'Расширенный подбор',
      subtitle: 'Детальный фильтр по технике и другим параметрам',
      weights: {},
      type: 'advanced', // особый тип — будущий фильтр
    },
  ];

  // ── Расчёт score лота по сценарию ─────────────────────────────
  /**
   * @param {object} lot      - нормализованный лот (содержит scoreBase)
   * @param {object} scenario - сценарий из SCENARIOS
   * @returns {number}
   */
  function calculateLotScore(lot, scenario) {
    if (!scenario || !scenario.weights) return 0;
    const tagCounts = (lot.scoreBase && lot.scoreBase.tagCounts) ? lot.scoreBase.tagCounts : {};
    let score = 0;
    for (const [tag, weight] of Object.entries(scenario.weights)) {
      const count = tagCounts[tag] || 0;
      score += weight * count;
    }
    return score;
  }

  // ── Сортировка лотов ──────────────────────────────────────────
  /**
   * Финальная сортировка: score DESC → prems_8_9_count DESC → id ASC (стабильная)
   * @param {Array} lots
   * @returns {Array}
   */
  function sortLots(lots) {
    return [...lots].sort((a, b) => {
      // 1. score DESC
      const scoreDiff = (b._score || 0) - (a._score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      // 2. prems_8_9_count DESC
      const aPrems = a.prems_8_9_count != null ? a.prems_8_9_count : (a.premcount || 0);
      const bPrems = b.prems_8_9_count != null ? b.prems_8_9_count : (b.premcount || 0);
      const premsDiff = bPrems - aPrems;
      if (premsDiff !== 0) return premsDiff;
      // 3. id ASC (стабильная)
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
  }

  // ── Применить сценарий к набору лотов ─────────────────────────
  /**
   * @param {Array}  lots     - массив нормализованных лотов
   * @param {object} scenario - сценарий из SCENARIOS
   * @returns {Array} - отсортированный массив лотов с _score
   */
  function applyScenario(lots, scenario) {
    if (!scenario || scenario.type === 'advanced') return lots;

    const scored = lots.map(lot => {
      const score = calculateLotScore(lot, scenario);
      return { ...lot, _score: score };
    });

    if (scenario.type === 'prems_count') {
      // Сценарий "Много PREM'ов": основная сортировка по prems_8_9_count,
      // досортировка по score тегов
      return [...scored].sort((a, b) => {
        const aPrems = a.prems_8_9_count != null ? a.prems_8_9_count : (a.premcount || 0);
        const bPrems = b.prems_8_9_count != null ? b.prems_8_9_count : (b.premcount || 0);
        const premsDiff = bPrems - aPrems;
        if (premsDiff !== 0) return premsDiff;
        const scoreDiff = (b._score || 0) - (a._score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return String(a.id) < String(b.id) ? -1 : 1;
      });
    }

    return sortLots(scored);
  }

  // ── Публичный API ─────────────────────────────────────────────
  return {
    SCENARIOS,
    applyScenario,
    calculateLotScore,
    sortLots,
  };

})();
