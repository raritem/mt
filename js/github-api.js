/* ================================================================
   WoT Shop — GitHub API (github-api.js)
   Работа с Contents API: чтение, создание, обновление, удаление файлов
   ================================================================ */

'use strict';

window.GH = (() => {

  const API = 'https://api.github.com';

  // ── Получить сохранённые настройки ────────────────────────────
  function getConfig() {
    return {
      token:  localStorage.getItem('wotshop-gh-token')  || '',
      repo:   localStorage.getItem('wotshop-gh-repo')   || '',
      branch: localStorage.getItem('wotshop-gh-branch') || 'main',
    };
  }

  function saveConfig(token, repo, branch) {
    localStorage.setItem('wotshop-gh-token',  token);
    localStorage.setItem('wotshop-gh-repo',   repo);
    localStorage.setItem('wotshop-gh-branch', branch || 'main');
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.token && c.repo);
  }

  // ── Базовый запрос ────────────────────────────────────────────
  async function request(method, path, body) {
    const cfg = getConfig();
    if (!cfg.token || !cfg.repo) throw new Error('GitHub не настроен. Откройте настройки.');

    const url = API + '/repos/' + cfg.repo + path;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization':      'Bearer ' + cfg.token,
        'Accept':             'application/vnd.github+json',
        'Content-Type':       'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let rawMsg = '';
      try { rawMsg = (await res.json()).message || ''; } catch (_) {}

      // Человекочитаемые сообщения для частых ошибок
      let msg;
      switch (res.status) {
        case 401:
          msg = 'Токен недействителен или истёк (401). Проверьте настройки.';
          break;
        case 403:
          if (rawMsg.toLowerCase().includes('rate limit')) {
            msg = 'Превышен лимит запросов GitHub API (403). Подождите ~1 минуту и попробуйте снова.';
          } else {
            msg = 'Доступ запрещён (403). Убедитесь, что у токена есть права repo/contents:write.';
          }
          break;
        case 404:
          msg = 'Файл или репозиторий не найден (404). Проверьте имя репозитория.';
          break;
        case 409:
          msg = 'Конфликт коммита (409): файл изменился параллельно. Попробуйте ещё раз.';
          break;
        case 422:
          msg = 'Ошибка валидации (422): ' + (rawMsg || 'неверные данные запроса.');
          break;
        default:
          msg = rawMsg || ('Ошибка GitHub API: HTTP ' + res.status);
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

  // ── Получить файл (возвращает {content, sha}) ─────────────────
  async function getFile(path) {
    const cfg = getConfig();
    const res = await request('GET', '/contents/' + path + '?ref=' + cfg.branch);
    return {
      sha:     res.sha,
      content: atob(res.content.replace(/\n/g, '')),
    };
  }

  // ── Получить SHA файла (для обновления) ───────────────────────
  async function getFileSha(path) {
    try {
      const f = await getFile(path);
      return f.sha;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // ── Создать / обновить текстовый файл ─────────────────────────
  async function putFile(path, content, message, sha) {
    const cfg  = getConfig();
    const b64  = btoa(unescape(encodeURIComponent(content)));
    const body = {
      message: message || 'Update ' + path,
      content: b64,
      branch:  cfg.branch,
    };
    if (sha) body.sha = sha;
    return request('PUT', '/contents/' + path, body);
  }

  // ── Создать / обновить бинарный файл (base64 строка) ──────────
  async function putBinaryFile(path, base64Data, message, sha) {
    const cfg  = getConfig();
    const body = {
      message: message || 'Upload ' + path,
      content: base64Data, // уже base64
      branch:  cfg.branch,
    };
    if (sha) body.sha = sha;
    return request('PUT', '/contents/' + path, body);
  }

  // ── Удалить файл ──────────────────────────────────────────────
  async function deleteFile(path, message, sha) {
    const cfg  = getConfig();
    if (!sha) {
      const info = await getFileSha(path);
      if (!info) return; // уже удалён
      sha = info;
    }
    return request('DELETE', '/contents/' + path, {
      message: message || 'Delete ' + path,
      sha,
      branch: cfg.branch,
    });
  }

  // ── Удалить несколько файлов (последовательно) ────────────────
  async function deleteFiles(paths, message) {
    for (const p of paths) {
      try {
        await deleteFile(p, message || 'Delete files');
      } catch (e) {
        if (e.status !== 404) throw e;
        // 404 — уже удалён, игнорируем
      }
    }
  }

  // ── Прочитать или создать JSON ────────────────────────────────
  async function readJSON(path) {
    try {
      const f = await getFile(path);
      return { data: JSON.parse(f.content), sha: f.sha };
    } catch (e) {
      if (e.status === 404) return { data: null, sha: null };
      throw e;
    }
  }

  // ── Сохранить JSON (с автоповтором при конфликте 409) ────────────
  async function writeJSON(path, data, message) {
    const content = JSON.stringify(data, null, 2);
    // До 3 попыток: при конфликте (409) перечитываем SHA и повторяем
    for (let attempt = 0; attempt < 3; attempt++) {
      const { sha } = await readJSON(path);
      try {
        return await putFile(path, content, message || 'Update ' + path, sha);
      } catch (e) {
        if (e.status === 409 && attempt < 2) {
          // SHA устарел — повторяем с актуальным
          await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
  }

  return {
    getConfig, saveConfig, isConfigured, ping,
    getFile, getFileSha,
    putFile, putBinaryFile,
    deleteFile, deleteFiles,
    readJSON, writeJSON,
  };

})();
