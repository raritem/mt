/* ================================================================
   TANKNEXUS — filterEngine.js
   Сценарная система подбора лотов (preset scoring system)
   ================================================================ */

'use strict';

const FilterEngine = (() => {

  // ── Определения сценариев ─────────────────────────────────────
  //
  // requirements:
  //   min_tags:     { tag: minCount }  — лот должен иметь tagCounts[tag] >= minCount
  //   any_of:       [{ tag, min }]     — хотя бы одно условие должно быть true
  //   min_fields:   { field: minValue } — числовое поле лота >= minValue
  //   boolean:      { field: true/false } — булево поле лота === значение
  //   majority:     [tags]             — count(any of tags) >= count(not any of tags)
  //   majority_any: [[tags], [tags]]   — count(union of groups) >= count(rest); хотя бы 1 группа
  //
  const SCENARIOS = [
    {
      id: 'popular',
      emoji: '🎁',
      title: 'Не знаю что выбрать',
      subtitle: 'Аккаунты с техникой, которую чаще всего выбирают игроки',
      requirements: {
        min_tags: { popular: 1 },
      },
      weights: { popular: 10, strongest: 3, strong: 2, imba: 3, forgiving: 2, alpha: 1 },
      type: 'score',
      tankFilter: { tags: ['popular', 'imba', 'strongest', 'strong', 'forgiving'] },
    },
    {
      id: 'fat_start',
      emoji: '🚀',
      title: 'Жирный старт',
      subtitle: 'Аккаунты с самой мощной премиум техникой для быстрого старта',
      requirements: {
        any_of: [
          { tag: 'imba', min: 1 },
          { tag: 'strongest', min: 1 },
          { tag: 'strong', min: 1 },
        ],
      },
      weights: { imba: 10, strongest: 10, strong: 3, alpha: 2 },
      type: 'score',
      tankFilter: { tags: ['imba', 'strongest', 'strong'] },
    },
    {
      id: 'many_prems',
      emoji: '💎',
      title: 'Много PREM танков',
      subtitle: "От 14 PREM'ов для разнообразия геймплея и стабильного фарма",
      requirements: {
        min_fields: { premcount: 14 },
      },
      weights: { imba: 10, strongest: 10, strong: 3, alpha: 2, popular: 2, rare: 1 },
      type: 'prems_count',
      hideBadge: true,
    },
    {
      id: 'newbie',
      emoji: '👶',
      title: 'Идеально для новичка',
      subtitle: 'Стабильная, сильная техника, которую легче освоить с первых боёв (прощает ошибки)',
      requirements: {
        min_tags: { forgiving: 1 },
      },
      weights: { forgiving: 10, armor_heavy: 2, strong: 2, strongest: 3, alpha: 1 },
      type: 'score',
      tankFilter: { tags: ['forgiving'] },
    },
    {
      id: 'return',
      emoji: '🔄',
      title: 'Вернуться в игру',
      subtitle: 'Мощные новинки и старые машины, которые раскрылись в новом формате боёв ±1 уровень',
      requirements: {
        any_of: [
          { tag: 'new', min: 1 },
          { tag: 'meta_buffed', min: 1 },
        ],
      },
      weights: { new: 10, meta_buffed: 10, strong: 2, strongest: 3, popular: 1 },
      type: 'score',
      tankFilter: { tags: ['new', 'meta_buffed'] },
    },
    {
      id: 'unusual',
      emoji: '🧪',
      title: 'Необычный геймплей',
      subtitle: 'Танки с уникальной механикой — двустволки, ракеты, турбины и другие',
      requirements: {
        min_tags: { mechanics: 1 },
      },
      weights: { mechanics: 10, strongest: 3, strong: 2, imba: 2 },
      type: 'score',
      tankFilter: { tags: ['mechanics'] },
    },
    {
      id: 'collector',
      emoji: '👑',
      title: 'Коллекционная техника',
      subtitle: 'Редкие танки, которые есть далеко не у всех',
      requirements: {
        min_tags: { rare: 1 },
      },
      weights: { rare: 10, popular: 1, mechanics: 1 },
      type: 'score',
      tankFilter: { tags: ['rare'] },
    },
    {
      id: 'twink',
      emoji: '📃',
      title: 'Твинк',
      subtitle: 'Чистая статистика без боёв',
      requirements: {
        boolean: { no_battles: true },
      },
      weights: { imba: 10, strongest: 10, strong: 3, meta_buffed: 2, alpha: 2 },
      type: 'score',
    },
    {
      id: 'close_combat',
      emoji: '🧱',
      title: 'Ближний бой',
      subtitle: 'Тяжёлая и штурмовая техника для агрессивной игры в ближнем бою',
      requirements: {
        min_tags: { close_combat: 1 },
      },
      weights: { close_combat: 10, imba: 3, strongest: 3, strong: 2, armor_medium: 2, armor_heavy: 2, alpha: 2 },
      type: 'score',
      tankFilter: { tags: ['close_combat'] },
    },
    {
      id: 'sniper',
      emoji: '🥷',
      title: 'Снайперский стиль',
      subtitle: 'Точная и дальнобойная техника для игры со второй линии',
      requirements: {
        min_tags: { sniper_top: 1 },
      },
      weights: { sniper_top: 10, sniper_medium: 2, imba: 3, strongest: 3, strong: 2, alpha: 1 },
      type: 'score',
      tankFilter: { tags: ['sniper_top', 'sniper_medium'] },
    },
    {
      id: 'advanced',
      emoji: '⚙️',
      title: 'Расширенный подбор',
      subtitle: 'Детальный фильтр по технике и другим параметрам',
      requirements: {},
      weights: {},
      type: 'advanced',
    },
  ];

  // ── Вспомогательная: нормализовать no_battles ─────────────────
  function normalizeBool(val) {
    return val === true || val === 'true' || val === 'Без боёв';
  }

  // ── Проверка requirements лота ────────────────────────────────
  /**
   * Возвращает true если лот проходит все requirements сценария.
   * @param {object} lot      - нормализованный лот
   * @param {object} scenario - сценарий из SCENARIOS
   * @returns {boolean}
   */
  function lotPassesRequirements(lot, scenario) {
    if (!scenario || !scenario.requirements) return true;
    const req = scenario.requirements;
    const tagCounts = (lot.scoreBase && lot.scoreBase.tagCounts) ? lot.scoreBase.tagCounts : {};

    // min_tags: все условия обязательны
    if (req.min_tags) {
      for (const [tag, minCount] of Object.entries(req.min_tags)) {
        if ((tagCounts[tag] || 0) < minCount) return false;
      }
    }

    // any_of: хотя бы одно условие должно выполняться
    if (req.any_of && req.any_of.length > 0) {
      const anyPassed = req.any_of.some(cond => {
        return (tagCounts[cond.tag] || 0) >= (cond.min || 1);
      });
      if (!anyPassed) return false;
    }

    // majority: count(теги из списка) >= count(остальных танков)
    // Иными словами: count_matching >= total / 2
    // (если total нечётное — count_matching >= ceil(total/2))
    if (req.majority && req.majority.length > 0) {
      const matchingTags = new Set(req.majority);
      // Считаем общее количество танков (сумма всех тегов / кол-во уник. танков не известно,
      // поэтому считаем через scoreBase.totalTanks если есть, иначе через сумму тегов)
      const total = (lot.scoreBase && lot.scoreBase.totalTanks) ? lot.scoreBase.totalTanks : null;
      let countMatching = 0;
      for (const tag of matchingTags) {
        countMatching += (tagCounts[tag] || 0);
      }
      if (total !== null) {
        // Используем точный счётчик танков
        const countOther = total - countMatching;
        if (countMatching < countOther) return false;
      } else {
        // Fallback: считаем сумму всех тегов
        let totalTagSum = 0;
        for (const cnt of Object.values(tagCounts)) totalTagSum += cnt;
        // Оцениваем: matching >= total - matching → matching * 2 >= total
        if (countMatching * 2 < totalTagSum) return false;
      }
    }

    // min_fields: числовые поля лота
    if (req.min_fields) {
      for (const [field, minVal] of Object.entries(req.min_fields)) {
        const lotVal = lot[field] !== undefined ? Number(lot[field]) : 0;
        if (lotVal < minVal) return false;
      }
    }

    // boolean: булевы поля лота
    if (req.boolean) {
      for (const [field, expectedVal] of Object.entries(req.boolean)) {
        const lotVal = lot[field];
        const normalizedLotVal = normalizeBool(lotVal);
        if (normalizedLotVal !== expectedVal) return false;
      }
    }

    return true;
  }

  // ── Расчёт score лота по сценарию ─────────────────────────────
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
  function sortLots(lots) {
    return [...lots].sort((a, b) => {
      const scoreDiff = (b._score || 0) - (a._score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const premsDiff = (b.premcount || 0) - (a.premcount || 0);
      if (premsDiff !== 0) return premsDiff;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
  }

  // ── Применить сценарий к набору лотов ─────────────────────────
  /**
   * Пайплайн: 1) requirements → 2) scoring → 3) sorting
   */
  function applyScenario(lots, scenario) {
    if (!scenario || scenario.type === 'advanced') return lots;

    // Шаг 1: фильтрация
    const filtered = lots.filter(lot => lotPassesRequirements(lot, scenario));

    // Шаг 2: скоринг
    const scored = filtered.map(lot => ({
      ...lot,
      _score: calculateLotScore(lot, scenario),
    }));

    // Шаг 3: сортировка
    if (scenario.type === 'prems_count') {
      return [...scored].sort((a, b) => {
        const premsDiff = (b.premcount || 0) - (a.premcount || 0);
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
    lotPassesRequirements,
    normalizeBool,
  };

})();
