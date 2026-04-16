/* ================================================================
   TANKNEXUS — CSV Importer (importer.js)
   ================================================================ */

'use strict';

window.Importer = (() => {

  const CATALOGUE_ID = 'lots';
  const CONFIG_PATH = 'config.json';
  const INACTIVE_DAYS_THRESHOLD = 7;

  // ЖЁСТКИЙ СПИСОК РАЗРЕШЁННЫХ ПОЛЕЙ ДЛЯ ИМПОРТА В data
  const ALLOWED_DATA_FIELDS = [
    'price',
    'prems_8_9_count',
    'prems_8_9',
    'tanks_10_count',
    'tanks_10',
    'funpay_link',
    'prems_6_7_count',
    'prems_6_7',
    'bonus_tanks_count',
    'bonus_tanks',
    'year',
    'bons',
    'gold',
    'silver',
    'spg',
    'boosters',
    'crew',
    'camo',
    '3dstyles'
  ];

  let config = null;

  // ── Загрузить конфиг маппинга колонок ──────────────────────────
  async function loadMappingConfig() {
    if (config) return config;
    try {
      const rawBase = (() => {
        try {
          const repo = (localStorage.getItem('tanknexus-gh-repo') || '').trim().replace(/\/+$/, '');
          const branch = (localStorage.getItem('tanknexus-gh-branch') || 'main').trim() || 'main';
          if (!repo) return null;
          return 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/';
        } catch (_) { return null; }
      })();
      
      let url;
      if (rawBase) {
        url = rawBase + CONFIG_PATH;
      } else {
        url = '../' + CONFIG_PATH;
      }
      
      // Добавляем timestamp чтобы избежать кеша
      url += '?t=' + Date.now();
      
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('config.json не найден, используем значения по умолчанию');
        // Возвращаем базовую конфигурацию
        return {
          id: 0,
          price: 2,
          prems_8_9_count: 3,
          prems_8_9: 4,
          tanks_10_count: 5,
          tanks_10: 6,
          funpay_link: 7,
          prems_6_7_count: 9,
          prems_6_7: 10,
          bon_tanks_count: 11,
          bon_tanks: 12,
          year: 15,
          bons: 16,
          gold: 17,
          silver: 18
        };
      }
      
      const text = await res.text();
      if (!text || text.trim() === '') {
        throw new Error('config.json пуст');
      }
      
      try {
        config = JSON.parse(text);
      } catch (e) {
        console.error('Ошибка парсинга config.json:', e);
        throw new Error('config.json содержит невалидный JSON');
      }
      
      // Проверяем наличие поля id
      if (config.id === undefined) {
        console.warn('config.json не содержит поле "id", используется 0');
        config.id = 0;
      }
      
      return config;
    } catch (e) {
      console.error('Ошибка загрузки config.json:', e);
      // Возвращаем базовую конфигурацию вместо ошибки
      return {
        id: 0,
        price: 2,
        prems_8_9_count: 3,
        prems_8_9: 4,
        tanks_10_count: 5,
        tanks_10: 6,
        funpay_link: 7
      };
    }
  }

  // ── Парсинг CSV строки (учитывает кавычки и запятые внутри) ────
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  // ── Проверка, является ли строка пустой (только запятые или пробелы) ──
  function isEmptyRow(row) {
    if (!row || row.length === 0) return true;
    // Проверяем, есть ли хотя бы одно непустое значение
    return row.every(cell => !cell || cell.trim() === '');
  }

  // ── Парсинг всего CSV файла ────────────────────────────────────
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Пропускаем полностью пустые строки
      if (!line || line.trim() === '') {
        continue;
      }
      
      try {
        const parsed = parseCSVLine(line);
        
        // Пропускаем строки, где все ячейки пустые
        if (!isEmptyRow(parsed)) {
          result.push(parsed);
        }
      } catch (e) {
        console.warn(`Ошибка парсинга строки ${i + 1}:`, e.message);
        // Пропускаем битую строку
        continue;
      }
    }
    
    return result;
  }

  // ── Получить значение из строки по имени поля ──────────────────
  function getFieldValue(row, fieldName, mapping) {
    const colIndex = mapping[fieldName];
    if (colIndex === undefined || colIndex === null) return null;
    if (colIndex >= row.length) return null;
    const val = row[colIndex];
    return (val !== undefined && val !== null) ? String(val).trim() : null;
  }

  // ── Вычислить premcount ────────────────────────────────────────
  function calculatePremcount(data) {
    let sum = 0;
    const fields = ['prems_8_9_count', 'prems_6_7_count', 'bonus_tanks_count'];
    fields.forEach(field => {
      const val = data[field];
      if (val !== undefined && val !== null && val !== '') {
        const num = parseInt(String(val).replace(/\s+/g, ''), 10);
        if (!isNaN(num)) sum += num;
      }
    });
    return sum > 0 ? String(sum) : null;
  }

  // ── Определить onFunpay на основе ссылки ───────────────────────
  function determineOnFunpay(link) {
    if (!link || link === '') return false;
    const lower = link.toLowerCase();
    if (lower.includes('funpay.com/lots/')) return true;
    if (lower.includes('funpay.com/users/')) return false;
    return lower.includes('funpay.com');
  }

  // ── Собрать data из строки CSV (ТОЛЬКО РАЗРЕШЁННЫЕ ПОЛЯ) ───────
  function extractDataFromRow(row, mapping) {
    const data = {};
    
    ALLOWED_DATA_FIELDS.forEach(fieldName => {
      if (mapping.hasOwnProperty(fieldName)) {
        const value = getFieldValue(row, fieldName, mapping);
        if (value !== null && value !== '') {
          data[fieldName] = value;
        }
      }
    });
    
    return data;
  }

  // ── Безопасное чтение JSON ─────────────────────────────────────
  async function safeReadJSON(path) {
    try {
      const result = await GH.readJSON(path);
      return result;
    } catch (e) {
      console.error(`Ошибка чтения ${path}:`, e);
      // Возвращаем пустую структуру
      return { 
        data: { 
          id: CATALOGUE_ID, 
          name: 'Галерея', 
          lots: {} 
        }, 
        sha: null 
      };
    }
  }

  // ── Основная функция импорта ───────────────────────────────────
  async function importFromCSV(file, onProgress) {
    let mapping;
    try {
      mapping = await loadMappingConfig();
    } catch (e) {
      console.warn('Используем базовую конфигурацию:', e.message);
      mapping = { id: 0 };
    }
    
    // Читаем файл
    let text;
    try {
      text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Ошибка чтения файла'));
        reader.readAsText(file, 'UTF-8');
      });
    } catch (e) {
      throw new Error('Не удалось прочитать файл: ' + e.message);
    }
    
    if (!text || text.trim() === '') {
      throw new Error('Файл пуст');
    }
    
    // Парсим CSV
    const rows = parseCSV(text);
    
    if (rows.length === 0) {
      throw new Error('CSV файл не содержит данных (все строки пустые)');
    }
    
    onProgress && onProgress({ 
      phase: 'parse', 
      total: rows.length, 
      message: `Найдено ${rows.length} строк с данными` 
    });
    
    // Загружаем текущий lots.json
    const { data: catalogue } = await safeReadJSON('data/' + CATALOGUE_ID + '.json');
    
    // Если lots не объект или null, создаём новый
    if (!catalogue || typeof catalogue !== 'object') {
      console.warn('lots.json повреждён, создаём новый');
      catalogue = {
        id: CATALOGUE_ID,
        name: 'Галерея',
        lots: {}
      };
    }
    
    // Если lots был массивом (старый формат) — конвертируем
    if (Array.isArray(catalogue.lots)) {
      console.log('Конвертация старого формата...');
      const oldLots = catalogue.lots;
      catalogue.lots = {};
      oldLots.forEach(lot => {
        if (!lot || !lot.id) return;
        const id = String(lot.id);
        catalogue.lots[id] = {
          status: 'active',
          lastSeenInCsv: null,
          inactiveSince: null,
          data: {
            price: lot.price,
            funpay_link: lot.funpay,
            tanks_10: lot.tanks10,
            prems_8_9: lot.title
          },
          ui: {
            title: lot.title || id,
            funpay: lot.funpay,
            price: lot.price,
            tanks10: lot.tanks10,
            premcount: lot.premcount,
            t10count: lot.t10count,
            resources: lot.resources || {},
            images: lot.images || [],
            thumb: lot.thumb || null,
            isHidden: (lot.onFunpay === false)
          }
        };
      });
    }
    
    // Убеждаемся что lots это объект
    if (!catalogue.lots || typeof catalogue.lots !== 'object') {
      catalogue.lots = {};
    }
    
    const lotsObj = catalogue.lots;
    const today = new Date().toISOString().split('T')[0];
    
    // Собираем ID из CSV
    const csvIds = new Set();
    const idColumnIndex = mapping.id || 0;
    
    // Определяем, есть ли заголовок
    let startIndex = 0;
    if (rows.length > 0) {
      const firstRow = rows[0];
      if (firstRow.length > idColumnIndex) {
        const firstCell = firstRow[idColumnIndex];
        if (firstCell && String(firstCell).toLowerCase().includes('id')) {
          startIndex = 1;
          onProgress && onProgress({ 
            phase: 'parse', 
            message: 'Обнаружен заголовок, пропускаем первую строку' 
          });
        }
      }
    }
    
    const totalRows = rows.length - startIndex;
    onProgress && onProgress({ 
      phase: 'process', 
      current: 0, 
      total: totalRows, 
      message: `Обработка ${totalRows} строк...` 
    });
    
    let processed = 0;
    let skipped = 0;
    const errors = [];
    
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      
      // Проверяем, что строка не пустая
      if (isEmptyRow(row)) {
        skipped++;
        continue;
      }
      
      // Проверяем, что есть ID
      if (row.length <= idColumnIndex) {
        skipped++;
        continue;
      }
      
      const rawId = row[idColumnIndex];
      
      if (!rawId || rawId.trim() === '') {
        skipped++;
        continue;
      }
      
      const id = String(rawId).trim();
      csvIds.add(id);
      
      // Извлекаем data из CSV
      const extractedData = extractDataFromRow(row, mapping);
      
      // Вычисляем premcount
      const premcount = calculatePremcount(extractedData);
      if (premcount) {
        extractedData.premcount = premcount;
      }
      
      // Определяем onFunpay
      const funpayLink = extractedData.funpay_link || '';
      const onFunpay = determineOnFunpay(funpayLink);
      
      // Формируем title
      let title = extractedData.prems_8_9 || extractedData.tanks_10 || 'Аккаунт';
      if (title.length > 60) title = title.substring(0, 57) + '...';
      
      // Ресурсы
      const resources = {};
      if (extractedData.bons) resources.bonds = extractedData.bons;
      if (extractedData.gold) resources.gold = extractedData.gold;
      if (extractedData.silver) resources.silver = extractedData.silver;
      
      // Данные для UI
      const uiData = {
        title: title,
        funpay: funpayLink || null,
        price: extractedData.price || null,
        tanks10: extractedData.tanks_10 || null,
        premcount: extractedData.premcount || null,
        t10count: extractedData.tanks_10_count || null,
        resources: Object.keys(resources).length > 0 ? resources : null
      };
      
      if (lotsObj[id]) {
        // Обновляем существующий
        lotsObj[id].status = 'active';
        lotsObj[id].lastSeenInCsv = today;
        lotsObj[id].inactiveSince = null;
        lotsObj[id].data = extractedData;
        
        // Сохраняем UI данные
        lotsObj[id].ui = {
          ...(lotsObj[id].ui || { images: [], thumb: null }),
          ...uiData
        };
        
        if (lotsObj[id].ui.isHidden === undefined) {
          lotsObj[id].ui.isHidden = !onFunpay;
        }
      } else {
        // Создаём новый
        lotsObj[id] = {
          status: 'active',
          lastSeenInCsv: today,
          inactiveSince: null,
          data: extractedData,
          ui: {
            ...uiData,
            images: [],
            thumb: null,
            isHidden: !onFunpay
          }
        };
      }
      
      processed++;
      
      if (processed % 50 === 0) {
        onProgress && onProgress({ 
          phase: 'process', 
          current: processed, 
          total: totalRows,
          message: `Обработано ${processed} из ${totalRows} строк` 
        });
      }
    }
    
    // Помечаем отсутствующие как inactive
    const allIds = Object.keys(lotsObj);
    let markedInactive = 0;
    
    allIds.forEach(id => {
      if (!csvIds.has(id)) {
        const lot = lotsObj[id];
        if (lot && lot.status === 'active') {
          lot.status = 'inactive';
          lot.inactiveSince = today;
          markedInactive++;
        }
      }
    });
    
    // Проверяем на удаление
    const idsToDelete = [];
    allIds.forEach(id => {
      const lot = lotsObj[id];
      if (lot && lot.status === 'inactive' && lot.inactiveSince) {
        const inactiveDate = new Date(lot.inactiveSince);
        const daysInactive = Math.floor((new Date() - inactiveDate) / (1000 * 60 * 60 * 24));
        if (daysInactive > INACTIVE_DAYS_THRESHOLD) {
          idsToDelete.push(id);
        }
      }
    });
    
    // Удаляем старые неактивные
    for (const id of idsToDelete) {
      const lot = lotsObj[id];
      if (lot && lot.ui) {
        const filesToDelete = [];
        if (lot.ui.images) filesToDelete.push(...lot.ui.images);
        if (lot.ui.thumb) filesToDelete.push(lot.ui.thumb);
        
        if (filesToDelete.length > 0) {
          try {
            await GH.deleteFiles(filesToDelete, `Delete inactive lot ${id}`);
          } catch (e) {
            console.warn(`Не удалось удалить файлы для ${id}:`, e.message);
          }
        }
      }
      delete lotsObj[id];
    }
    
    // Сохраняем с обработкой ошибок
    let saveSuccess = false;
    let saveError = null;
    
    try {
      await GH.writeJSON('data/' + CATALOGUE_ID + '.json', catalogue, 'Import from CSV');
      saveSuccess = true;
    } catch (e) {
      console.error('Ошибка сохранения:', e);
      saveError = e.message;
      
      // Пробуем сохранить с отступом в 2 пробела (меньше шанс повредить JSON)
      try {
        const jsonString = JSON.stringify(catalogue, null, 2);
        // Проверяем валидность JSON
        JSON.parse(jsonString);
        
        // Если дошли сюда, JSON валидный, пробуем сохранить ещё раз
        await GH.writeJSON('data/' + CATALOGUE_ID + '.json', catalogue, 'Import from CSV (retry)');
        saveSuccess = true;
        saveError = null;
      } catch (e2) {
        console.error('Повторная ошибка сохранения:', e2);
        saveError = e2.message;
      }
    }
    
    const stats = {
      total: totalRows,
      processed: processed,
      skipped: skipped,
      new: Object.values(lotsObj).filter(l => l.lastSeenInCsv === today && !l.inactiveSince).length,
      updated: processed - Object.values(lotsObj).filter(l => l.lastSeenInCsv === today && !l.inactiveSince).length,
      inactive: markedInactive,
      deleted: idsToDelete.length,
      errors: errors,
      saveSuccess: saveSuccess,
      saveError: saveError
    };
    
    return stats;
  }

  // ── Получить список лотов с фильтрацией ────────────────────────
  async function getFilteredLots(filter = 'active') {
    const { data: catalogue } = await safeReadJSON('data/' + CATALOGUE_ID + '.json');
    if (!catalogue || !catalogue.lots) return [];
    
    const lotsObj = catalogue.lots;
    const result = [];
    
    Object.keys(lotsObj).forEach(id => {
      const lot = lotsObj[id];
      if (!lot) return;
      
      let include = false;
      
      switch (filter) {
        case 'active':
          include = (lot.status === 'active' && !lot.ui?.isHidden);
          break;
        case 'hidden':
          include = (lot.status === 'active' && lot.ui?.isHidden === true);
          break;
        case 'inactive':
          include = (lot.status === 'inactive');
          break;
        case 'all':
        default:
          include = true;
      }
      
      if (include) {
        result.push({
          id: id,
          ...lot
        });
      }
    });
    
    return result;
  }

  return {
    importFromCSV,
    getFilteredLots,
    loadMappingConfig
  };

})();