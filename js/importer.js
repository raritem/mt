/* ================================================================
   TANKNEXUS — CSV Importer (importer.js)
   Правильный парсер CSV с поддержкой многострочных полей
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

  // ── Загрузить конфиг ───────────────────────────────────────────
  async function loadMappingConfig() {
    if (config) return config;
    
    try {
      const repo = (localStorage.getItem('tanknexus-gh-repo') || '').trim().replace(/\/+$/, '');
      const branch = (localStorage.getItem('tanknexus-gh-branch') || 'main').trim() || 'main';
      
      let url;
      if (repo) {
        url = `https://raw.githubusercontent.com/${repo}/${branch}/${CONFIG_PATH}`;
      } else {
        url = '../' + CONFIG_PATH;
      }
      
      url += '?t=' + Date.now();
      
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('config.json не найден, используем значения по умолчанию');
        return getDefaultConfig();
      }
      
      const text = await res.text();
      if (!text || text.trim() === '') {
        return getDefaultConfig();
      }
      
      config = JSON.parse(text);
      
      if (config.id === undefined) {
        config.id = 0;
      }
      
      return config;
    } catch (e) {
      console.warn('Ошибка загрузки config.json, используем значения по умолчанию:', e.message);
      return getDefaultConfig();
    }
  }

  function getDefaultConfig() {
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
      bonus_tanks_count: 11,
      bonus_tanks: 12,
      year: 15,
      bons: 16,
      gold: 17,
      silver: 18
    };
  }

  // ── ПРАВИЛЬНЫЙ ПАРСЕР CSV с поддержкой многострочных полей ─────
  function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Экранированная кавычка -> одна кавычка
            currentField += '"';
            i++; // пропускаем следующую кавычку
          } else {
            // Конец quoted поля
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          // Начало quoted поля
          inQuotes = true;
        } else if (char === ',') {
          // Конец поля
          currentRow.push(currentField);
          currentField = '';
        } else if (char === '\r' && nextChar === '\n') {
          // Windows CRLF
          // Игнорируем \r, \n обработается на следующей итерации
          continue;
        } else if (char === '\n' || char === '\r') {
          // Конец строки
          currentRow.push(currentField);
          
          // Проверяем, не пустая ли строка
          const isEmpty = currentRow.every(f => f === '');
          if (!isEmpty) {
            rows.push(currentRow);
          }
          
          currentRow = [];
          currentField = '';
        } else {
          currentField += char;
        }
      }
    }
    
    // Добавляем последнее поле и строку
    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      const isEmpty = currentRow.every(f => f === '');
      if (!isEmpty) {
        rows.push(currentRow);
      }
    }
    
    return rows;
  }

  // ── Получить значение из строки ────────────────────────────────
  function getFieldValue(row, fieldName, mapping) {
    const colIndex = mapping[fieldName];
    if (colIndex === undefined || colIndex === null) return null;
    if (colIndex >= row.length) return null;
    
    const val = row[colIndex];
    if (val === undefined || val === null) return null;
    
    return String(val).trim();
  }

  // ── Вычислить premcount ────────────────────────────────────────
  function calculatePremcount(data) {
    let sum = 0;
    const fields = ['prems_8_9_count', 'prems_6_7_count', 'bonus_tanks_count'];
    
    fields.forEach(field => {
      const val = data[field];
      if (val && val !== '') {
        const num = parseInt(String(val).replace(/\s+/g, ''), 10);
        if (!isNaN(num)) sum += num;
      }
    });
    
    return sum > 0 ? String(sum) : null;
  }

  // ── Определить onFunpay ────────────────────────────────────────
  function determineOnFunpay(link) {
    if (!link || link === '') return false;
    const lower = link.toLowerCase();
    if (lower.includes('funpay.com/lots/')) return true;
    if (lower.includes('funpay.com/users/')) return false;
    return lower.includes('funpay.com');
  }

  // ── Извлечь data (ТОЛЬКО РАЗРЕШЁННЫЕ ПОЛЯ) ────────────────────
  function extractDataFromRow(row, mapping) {
    const data = {};
    
    ALLOWED_DATA_FIELDS.forEach(fieldName => {
      if (mapping.hasOwnProperty(fieldName)) {
        const value = getFieldValue(row, fieldName, mapping);
        if (value && value !== '') {
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
      console.warn(`Ошибка чтения ${path}, создаём новый:`, e.message);
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

  // ── Безопасная запись JSON ─────────────────────────────────────
  async function safeWriteJSON(path, data, message) {
    // Проверяем, что данные можно сериализовать
    let jsonString;
    try {
      jsonString = JSON.stringify(data, null, 2);
      JSON.parse(jsonString); // Проверка валидности
    } catch (e) {
      console.error('Ошибка сериализации JSON:', e);
      throw new Error('Невозможно сохранить данные: повреждённая структура');
    }
    
    return GH.writeJSON(path, data, message);
  }

  // ── Основная функция импорта ───────────────────────────────────
  async function importFromCSV(file, onProgress) {
    // Загружаем конфиг
    const mapping = await loadMappingConfig();
    const idColumnIndex = mapping.id || 0;
    
    // Читаем файл
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsText(file, 'UTF-8');
    });
    
    if (!text || text.trim() === '') {
      throw new Error('Файл пуст');
    }
    
    // Парсим CSV
    const rows = parseCSV(text);
    
    if (rows.length === 0) {
      throw new Error('CSV файл не содержит данных');
    }
    
    onProgress && onProgress({ 
      phase: 'parse', 
      total: rows.length, 
      message: `Найдено ${rows.length} строк` 
    });
    
    // Загружаем текущий lots.json
    const { data: catalogue } = await safeReadJSON('data/' + CATALOGUE_ID + '.json');
    
    // Проверяем и чиним структуру
    if (!catalogue || typeof catalogue !== 'object') {
      catalogue = { id: CATALOGUE_ID, name: 'Галерея', lots: {} };
    }
    
    if (!catalogue.lots || typeof catalogue.lots !== 'object') {
      catalogue.lots = {};
    }
    
    const lotsObj = catalogue.lots;
    const today = new Date().toISOString().split('T')[0];
    
    // Собираем ID из CSV
    const csvIds = new Set();
    
    // Пропускаем заголовок если есть
    let startIndex = 0;
    if (rows.length > 0) {
      const firstRow = rows[0];
      if (firstRow.length > idColumnIndex) {
        const firstCell = firstRow[idColumnIndex];
        if (firstCell && String(firstCell).toLowerCase().includes('id')) {
          startIndex = 1;
          onProgress && onProgress({ 
            phase: 'parse', 
            message: 'Заголовок обнаружен, пропускаем' 
          });
        }
      }
    }
    
    const totalToProcess = rows.length - startIndex;
    onProgress && onProgress({ 
      phase: 'process', 
      current: 0, 
      total: totalToProcess, 
      message: `Обработка ${totalToProcess} строк...` 
    });
    
    let processed = 0;
    let skipped = 0;
    
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      
      // Проверяем наличие ID
      if (row.length <= idColumnIndex) {
        skipped++;
        continue;
      }
      
      const rawId = row[idColumnIndex];
      if (!rawId || String(rawId).trim() === '') {
        skipped++;
        continue;
      }
      
      const id = String(rawId).trim();
      csvIds.add(id);
      
      // Извлекаем данные
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
      if (title.length > 60) {
        title = title.substring(0, 57) + '...';
      }
      
      // Ресурсы
      const resources = {};
      if (extractedData.bons) resources.bonds = extractedData.bons;
      if (extractedData.gold) resources.gold = extractedData.gold;
      if (extractedData.silver) resources.silver = extractedData.silver;
      
      // UI данные
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
      
      if (processed % 100 === 0) {
        onProgress && onProgress({ 
          phase: 'process', 
          current: processed, 
          total: totalToProcess 
        });
      }
    }
    
    // Помечаем отсутствующие как inactive
    let markedInactive = 0;
    const allIds = Object.keys(lotsObj);
    
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
    
    // Удаляем старые неактивные (>7 дней)
    const idsToDelete = [];
    allIds.forEach(id => {
      const lot = lotsObj[id];
      if (lot && lot.status === 'inactive' && lot.inactiveSince) {
        const inactiveDate = new Date(lot.inactiveSince);
        const daysInactive = Math.floor((Date.now() - inactiveDate) / (1000 * 60 * 60 * 24));
        if (daysInactive > INACTIVE_DAYS_THRESHOLD) {
          idsToDelete.push(id);
        }
      }
    });
    
    // Удаляем файлы
    for (const id of idsToDelete) {
      const lot = lotsObj[id];
      if (lot && lot.ui) {
        const filesToDelete = [];
        if (Array.isArray(lot.ui.images)) {
          filesToDelete.push(...lot.ui.images);
        }
        if (lot.ui.thumb) {
          filesToDelete.push(lot.ui.thumb);
        }
        
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
    
    // Сохраняем
    await safeWriteJSON('data/' + CATALOGUE_ID + '.json', catalogue, 'Import from CSV');
    
    // Статистика
    const newLots = Object.values(lotsObj).filter(l => l.lastSeenInCsv === today).length;
    
    return {
      total: totalToProcess,
      processed: processed,
      skipped: skipped,
      new: newLots,
      updated: processed - newLots,
      inactive: markedInactive,
      deleted: idsToDelete.length,
      errors: [],
      saveSuccess: true
    };
  }

  return {
    importFromCSV,
    loadMappingConfig
  };

})();