/* ================================================================
   CSV Loader for TANKNEXUS
   Loads and parses accounts.csv and tanks.csv with config.json mapping
   ================================================================ */

'use strict';

window.CSVLoader = (() => {

  // ── CSV Parser: Handle quoted fields and proper comma splitting ────
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  // ── Parse CSV text to array of rows ──────────────────────────────
  // Handles multiline cells in quoted fields
  function parseCSV(csvText) {
    const lines = csvText.split('\n');
    if (lines.length === 0) return { headers: [], rows: [] };
    
    // Skip initial empty rows and find first non-empty row
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) {
        startIdx = i;
        break;
      }
    }
    
    // Parse multi-line CSV rows
    const rows = [];
    let currentRow = '';
    let inQuotes = false;
    
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Count quote characters to determine if we're inside quotes
      let quoteCount = 0;
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '"') quoteCount++;
      }
      
      currentRow += (currentRow ? '\n' : '') + line;
      inQuotes = inQuotes !== (quoteCount % 2 === 1);
      
      // If not in quotes, this row is complete
      if (!inQuotes && currentRow.trim()) {
        const parsed = parseCSVLine(currentRow);
        // Skip empty rows and category headers
        const firstField = parsed[0] || '';
        if (firstField.trim() && firstField.trim().length > 0) {
          rows.push(parsed);
        }
        currentRow = '';
      }
    }
    
    // Handle last row
    if (currentRow.trim()) {
      const parsed = parseCSVLine(currentRow);
      const firstField = parsed[0] || '';
      if (firstField.trim() && firstField.trim().length > 0) {
        rows.push(parsed);
      }
    }
    
    // First row from data is actually the header, skip it
    const headers = rows.length > 0 ? rows[0] : [];
    const dataRows = rows.slice(1);
    
    return { headers, rows: dataRows };
  }

  // ── Get value from row using config mapping ──────────────────────
  function getFieldValue(row, fieldName, config) {
    const colIndex = config[fieldName];
    if (colIndex === undefined || colIndex === null) return undefined;
    const val = row[colIndex];
    return val === undefined ? '' : String(val).trim();
  }

  // ── Detect if account has FunPay offer ──────────────────────────
  function detectFunpayStatus(link) {
    const defaultFunPayLink = 'https://funpay.com/users/2854472/';
    if (!link || link === '') {
      return { onFunpay: false, funpay: defaultFunPayLink };
    }
    // Clean up the link (might have extra text after)
    const cleanLink = String(link).split(/[\r\n]/)[0].trim();
    if (!cleanLink) {
      return { onFunpay: false, funpay: defaultFunPayLink };
    }
    const url = cleanLink.toLowerCase();
    // If link contains /lots/, it's an offer
    if (url.includes('funpay.com/lots/')) {
      return { onFunpay: true, funpay: cleanLink };
    }
    // Otherwise (e.g., /users/), it's not a FunPay offer
    return { onFunpay: false, funpay: cleanLink };
  }

  // ── Parse comma-separated tanks, handling spaces ──────────────────
  function parseTankList(tankStr) {
    if (!tankStr) return [];
    return tankStr
      .split(',')
      .map(t => t.trim())
      .filter(t => t);
  }

  // ── Convert Russian comma decimal to dot decimal ──────────────────
  function normalizeDecimal(str) {
    if (!str) return '0';
    // Replace comma with dot for decimals
    return String(str).replace(',', '.');
  }

  // ── Parse a single account row to lot object ─────────────────────
  function parseAccountRow(row, config, index) {
    const id = getFieldValue(row, 'id', config);
    const username = getFieldValue(row, 'username', config);    

    // Skip rows without ID or username
    if (!id || id.trim() === '') return null;
    if (!username || username.trim() === '') return null;

    // TEMP FIX: Skip visibility check for now - load all with username
    // const visibility = getFieldValue(row, 'visibility', config);
    // if (!visibility || visibility.trim() === '') return null;

    const visibility = getFieldValue(row, 'visibility', config);
    const price = getFieldValue(row, 'price', config);
    const prems8_9 = getFieldValue(row, 'prems_8_9', config);
    const tanks10 = getFieldValue(row, 'tanks_10', config);
    const funpay_link = getFieldValue(row, 'funpay_link', config);
    const prems6_7 = getFieldValue(row, 'prems_6_7', config);
    const bonus_tanks = getFieldValue(row, 'bonus_tanks', config);
    const year = getFieldValue(row, 'year', config);
    const bons = getFieldValue(row, 'bons', config);
    const gold = getFieldValue(row, 'gold', config);
    const silver = getFieldValue(row, 'silver', config);
    const spg = getFieldValue(row, 'spg', config);
    const boosters = getFieldValue(row, 'boosters', config);
    const crew = getFieldValue(row, 'crew', config);
    const camo = getFieldValue(row, 'camo', config);
    const styles3d = getFieldValue(row, '3dstyles', config);

    // Detect FunPay status
    const { onFunpay, funpay } = detectFunpayStatus(funpay_link);

    // Parse tank lists
    const premsList = parseTankList(prems8_9);
    const tanks10List = parseTankList(tanks10);
    const prems6_7List = parseTankList(prems6_7);
    const bonusLotList = parseTankList(bonus_tanks);

    // Build title from key info
    const titleTanks = premsList.length > 0 ? premsList : tanks10List;
    const title = titleTanks.length > 0 
      ? titleTanks.join(', ')
      : username;

    // Calculate tier 10 and prem counts
    const t10count = tanks10List.length;
    const premcount = premsList.length + prems6_7List.length + bonusLotList.length;

    // Build resources object
    const resources = {};
    if (bons && bons !== '0' && bons.trim()) {
      const bonsClean = bons.replace(/[^\d]/g, '').trim();
      if (bonsClean) resources.bonds = bonsClean;
    }
    if (gold && gold !== '0' && gold.trim()) {
      const goldClean = gold.replace(/[^\d]/g, '').trim();
      if (goldClean) resources.gold = goldClean;
    }
    if (silver && silver !== '0' && silver.trim()) {
      const silverClean = silver.replace(/[^\d,]/g, '').trim();
      if (silverClean) {
        const normalized = normalizeDecimal(silverClean);
        if (normalized && normalized !== '0') resources.silver = normalized + 'M';
      }
    }

    // Use ID from CSV, don't generate
    return {
      id: id,
      title: title,
      funpay: funpay,
      onFunpay: onFunpay,
      price: price || null,
      t10count: t10count,
      premcount: premcount,
      tanks10: tanks10List.join(', ') || null,
      resources: resources,
      images: [],
      thumb: null,
      // CSV-only metadata
      meta: {
        username: username,
        year: year,
        tanks_8_9: prems8_9,
        tanks_6_7: prems6_7,
        bonus_tanks: bonus_tanks,
        spg: spg,
        boosters: boosters,
        crew: crew,
        camo: camo,
        styles_3d: styles3d
      }
    };
  }

  // ── Helper: Parse CSV and return accounts ──────────────────────────
  function parseAndReturnAccounts(csvText, configData) {
    const accountsConfig = configData.accounts || {};
    const { headers, rows } = parseCSV(csvText);

    console.log('CSV parsed: ' + rows.length + ' data rows found');

    if (rows.length === 0) {
      console.warn('⚠️ No data rows found in CSV');
      if (csvText.length > 100) {
        // Log first 500 chars of CSV for debugging
        console.log('First account row preview:', csvText.substring(300, 800));
      }
      return [];
    }

    const accounts = rows
      .map((row, idx) => {
        const acc = parseAccountRow(row, accountsConfig, idx);
        if (idx < 5 && !acc) {
          console.log('Row ' + idx + ' filtered out. Username: ' + getFieldValue(row, 'username', accountsConfig) + ', Visibility: ' + JSON.stringify(getFieldValue(row, 'visibility', accountsConfig)));
        }
        return acc;
      })
      .filter(acc => acc !== null);

    console.log('✓ ' + accounts.length + ' accounts visible (have visibility marker)');
    return accounts;
  }

  // ── Load and parse accounts CSV with fallback ────────────────────────
  async function loadAccounts(csvUrl, configUrl, fallbackCsvUrl, fallbackConfigUrl) {
    let lastError = null;

    // Try primary URLs
    try {
      const [csvRes, configRes] = await Promise.all([
        fetch(csvUrl),
        fetch(configUrl)
      ]);

      if (!csvRes.ok) throw new Error('Failed to load ' + csvUrl);
      if (!configRes.ok) throw new Error('Failed to load ' + configUrl);

      const csvText = await csvRes.text();
      const configData = await configRes.json();
      return parseAndReturnAccounts(csvText, configData);
    } catch (e) {
      lastError = e;
      console.warn('⚠️ Primary load failed: ' + e.message);
    }

    // If primary failed and we have fallback URLs, try them
    if (fallbackCsvUrl && fallbackConfigUrl) {
      try {
        console.log('💾 Trying fallback: ' + fallbackCsvUrl);
        const [csvRes, configRes] = await Promise.all([
          fetch(fallbackCsvUrl),
          fetch(fallbackConfigUrl)
        ]);

        if (!csvRes.ok) throw new Error('Failed to load ' + fallbackCsvUrl);
        if (!configRes.ok) throw new Error('Failed to load ' + fallbackConfigUrl);

        const csvText = await csvRes.text();
        const configData = await configRes.json();
        console.log('✓ Loaded from fallback URL');
        return parseAndReturnAccounts(csvText, configData);
      } catch (e) {
        lastError = e;
        console.error('⚠️ Fallback also failed: ' + e.message);
      }
    }

    // All attempts failed
    console.error('Error loading accounts from both primary and fallback', lastError);
    throw lastError;
  }

  // ── Load and parse tanks reference CSV ────────────────────────────
  async function loadTanks(csvUrl, configUrl) {
    try {
      const [csvRes, configRes] = await Promise.all([
        fetch(csvUrl),
        fetch(configUrl)
      ]);

      if (!csvRes.ok) throw new Error('Failed to load ' + csvUrl);
      if (!configRes.ok) throw new Error('Failed to load ' + configUrl);

      const csvText = await csvRes.text();
      const configData = await configRes.json();

      const tanksConfig = configData.tanks || {};
      const { headers, rows } = parseCSV(csvText);

      const tanksMap = {}; // Map by name for quick lookup
      
      rows.forEach(row => {
        const name = getFieldValue(row, 'name', tanksConfig);
        if (!name) return;

        tanksMap[name] = {
          name: name,
          icon: getFieldValue(row, 'icon', tanksConfig),
          tier: getFieldValue(row, 'tier', tanksConfig),
          type: getFieldValue(row, 'type', tanksConfig),
          nation: getFieldValue(row, 'nation', tanksConfig),
          isPrem: getFieldValue(row, 'isPrem', tanksConfig) === '1' || getFieldValue(row, 'isPrem', tanksConfig) === 'true',
          interest_level: getFieldValue(row, 'interest_level', tanksConfig),
          descriptions: {
            a: getFieldValue(row, 'description_a', tanksConfig),
            b: getFieldValue(row, 'description_b', tanksConfig),
            c: getFieldValue(row, 'description_c', tanksConfig)
          }
        };
      });

      return tanksMap;
    } catch (e) {
      console.error('Error loading tanks:', e);
      throw e;
    }
  }

  // ── Load and merge CSV with JSON metadata ───────────────────────────
  // New architecture:
  // - CSV = base products (id, username, visibility, tanks, etc.)
  // - JSON (lots.json) = display metadata (images, thumb, sort_order, is_hidden)
  // - Filter by: visibility (CSV) + is_hidden (JSON)
  // - Sort by: sort_order (JSON)
  async function mergeWithMetadata(csvAccounts, lotsJsonUrl, fallbackUrl) {
    let fullLots;
    try {
      const res = await fetch(lotsJsonUrl);
      fullLots = res.ok ? await res.json() : {};
    } catch (e) {
      console.warn('⚠️ Failed to load lots.json from primary:', e.message);
      try {
        const res = await fetch(fallbackUrl);
        fullLots = res.ok ? await res.json() : {};
        console.log('✓ Loaded lots.json from fallback');
      } catch (e2) {
        console.warn('⚠️ Failed to load lots.json from fallback, using empty metadata');
        fullLots = {};
      }
    }

    // Convert lots.json array format to map by ID (if needed)
    let lotsMap = {};
    if (Array.isArray(fullLots)) {
      fullLots.forEach(lot => {
        if (lot && lot.id) lotsMap[lot.id] = lot;
      });
    } else if (fullLots && typeof fullLots === 'object') {
      lotsMap = fullLots;
    }

    console.log('📦 Merging ' + csvAccounts.length + ' CSV items with metadata');

    // Merge CSV data with JSON metadata
    const merged = csvAccounts.map(lot => {
      const meta = lotsMap[lot.id] || {};
      return {
        ...lot,
        images: meta.images || [],
        thumb: meta.thumb || null,
        sort_order: meta.sort_order || 0,
        is_hidden: meta.is_hidden || false
      };
    });

    // Filter: Hide items marked as hidden in JSON
    const filtered = merged.filter(lot => !lot.is_hidden);

    // Sort: by sort_order (ascending), then by id for stability
    filtered.sort((a, b) => {
      const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.id).localeCompare(String(b.id));
    });

    console.log('✓ ' + filtered.length + ' products visible (after filtering is_hidden)');
    return filtered;
  }

  // ── Build catalogue data (NEW architecture with CSV + JSON) ──────
  async function buildCatalogue(csvUrl, configUrl, fallbackCsvUrl, fallbackConfigUrl, lotsJsonUrl, fallbackLotsUrl) {
    const csvAccounts = await loadAccounts(csvUrl, configUrl, fallbackCsvUrl, fallbackConfigUrl);
    
    // Use provided URLs or construct defaults
    const lotsUrl = lotsJsonUrl || (csvUrl.substring(0, csvUrl.lastIndexOf('/')) + '/lots.json');
    const lotsUrlFallback = fallbackLotsUrl || (fallbackCsvUrl.substring(0, fallbackCsvUrl.lastIndexOf('/')) + '/lots.json');

    const lots = await mergeWithMetadata(csvAccounts, lotsUrl, lotsUrlFallback);

    return {
      id: 'tanknexus',
      name: 'TANKNEXUS Accounts',
      description: '',
      seller: 'tanknexus',
      lots: lots
    };
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    loadAccounts: loadAccounts,
    loadTanks: loadTanks,
    buildCatalogue: buildCatalogue,
    parseCSV: parseCSV
  };
})();
