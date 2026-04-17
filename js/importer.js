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

      // Вычисляем premcount = prems_8_9_count + prems_6_7_count + bonus_tanks_count
      const p89  = parseInt(csvData['prems_8_9_count']  || '0', 10) || 0;
      const p67  = parseInt(csvData['prems_6_7_count']  || '0', 10) || 0;
      const bns  = parseInt(csvData['bonus_tanks_count'] || '0', 10) || 0;
      const premcount = p89 + p67 + bns;

      if (lots[id]) {
        // Уже есть — обновляем data, не трогаем ui
        lots[id].status        = 'active';
        lots[id].lastSeenInCsv = today;
        lots[id].inactiveSince = null;
        lots[id].onFunpay      = onFunpay;
        lots[id].data          = { ...csvData, premcount: String(premcount) };
        stats.updated++;
      } else {
        // Нового добавляем с дефолтным ui
        lots[id] = {
          status:        'active',
          lastSeenInCsv: today,
          inactiveSince: null,
          onFunpay:      onFunpay,
          data: { ...csvData, premcount: String(premcount) },
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
      if (tanks[name]) {
        tanks[name] = { ...tanks[name], ...csvData };
        stats.updated++;
      } else {
        tanks[name] = { ...csvData };
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

  return { importCSV, importTanksCSV, parseCSV, loadConfig };
})();
