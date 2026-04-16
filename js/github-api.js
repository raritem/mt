/* ================================================================
   TANKNEXUS — GitHub Contents API
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

  async function request(method, path, body) {
    const cfg = getConfig();
    if (!cfg.token || !cfg.repo) throw new Error('GitHub не настроен');

    const res = await fetch(API + '/repos/' + cfg.repo + path, {
      method,
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
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

  async function getRaw(path) {
    const cfg = getConfig();
    const res = await request('GET', '/contents/' + path + '?ref=' + cfg.branch);
    return { sha: res.sha, b64: res.content.replace(/\n/g, '') };
  }

  async function getFile(path) {
    try {
      const { sha, b64 } = await getRaw(path);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const content = new TextDecoder('utf-8').decode(bytes);
      shaCache[path] = sha;
      return { sha, content };
    } catch (e) {
      if (e.status === 404) return { sha: null, content: null };
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
    if (res?.content?.sha) shaCache[path] = res.content.sha;
    return res;
  }

  async function putBinaryFile(path, base64Data, message, sha) {
    const cfg = getConfig();
    const body = { message, content: base64Data, branch: cfg.branch };
    if (sha) body.sha = sha;
    return request('PUT', '/contents/' + path, body);
  }

  async function deleteFile(path, message, sha) {
    const cfg = getConfig();
    if (!sha) sha = shaCache[path] || await getFileSha(path);
    if (!sha) return;
    delete shaCache[path];
    return request('DELETE', '/contents/' + path, { message, sha, branch: cfg.branch });
  }

  async function deleteFiles(paths, message) {
    for (const p of paths) {
      try { await deleteFile(p, message); } catch (e) { if (e.status !== 404) throw e; }
    }
  }

  const shaCache = {};

  async function readJSON(path) {
    const { sha, content } = await getFile(path);
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

  async function writeJSON(path, data, message) {
    const content = JSON.stringify(data, null, 2);
    for (let attempt = 0; attempt < 3; attempt++) {
      let sha = shaCache[path];
      if (!sha) {
        const r = await readJSON(path);
        sha = r.sha;
      }
      try {
        return await putFile(path, content, message || 'Update', sha || undefined);
      } catch (e) {
        if (e.status === 409) {
          delete shaCache[path];
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
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
  };

})();