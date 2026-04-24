/* ================================================================
   TANKNEXUS — CSV Importer (importer.js)
   Импорт и синхронизация лотов из accounts.csv
   Использует config.json для маппинга колонок — без хардкода индексов!
   ================================================================ */

const CSVImporter = (() => {
  'use strict';

  // ── Утилиты ──────────────────────────────────────────────────
  function todayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function daysBetween(dateStrA, dateStrB) {
    const a = new Date(dateStrA);
    const b = new Date(dateStrB);
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  // ── Парсинг CSV ───────────────────────────────────────────────
  // Простой RFC-4180 парсер: поддерживает кавычки и запятые внутри полей
  function parseCSV(text) {
    const rows = [];
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = [];
      let inQuote = false;
      let cur = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = !inQuote;
        } else if (ch === ',' && !inQuote) {
          cols.push(cur.trim()); cur = '';
        } else {
          cur += ch;
        }
      }
      cols.push(cur.trim());
      rows.push(cols);
    }
    return rows;
  }

  // ── Нормализация списка танков ────────────────────────────────
  // "Tank A, Tank B" → ["Tank A", "Tank B"]
  // Уже массив — возвращаем как есть (чистим от пустых строк)
  function normalizeTanks(val) {
    if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
    if (!val || !String(val).trim()) return [];
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
  }

  // ── Определить onFunpay по ссылке ─────────────────────────────
  function detectOnFunpay(link) {
    if (!link) return false;
    const l = String(link).trim().toLowerCase();
    if (!l) return false;
    if (l.includes('funpay.com/lots/')) return true;
    return false;
  }

  // ── Загрузить config.json ─────────────────────────────────────
  async function loadConfig() {
    // Пробуем сначала через GH (если настроен), потом локально
    try {
      if (window.GH && GH.isConfigured()) {
        const { data } = await GH.readJSON('config.json');
        if (data && data.accounts) return data;
      }
    } catch (_) {}
    // Фоллбэк: загрузить из корня сайта
    const res = await fetch('../config.json');
    if (!res.ok) throw new Error('Не удалось загрузить config.json');
    return res.json();
  }

  // ── Загрузить tanks.json ──────────────────────────────────────
  async function loadTanks() {
    try {
      if (window.GH && GH.isConfigured()) {
        const { data } = await GH.readJSON('data/tanks.json');
        if (data && data.tanks) return data.tanks;
      }
    } catch (_) {}
    const res = await fetch('../data/tanks.json');
    if (!res.ok) throw new Error('Не удалось загрузить tanks.json');
    const json = await res.json();
    return json.tanks || {};
  }

  // ── Нормализация isPrem ───────────────────────────────────────
  // "Прем" → true, любое другое значение или пусто → false
  function normalizeIsPrem(val) {
    return String(val || '').trim() === 'Прем';
  }

  // ── Вычисление counts из tanks.json ──────────────────────────
  // Принимает all_tanks (массив имён) и карту танков из tanks.json.
  // Возвращает { prems_8_9_count, tanks_10_count, prems_6_7_count, bonus_tanks_count, premcount }.
  function computeCounts(allTanks, tanksMap) {
    let prems_8_9_count  = 0;
    let tanks_10_count   = 0;
    let prems_6_7_count  = 0;
    let bonus_tanks_count = 0;

    for (const name of allTanks) {
      const info   = tanksMap[name] || {};
      const tier   = parseInt(info.tier, 10) || 0;
      const isPrem = info.isPrem === true || info.isPrem === 'true';

      if (tier === 10) {
        tanks_10_count++;
      } else if (tier >= 8 && tier <= 9 && isPrem) {
        prems_8_9_count++;
      } else if (tier >= 5 && tier <= 7 && isPrem) {
        prems_6_7_count++;
      } else {
        bonus_tanks_count++;
      }
    }

    const premcount = prems_8_9_count + prems_6_7_count + bonus_tanks_count;
    return { prems_8_9_count, tanks_10_count, prems_6_7_count, bonus_tanks_count, premcount };
  }

  // ── Основная функция импорта ──────────────────────────────────
  /**
   * @param {string} csvText       - содержимое CSV файла
   * @param {object} currentJson   - текущий объект data/lots.json
   * @param {function} onProgress  - колбэк(msg) для прогресса
   * @returns {{ updatedJson, stats }} - обновлённый JSON и статистика
   */
  async function importCSV(csvText, currentJson, onProgress = () => {}) {
    onProgress('Загружаю config.json…');
    const config = await loadConfig();
    const colMap = config.accounts; // { fieldName: columnIndex }

    onProgress('Загружаю tanks.json…');
    const tanksMap = await loadTanks();

    onProgress('Парсю CSV…');
    const rows = parseCSV(csvText);

    // Собираем строки с валидным ID
    const today = todayStr();
    const csvById = {};

    for (const row of rows) {
      const rawId = row[colMap.id];
      if (!rawId || !rawId.trim()) continue; // пропускаем строки без ID
      const id = rawId.trim();

      // Берём только колонки из config, кроме id
      const data = {};
      for (const [field, colIdx] of Object.entries(colMap)) {
        if (field === 'id') continue;
        const val = (row[colIdx] !== undefined) ? String(row[colIdx]).trim() : '';
        data[field] = val;
      }

      csvById[id] = data;
    }

    onProgress(`Найдено ID в CSV: ${Object.keys(csvById).length}`);

    // Работаем с объектом lots
    const lots = (currentJson.lots && typeof currentJson.lots === 'object' && !Array.isArray(currentJson.lots))
      ? currentJson.lots
      : {};

    const stats = { added: 0, updated: 0, markedInactive: 0, deleted: 0 };

    // === Шаг 1: обработка ID из CSV ===
    for (const [id, csvData] of Object.entries(csvById)) {
      const funpayLink = csvData['funpay_link'] || '';
      const onFunpay = detectOnFunpay(funpayLink);

      // Нормализуем поля танков: строки → массивы
      const tankFields = ['prems_8_9', 'tanks_10', 'prems_6_7', 'bonus_tanks'];
      const normalizedData = { ...csvData };
      for (const field of tankFields) {
        normalizedData[field] = normalizeTanks(normalizedData[field]);
      }
      // Агрегированное поле: все танки из всех категорий
      normalizedData.all_tanks = [
        ...normalizedData.prems_8_9,
        ...normalizedData.tanks_10,
        ...normalizedData.prems_6_7,
        ...normalizedData.bonus_tanks,
      ];

      // Вычисляем counts из tanks.json (источник истины)
      const counts = computeCounts(normalizedData.all_tanks, tanksMap);
      normalizedData.prems_8_9_count  = counts.prems_8_9_count;
      normalizedData.tanks_10_count   = counts.tanks_10_count;
      normalizedData.prems_6_7_count  = counts.prems_6_7_count;
      normalizedData.bonus_tanks_count = counts.bonus_tanks_count;
      normalizedData.premcount        = counts.premcount;

      // ── Нормализация no_battles ───────────────────────────────
      // Колонка 24 в CSV: "Без боёв" → true, всё остальное → false
      const noBattlesRaw = csvData['no_battles'] || '';
      const no_battles = (noBattlesRaw.trim() === 'Без боёв');

      // ── Precompute scoreBase (tagCounts) для сценарной фильтрации ──
      // Учитываем ТОЛЬКО prems_8_9 — каждый тег 1 раз на танк
      // Хранятся только теги с count > 0
      const tagCounts = {};
      for (const tankName of normalizedData.prems_8_9) {
        const info = tanksMap[tankName];
        if (!info || !Array.isArray(info.tags)) continue;
        for (const tag of info.tags) {
          if (!tag) continue;
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      // scoreBase хранится на уровне лота (не внутри data)
      const scoreBase = { tagCounts };

      if (lots[id]) {
        // Уже есть — обновляем data, не трогаем ui
        lots[id].status        = 'active';
        lots[id].lastSeenInCsv = today;
        lots[id].inactiveSince = null;
        lots[id].onFunpay      = onFunpay;
        lots[id].data          = normalizedData;
        lots[id].scoreBase     = scoreBase;
        lots[id].no_battles    = no_battles;
        stats.updated++;
      } else {
        // Нового добавляем с дефолтным ui
        lots[id] = {
          status:        'active',
          lastSeenInCsv: today,
          inactiveSince: null,
          onFunpay:      onFunpay,
          data: normalizedData,
          scoreBase,
          no_battles,
          ui: {
            images:   [],
            thumb:    '',
            isHidden: false
          }
        };
        stats.added++;
      }
    }

    // === Шаг 2: ID есть в json, но нет в CSV → inactive ===
    const toDelete = [];
    for (const [id, lot] of Object.entries(lots)) {
      if (csvById[id]) continue; // есть в CSV — уже обработан

      if (lot.status === 'active') {
        // Только что пропал из CSV
        lot.status        = 'inactive';
        lot.inactiveSince = today;
        stats.markedInactive++;
      } else if (lot.status === 'inactive' && lot.inactiveSince) {
        // Уже inactive — проверяем 7 дней
        const daysPassed = daysBetween(lot.inactiveSince, today);
        if (daysPassed > 7) {
          toDelete.push(id);
        }
      }
    }

    // === Шаг 3: удаляем просроченные ===
    for (const id of toDelete) {
      delete lots[id];
      stats.deleted++;
    }

    const updatedJson = { ...currentJson, lots };

    onProgress(
      `Готово! Добавлено: ${stats.added}, обновлено: ${stats.updated}, ` +
      `неактивных: ${stats.markedInactive}, удалено: ${stats.deleted}`
    );

    return { updatedJson, stats };
  }

  // ── Импорт таблицы танков ─────────────────────────────────────
  /**
   * @param {string} csvText       - содержимое CSV файла танков
   * @param {object} currentJson   - текущий объект data/tanks.json
   * @param {function} onProgress  - колбэк(msg) для прогресса
   * @returns {{ updatedJson, stats }} - обновлённый JSON и статистика
   */
  async function importTanksCSV(csvText, currentJson, onProgress = () => {}) {
    onProgress('Загружаю config.json…');
    const config = await loadConfig();
    const colMap = config.tanks;
    if (!colMap) throw new Error('Секция "tanks" не найдена в config.json');

    onProgress('Парсю CSV…');
    const rows = parseCSV(csvText);

    const csvByName = {};
    for (const row of rows) {
      const rawName = row[colMap.name];
      if (!rawName || !rawName.trim()) continue;
      const name = rawName.trim();
      const data = {};
      for (const [field, colIdx] of Object.entries(colMap)) {
        if (field === 'name') continue;
        data[field] = (row[colIdx] !== undefined) ? String(row[colIdx]).trim() : '';
      }
      csvByName[name] = data;
    }

    onProgress(`Найдено танков в CSV: ${Object.keys(csvByName).length}`);

    const tanks = (currentJson.tanks && typeof currentJson.tanks === 'object' && !Array.isArray(currentJson.tanks))
      ? { ...currentJson.tanks }
      : {};

    const stats = { added: 0, updated: 0, deleted: 0 };

    // Добавляем / обновляем из CSV
    for (const [name, csvData] of Object.entries(csvByName)) {
      // Нормализуем isPrem в boolean при импорте tanks.json
      const normalizedEntry = { ...csvData };
      if ('isPrem' in normalizedEntry) {
        normalizedEntry.isPrem = normalizeIsPrem(normalizedEntry.isPrem);
      }
      // Нормализуем теги: "tag1, tag2" → ["tag1", "tag2"]
      // Пустая строка → [] (не хранится как пустая строка)
      if ('tags' in normalizedEntry) {
        const rawTags = String(normalizedEntry.tags || '').trim();
        normalizedEntry.tags = rawTags
          ? rawTags.split(',').map(t => t.trim()).filter(Boolean)
          : [];
      }
      if (tanks[name]) {
        tanks[name] = { ...tanks[name], ...normalizedEntry };
        stats.updated++;
      } else {
        tanks[name] = { ...normalizedEntry };
        stats.added++;
      }
    }

    // Удаляем сразу (без 7-дневного ожидания) то, чего нет в CSV
    for (const name of Object.keys(tanks)) {
      if (!csvByName[name]) {
        delete tanks[name];
        stats.deleted++;
      }
    }

    const updatedJson = { tanks };

    onProgress(
      `Готово! Добавлено: ${stats.added}, обновлено: ${stats.updated}, удалено: ${stats.deleted}`
    );

    return { updatedJson, stats };
  }

  return { importCSV, importTanksCSV, parseCSV, loadConfig, loadTanks, normalizeTanks, normalizeIsPrem, computeCounts };
})();
