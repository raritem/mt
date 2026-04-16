/* ================================================================
   TANKNEXUS — GitHub Contents API
   ================================================================ */

'use strict';

window.GH = (() => {

  const API = 'https://api.github.com';

  // ── Настройки ─────────────────────────────────────────────────
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

  // ── Базовый HTTP запрос ────────────────────────────────────────
  async function request(method, path, body) {
    const cfg = getConfig();
    if (!cfg.token || !cfg.repo) throw new Error('GitHub не настроен. Откройте настройки.');

    const res = await fetch(API + '/repos/' + cfg.repo + path, {
      method,
      headers: {
        'Authorization':        'Bearer ' + cfg.token,
        'Accept':               'application/vnd.github+json',
        'Content-Type':         'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let rawMsg = '';
      try { rawMsg = (await res.json()).message || ''; } catch (_) {}
      let msg;
      switch (res.status) {
        case 401: msg = 'Токен недействителен или истёк (401).'; break;
        case 403: msg = rawMsg.toLowerCase().includes('rate limit')
          ? 'Превышен лимит запросов (403). Подождите ~1 мин.'
          : 'Доступ запрещён (403). Проверьте права токена (repo).'; break;
        case 404: msg = 'Файл не найден (404): ' + path; break;
        case 409: msg = '409_CONFLICT'; break;
        case 422: msg = 'Ошибка (422): ' + (rawMsg || 'неверные данные.'); break;
        default:  msg = rawMsg || ('Ошибка API: HTTP ' + res.status);
      }
      const e = new Error(msg);
      e.status = res.status;
      throw e;
    }

    if (res.status === 204) return null;
    return res.json();
  }

  // ── Проверить подключение ─────────────────────────────────────
  async function ping() {
    const cfg = getConfig();
    const res = await fetch(API + '/repos/' + cfg.repo, {
      headers: { 'Authorization': 'Bearer ' + cfg.token }
    });
    if (!res.ok) throw new Error('Нет доступа к репозиторию (' + res.status + ')');
    return res.json();
  }

  // ── Получить raw base64 файла (без декодирования) ─────────────
  async function getRaw(path) {
    const cfg = getConfig();
    const res = await request('GET', '/contents/' + path + '?ref=' + cfg.branch);
    return {
      sha:    res.sha,
      b64:    res.content.replace(/\n/g, ''),
    };
  }

  // ── Получить файл как текст (UTF-8, для JSON) ─────────────────
  async function getFile(path) {
    const { sha, b64 } = await getRaw(path);
    const bytes   = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const content = new TextDecoder('utf-8').decode(bytes);
    cacheSha(path, sha);
    return { sha, content };
  }

  // ── Получить файл как Uint8Array (для изображений) ────────────
  async function getFileBytes(path) {
    const { sha, b64 } = await getRaw(path);
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return { sha, bytes };
  }

  // ── Получить только SHA (без содержимого) ─────────────────────
  async function getFileSha(path) {
    try {
      const { sha } = await getRaw(path);
      cacheSha(path, sha);
      return sha;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // ── Записать текстовый файл (UTF-8) ──────────────────────────
  async function putFile(path, content, message, sha) {
    const cfg   = getConfig();
    const bytes = new TextEncoder().encode(content);
    const CHUNK = 8190;
    let b64 = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      b64 += btoa(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const body = { message: message || 'Update ' + path, content: b64, branch: cfg.branch };
    if (sha) body.sha = sha;
    return request('PUT', '/contents/' + path, body);
  }

  // ── Записать бинарный файл (base64 строка от Canvas) ─────────
  async function putBinaryFile(path, base64Data, message, sha) {
    const cfg  = getConfig();
    const body = { message: message || 'Upload ' + path, content: base64Data, branch: cfg.branch };
    if (sha) body.sha = sha;
    return request('PUT', '/contents/' + path, body);
  }

  // ── Удалить файл ──────────────────────────────────────────────
  async function deleteFile(path, message, sha) {
    const cfg = getConfig();
    if (!sha) {
      sha = getCachedSha(path) || await getFileSha(path);
      if (!sha) return;
    }
    invalidateSha(path);
    return request('DELETE', '/contents/' + path, {
      message: message || 'Delete ' + path,
      sha,
      branch: cfg.branch,
    });
  }

  async function deleteFiles(paths, message) {
    for (const p of paths) {
      try { await deleteFile(p, message); } catch (e) { if (e.status !== 404) throw e; }
    }
  }

  // ── SHA кеш ───────────────────────────────────────────────────
  const shaCache = {};
  function cacheSha(path, sha)   { if (sha) shaCache[path] = sha; }
  function getCachedSha(path)    { return shaCache[path] || null; }
  function invalidateSha(path)   { delete shaCache[path]; }

  // ── Читать JSON ───────────────────────────────────────────────
  async function readJSON(path) {
    try {
      const f = await getFile(path);
      return { data: JSON.parse(f.content), sha: f.sha };
    } catch (e) {
      if (e.status === 404) return { data: null, sha: null };
      throw e;
    }
  }

  // ── Записать JSON ────────────────────────────────────────────
  async function writeJSON(path, data, message) {
    const content = JSON.stringify(data, null, 2);

    for (let attempt = 0; attempt < 4; attempt++) {
      let sha = getCachedSha(path);

      if (sha === null || sha === undefined) {
        const r = await readJSON(path);
        sha = r.sha;
      }

      try {
        const result = await putFile(path, content, message || 'Update ' + path, sha || undefined);
        const newSha = result && result.content && result.content.sha;
        cacheSha(path, newSha || sha);
        return result;
      } catch (e) {
        if (e.status === 409) {
          invalidateSha(path);
          if (attempt < 3) {
            const delay = [300, 700, 1500][attempt] || 1500;
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error('Не удалось сохранить (конфликт SHA). Обновите страницу и попробуйте снова.');
        }
        throw e;
      }
    }
  }

  return {
    getConfig, saveConfig, isConfigured, ping,
    getFile, getFileBytes, getFileSha,
    putFile, putBinaryFile,
    deleteFile, deleteFiles,
    readJSON, writeJSON,
    cacheSha, invalidateSha,
  };

})();