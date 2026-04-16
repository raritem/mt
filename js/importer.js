/* ================================================================
   TANKNEXUS — CSV Importer (importer.js)
   ================================================================ */

'use strict';

window.Importer = (() => {

  const CATALOGUE_ID = 'lots';
  const CONFIG_PATH = 'config.json';
  const INACTIVE_DAYS_THRESHOLD = 7;

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
        url = rawBase + CONFIG_PATH + '?t=' + Date.now();
      } else {
        url = '../' + CONFIG_PATH + '?t=' + Date.now();
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Не удалось загрузить config.json');
      config = await res.json();
      
      // Проверяем наличие поля id
      if (config.id === undefined) {
        throw new Error('config.json должен содержать поле "id" (индекс колонки с ID)');
      }
      
      return config;
    } catch (e) {
      console.error('Ошибка загрузки config.json:', e);
      throw new Error('config.json не найден или повреждён. Убедитесь, что файл существует в корне репозитория и содержит поле "id".');
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

  // ── Парсинг всего CSV файла ────────────────────────────────────
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseCSVLine(lines[i]);
      if (parsed.length > 0) {
        result.push(parsed);
      }
    }
    return result;
  }

  // ── Получить значение из строки по имени поля ──────────────────
  function getFieldValue(row, fieldName, mapping) {
    const colIndex = mapping[fieldName];
    if (colIndex === undefined || colIndex === null) return null;
    const val = row[colIndex];
    return (val !== undefined && val !== null) ? String(val).trim() : null;
  }

  // ── Вычислить premcount ────────────────────────────────────────
  function calculatePremcount(data) {
    let sum = 0;
    const fields = ['prems_8_9_count', 'prems_6_7_count', 'bonus_tanks_count'];
    fields.forEach(field => {
      const val = data[field];
      if (val !== undefined && val !== null) {
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
    // Если ссылка есть, но не подходит под шаблоны — считаем что это ссылка на лот
    return lower.includes('funpay.com');
  }

  // ── Собрать data из строки CSV ─────────────────────────────────
  function extractDataFromRow(row, mapping) {
    const data = {};
    
    // Копируем все поля из маппинга, кроме id (он ключ объекта) и pagination
    Object.keys(mapping).forEach(fieldName => {
      if (fieldName === 'id' || fieldName === 'pagination') return;
      const value = getFieldValue(row, fieldName, mapping);
      if (value !== null && value !== '') {
        data[fieldName] = value;
      }
    });
    
    // Вычисляем premcount
    const premcount = calculatePremcount(data);
    if (premcount) {
      data.premcount = premcount;
    }
    
    return data;
  }

  // ── Основная функция импорта ───────────────────────────────────
  async function importFromCSV(file, onProgress) {
    const mapping = await loadMappingConfig();
    
    if (!mapping || mapping.id === undefined) {
      throw new Error('config.json должен содержать поле "id" (индекс колонки с ID)');
    }
    
    // Читаем файл
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Ошибка чтения файла'));
      reader.readAsText(file, 'UTF-8');
    });
    
    // Парсим CSV
    const rows = parseCSV(text);
    if (rows.length === 0) {
      throw new Error('CSV файл пуст или не содержит данных');
    }
    
    onProgress && onProgress({ phase: 'parse', total: rows.length, message: `Найдено ${rows.length} строк` });
    
    // Загружаем текущий lots.json
    const { data: catalogue, sha } = await GH.readJSON('data/' + CATALOGUE_ID + '.json');
    if (!catalogue) {
      throw new Error('lots.json не найден. Сначала инициализируйте каталог.');
    }
    
    // Если lots был массивом (старый формат) — конвертируем
    if (Array.isArray(catalogue.lots)) {
      const oldLots = catalogue.lots;
      catalogue.lots = {};
      oldLots.forEach(lot => {
        const id = String(lot.id);
        catalogue.lots[id] = {
          status: 'active',
          lastSeenInCsv: null,
          inactiveSince: null,
          data: {
            title: lot.title,
            funpay_link: lot.funpay,
            price: lot.price,
            tanks_10: lot.tanks10,
            premcount: lot.premcount,
            t10count: lot.t10count,
            resources: lot.resources || {}
          },
          ui: {
            title: lot.title,
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
    
    const lotsObj = catalogue.lots || {};
    const today = new Date().toISOString().split('T')[0];
    
    // Собираем ID из CSV
    const csvIds = new Set();
    const idColumnIndex = mapping.id;
    
    // Обрабатываем строки CSV (пропускаем заголовок, если первая строка содержит "id")
    let startIndex = 0;
    if (rows.length > 0) {
      const firstRow = rows[0];
      if (firstRow.length > idColumnIndex) {
        const firstCell = firstRow[idColumnIndex];
        if (firstCell && String(firstCell).toLowerCase().includes('id')) {
          startIndex = 1;
        }
      }
    }
    
    onProgress && onProgress({ phase: 'process', current: 0, total: rows.length - startIndex, message: 'Обработка строк...' });
    
    let processed = 0;
    const errors = [];
    
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      
      // Проверяем, что строка имеет достаточно колонок
      if (row.length <= idColumnIndex) {
        errors.push(`Строка ${i + 1}: недостаточно колонок (нет ID)`);
        continue;
      }
      
      const rawId = row[idColumnIndex];
      
      if (!rawId || rawId === '') {
        errors.push(`Строка ${i + 1}: отсутствует ID`);
        continue;
      }
      
      const id = String(rawId).trim();
      csvIds.add(id);
      
      // Извлекаем data из CSV
      const extractedData = extractDataFromRow(row, mapping);
      
      // Определяем onFunpay
      const funpayLink = extractedData.funpay_link || '';
      const onFunpay = determineOnFunpay(funpayLink);
      
      // Формируем title из prems_8_9 или tanks_10
      let title = extractedData.prems_8_9 || extractedData.tanks_10 || 'Аккаунт';
      // Ограничиваем длину
      if (title.length > 60) title = title.substring(0, 57) + '...';
      
      // Ресурсы
      const resources = {};
      if (extractedData.bons) resources.bonds = extractedData.bons;
      if (extractedData.gold) resources.gold = extractedData.gold;
      if (extractedData.silver) resources.silver = extractedData.silver;
      
      // Данные для отображения
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
        // Обновляем UI данные, сохраняя images и thumb
        lotsObj[id].ui = {
          ...(lotsObj[id].ui || { images: [], thumb: null }),
          ...uiData
        };
        // Синхронизируем isHidden с onFunpay (если не задано вручную)
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
      if (processed % 10 === 0) {
        onProgress && onProgress({ phase: 'process', current: processed, total: rows.length - startIndex });
      }
    }
    
    // Помечаем отсутствующие как inactive
    const allIds = Object.keys(lotsObj);
    allIds.forEach(id => {
      if (!csvIds.has(id)) {
        const lot = lotsObj[id];
        if (lot.status === 'active') {
          lot.status = 'inactive';
          lot.inactiveSince = today;
        }
        // Если уже inactive, не трогаем inactiveSince
      }
    });
    
    // Проверяем на удаление (inactive > 7 дней)
    const idsToDelete = [];
    allIds.forEach(id => {
      const lot = lotsObj[id];
      if (lot.status === 'inactive' && lot.inactiveSince) {
        const inactiveDate = new Date(lot.inactiveSince);
        const daysInactive = Math.floor((new Date() - inactiveDate) / (1000 * 60 * 60 * 24));
        if (daysInactive > INACTIVE_DAYS_THRESHOLD) {
          idsToDelete.push(id);
        }
      }
    });
    
    // Удаляем (включая изображения)
    for (const id of idsToDelete) {
      const lot = lotsObj[id];
      const filesToDelete = [];
      if (lot.ui) {
        if (lot.ui.images) filesToDelete.push(...lot.ui.images);
        if (lot.ui.thumb) filesToDelete.push(lot.ui.thumb);
      }
      if (filesToDelete.length > 0) {
        try {
          await GH.deleteFiles(filesToDelete, `Delete inactive lot ${id}`);
        } catch (e) {
          console.warn(`Не удалось удалить файлы для ${id}:`, e.message);
        }
      }
      delete lotsObj[id];
    }
    
    // Сохраняем
    catalogue.lots = lotsObj;
    await GH.writeJSON('data/' + CATALOGUE_ID + '.json', catalogue, 'Import from CSV');
    
    // Считаем статистику
    const newLots = Object.values(lotsObj).filter(l => l.lastSeenInCsv === today && !l.inactiveSince).length;
    const updatedLots = processed - newLots;
    
    const stats = {
      total: rows.length - startIndex,
      processed: processed,
      new: Math.max(0, newLots),
      updated: Math.max(0, updatedLots),
      inactive: allIds.filter(id => lotsObj[id]?.status === 'inactive').length,
      deleted: idsToDelete.length,
      errors: errors
    };
    
    return stats;
  }

  // ── Получить список лотов с фильтрацией ────────────────────────
  async function getFilteredLots(filter = 'active') {
    const { data: catalogue } = await GH.readJSON('data/' + CATALOGUE_ID + '.json');
    if (!catalogue || !catalogue.lots) return [];
    
    const lotsObj = catalogue.lots;
    const result = [];
    
    Object.keys(lotsObj).forEach(id => {
      const lot = lotsObj[id];
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