/* ================================================================
   TANKNEXUS — GitHub Contents API
   Исправленная версия с обходом CDN кэша
   ================================================================ */

'use strict';

window.GH = (() => {

  const API = 'https://api.github.com';

  function getConfig() {
    return {
      token:  localStorage.getItem('tanknexus-gh-token')  || '',
      repo:   localStorage.getItem('tanknexus-gh-repo')   || '',
      branch: localStorage.getItem('tanknexus-gh-branch') || 'main',
    };
  }

  function saveConfig(token, repo, branch) {
    localStorage.setItem('tanknexus-gh-token',  token);
    localStorage.setItem('tanknexus-gh-repo',   repo);
    localStorage.setItem('tanknexus-gh-branch', branch || 'main');
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.token && c.repo);
  }

  async function request(method, path, body, noCache = false) {
    const cfg = getConfig();
    if (!cfg.token || !cfg.repo) throw new Error('GitHub не настроен');

    let url = API + '/repos/' + cfg.repo + path;
    
    // Агрессивный обход кэша для GET запросов
    if (method === 'GET' || noCache) {
      const sep = url.includes('?') ? '&' : '?';
      url += sep + '_=' + Date.now() + '_' + Math.random().toString(36).substring(2);
    }

    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).message || msg; } catch (_) {}
      const e = new Error(msg);
      e.status = res.status;
      throw e;
    }

    return res.status === 204 ? null : res.json();
  }

  async function ping() {
    const cfg = getConfig();
    const res = await fetch(API + '/repos/' + cfg.repo, {
      headers: { 'Authorization': 'Bearer ' + cfg.token }
    });
    if (!res.ok) throw new Error('Нет доступа');
    return res.json();
  }

  // Чтение файла напрямую по SHA — обходит CDN кэш
  async function getFileBySha(sha) {
    const cfg = getConfig();
    const url = `${API}/repos/${cfg.repo}/git/blobs/${sha}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github.v3+json',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
    const data = await res.json();
    // data.content — base64, data.encoding — 'base64' или 'utf-8'
    let content = data.content;
    if (data.encoding === 'base64') {
      const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
      content = new TextDecoder('utf-8').decode(bytes);
    }
    return { sha, content };
  }

  async function getRaw(path, forceRefresh = false) {
    const cfg = getConfig();
    if (forceRefresh) {
      delete shaCache[path];
    }
    const res = await request('GET', '/contents/' + path + '?ref=' + cfg.branch);
    return { sha: res.sha, b64: res.content.replace(/\n/g, '') };
  }

  async function getFile(path, forceRefresh = false) {
    // Если у нас есть актуальное содержимое в кэше, используем его
    if (!forceRefresh && shaContentCache[path] !== undefined) {
      return { sha: shaCache[path], content: shaContentCache[path] };
    }
    
    try {
      const { sha, b64 } = await getRaw(path, forceRefresh);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const content = new TextDecoder('utf-8').decode(bytes);
      shaCache[path] = sha;
      shaContentCache[path] = content;
      return { sha, content };
    } catch (e) {
      if (e.status === 404) {
        delete shaCache[path];
        delete shaContentCache[path];
        return { sha: null, content: null };
      }
      throw e;
    }
  }

  async function getFileBytes(path) {
    const { sha, b64 } = await getRaw(path);
    return { sha, bytes: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) };
  }

  async function getFileSha(path) {
    try {
      const { sha } = await getRaw(path);
      shaCache[path] = sha;
      return sha;
    } catch (e) {
      return e.status === 404 ? null : Promise.reject(e);
    }
  }

  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 8190) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8190)));
    }
    return btoa(chunks.join(''));
  }

  async function putFile(path, content, message, sha) {
    const cfg = getConfig();
    const b64 = toBase64(content);
    const body = { message, content: b64, branch: cfg.branch };
    if (sha) body.sha = sha;
    const res = await request('PUT', '/contents/' + path, body);
    
    if (res?.content?.sha) {
      const newSha = res.content.sha;
      shaCache[path] = newSha;
      shaContentCache[path] = content;
      
      // КЛЮЧЕВОЕ: после записи сразу читаем по SHA, чтобы обновить кэш
      // Это обходит CDN кэш полностью
      try {
        const freshContent = await getFileBySha(newSha);
        shaContentCache[path] = freshContent.content;
      } catch (e) {
        console.warn('Could not fetch by SHA:', e);
      }
    }
    return res;
  }

  async function putBinaryFile(path, base64Data, message, sha) {
    const cfg = getConfig();
    const body = { message, content: base64Data, branch: cfg.branch };
    if (sha) body.sha = sha;
    const res = await request('PUT', '/contents/' + path, body);
    
    if (res?.content?.sha) {
      const newSha = res.content.sha;
      shaCache[path] = newSha;
      // Для бинарных файлов не сохраняем содержимое в текстовый кэш
    }
    return res;
  }

  async function deleteFile(path, message, sha) {
    const cfg = getConfig();
    if (!sha) sha = shaCache[path] || await getFileSha(path);
    if (!sha) return;
    delete shaCache[path];
    delete shaContentCache[path];
    return request('DELETE', '/contents/' + path, { message, sha, branch: cfg.branch });
  }

  async function deleteFiles(paths, message) {
    for (const p of paths) {
      try { await deleteFile(p, message); } catch (e) { if (e.status !== 404) throw e; }
    }
  }

  // Кэши
  const shaCache = {};
  const shaContentCache = {};

  function clearCache() {
    for (let k in shaCache) delete shaCache[k];
    for (let k in shaContentCache) delete shaContentCache[k];
  }

  async function readJSON(path, forceRefresh = false) {
    const { sha, content } = await getFile(path, forceRefresh);
    if (!content || content.trim() === '') {
      return { data: { id: 'lots', name: 'Галерея', lots: {} }, sha };
    }
    try {
      return { data: JSON.parse(content), sha };
    } catch (e) {
      console.error('JSON parse error:', e);
      return { data: { id: 'lots', name: 'Галерея', lots: {} }, sha };
    }
  }

  // Принудительное чтение с полным обходом кэша
  async function readJSONForce(path) {
    clearCache();
    return readJSON(path, true);
  }

  // Чтение с повторными попытками (polling)
  async function readJSONWithRetry(path, maxAttempts = 8, delayMs = 1000) {
    clearCache();
    
    let lastResult = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await readJSON(path, true);
        const data = result.data;
        
        // Проверяем, есть ли осмысленные данные
        const hasLots = data && data.lots && (
          (Array.isArray(data.lots) && data.lots.length > 0) ||
          (!Array.isArray(data.lots) && typeof data.lots === 'object' && Object.keys(data.lots).length > 0)
        );
        
        if (hasLots || attempt === maxAttempts) {
          return result;
        }
        
        console.log(`readJSONWithRetry: попытка ${attempt}/${maxAttempts} — данных нет, ждём...`);
        await new Promise(r => setTimeout(r, delayMs * attempt));
        
      } catch (e) {
        console.warn(`readJSONWithRetry: попытка ${attempt} ошибка:`, e.message);
        if (attempt === maxAttempts) throw e;
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }
    
    return lastResult || { data: { id: 'lots', name: 'Галерея', lots: {} }, sha: null };
  }

  async function writeJSON(path, data, message) {
    const content = JSON.stringify(data, null, 2);
    
    for (let attempt = 0; attempt < 3; attempt++) {
      let sha = shaCache[path];
      if (!sha) {
        const r = await readJSON(path, true);
        sha = r.sha;
      }
      
      try {
        const res = await putFile(path, content, message || 'Update', sha || undefined);
        
        // После успешной записи очищаем кэш и делаем паузу
        clearCache();
        await new Promise(r => setTimeout(r, 500));
        
        return res;
      } catch (e) {
        if (e.status === 409) {
          delete shaCache[path];
          delete shaContentCache[path];
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
  }

  // Запись с верификацией
  async function writeJSONWithVerify(path, data, message, maxAttempts = 5) {
    const result = await writeJSON(path, data, message);
    
    // Верификация: читаем и проверяем, что данные сохранились
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      
      try {
        const verifyResult = await readJSONForce(path);
        const savedCount = verifyResult.data?.lots ? 
          (Array.isArray(verifyResult.data.lots) ? verifyResult.data.lots.length : Object.keys(verifyResult.data.lots).length) : 0;
        const expectedCount = data?.lots ? 
          (Array.isArray(data.lots) ? data.lots.length : Object.keys(data.lots).length) : 0;
        
        if (savedCount >= expectedCount) {
          console.log(`writeJSONWithVerify: верификация успешна (попытка ${attempt})`);
          return result;
        }
        
        console.warn(`writeJSONWithVerify: верификация ${attempt}/${maxAttempts} — ожидалось ${expectedCount}, получено ${savedCount}`);
      } catch (e) {
        console.warn(`writeJSONWithVerify: ошибка верификации ${attempt}:`, e.message);
      }
    }
    
    console.warn('writeJSONWithVerify: верификация не удалась, но запись выполнена');
    return result;
  }

  return {
    getConfig, saveConfig, isConfigured, ping,
    getFile, getFileBytes, getFileSha,
    getFileBySha,
    putFile, putBinaryFile,
    deleteFile, deleteFiles,
    readJSON, readJSONForce, readJSONWithRetry,
    writeJSON, writeJSONWithVerify,
    clearCache,
  };

})();