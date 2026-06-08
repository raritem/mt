export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── JWT (простой, без библиотек) ─────────────────────────────
    async function signToken(payload, secret) {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      const data = header + '.' + body;
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
      return data + '.' + sigB64;
    }

    async function verifyToken(token, secret) {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const data = parts[0] + '.' + parts[1];
        const key = await crypto.subtle.importKey(
          'raw', new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const sigBytes = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
        if (!valid) return null;
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
      } catch { return null; }
    }

    async function requireAuth(request) {
      const auth = request.headers.get('Authorization') || '';
      const token = auth.replace('Bearer ', '').trim();
      if (!token) return null;
      return await verifyToken(token, env.JWT_SECRET);
    }

    // ── Маппинг колонок CSV ───────────────────────────────────────
    const COL_ACCOUNTS = {
      id: 0, price: 2, funpay_link: 3,
      prems_8_9: 4, tanks_10: 5, prems_6_7: 6, bonus_tanks: 7,
      year: 8, bonds: 9, gold: 10, silver: 11,
      spg: 12, boosters: 13, crew: 14, camo: 15,
      '3dstyles': 16, no_battles: 17,
    };

    const COL_TANKS = {
      name: 0, icon: 1, tier: 2, type: 3, nation: 4,
      isPrem: 5, interest_level: 6,
      description_a: 7, description_b: 8, description_c: 9, tags: 10,
    };

    // ── Утилиты импорта ───────────────────────────────────────────
    function todayStr() {
      return new Date().toISOString().slice(0, 10);
    }

    function daysBetween(a, b) {
      return Math.round((new Date(b) - new Date(a)) / 86400000);
    }

    function parseCSV(text) {
      const rows = [];
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = [];
        let inQuote = false, cur = '';
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
            else inQuote = !inQuote;
          } else if (ch === ',' && !inQuote) {
            cols.push(cur.trim()); cur = '';
          } else { cur += ch; }
        }
        cols.push(cur.trim());
        rows.push(cols);
      }
      return rows;
    }

    function normalizeTanks(val) {
      if (!val || !String(val).trim()) return [];
      return String(val).split(',').map(s => s.trim()).filter(Boolean);
    }

    function detectOnFunpay(link) {
      return String(link || '').toLowerCase().includes('funpay.com/lots/');
    }

    function computeCounts(allTanks, tanksMap) {
      let prems_8_9_count = 0, tanks_10_count = 0;
      let prems_6_7_count = 0, bonus_tanks_count = 0;
      for (const name of allTanks) {
        const info = tanksMap[name] || {};
        const tier = parseInt(info.tier, 10) || 0;
        const isPrem = info.is_prem === 1;
        if (tier === 10) tanks_10_count++;
        else if (tier >= 8 && tier <= 9 && isPrem) prems_8_9_count++;
        else if (tier >= 5 && tier <= 7 && isPrem) prems_6_7_count++;
        else bonus_tanks_count++;
      }
      return {
        prems_8_9_count, tanks_10_count, prems_6_7_count,
        bonus_tanks_count, premcount: prems_8_9_count + prems_6_7_count + bonus_tanks_count,
      };
    }

    function computeScoreBase(prems_8_9, tanksMap) {
      const tagCounts = {};
      for (const name of prems_8_9) {
        const info = tanksMap[name];
        if (!info || !info.tags) continue;
        const tags = Array.isArray(info.tags)
          ? info.tags
          : String(info.tags).split(',').map(s => s.trim()).filter(Boolean);
        for (const tag of tags) {
          if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      return { tagCounts, totalTanks: prems_8_9.length };
    }

    try {

      // ── POST /api/auth/login ──────────────────────────────────
      if (path === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (body.username !== env.ADMIN_USERNAME || body.password !== env.ADMIN_PASSWORD) {
          return json({ error: 'Неверный логин или пароль' }, 401);
        }
        const token = await signToken(
          { sub: body.username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 },
          env.JWT_SECRET
        );
        return json({ token });
      }

      // ── GET /api/lots — список с пагинацией ──────────────────
      if (path === '/api/lots' && request.method === 'GET') {
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const status = url.searchParams.get('status') || 'active';
        const offset = (page - 1) * limit;
        const where = 'WHERE status = ? AND is_hidden = 0';
        const total = await env.DB.prepare(
          `SELECT COUNT(*) as count FROM lots ${where}`
        ).bind(status).first();
        const rows = await env.DB.prepare(
          `SELECT * FROM lots ${where} ORDER BY rowid DESC LIMIT ? OFFSET ?`
        ).bind(status, limit, offset).all();
        return json({
          lots: rows.results,
          pagination: { page, limit, total: total.count, pages: Math.ceil(total.count / limit) }
        });
      }

      // ── GET /api/lots/all — все аккаунты для фронтенда ───────
      if (path === '/api/lots/all' && request.method === 'GET') {
        const rows = await env.DB.prepare(
          `SELECT * FROM lots WHERE status = 'active' AND is_hidden = 0 ORDER BY rowid DESC`
        ).all();
        const tanksRows = await env.DB.prepare(
          `SELECT lot_id, tank_name, category FROM lot_tanks`
        ).all();
        const tanksByLot = {};
        for (const t of tanksRows.results) {
          if (!tanksByLot[t.lot_id]) tanksByLot[t.lot_id] = { prems_8_9: [], tanks_10: [], prems_6_7: [], bonus_tanks: [] };
          const cat = t.category || 'prems_8_9';
          if (tanksByLot[t.lot_id][cat]) tanksByLot[t.lot_id][cat].push(t.tank_name);
          else tanksByLot[t.lot_id]['prems_8_9'].push(t.tank_name);
        }
        const lots = {};
        for (const lot of rows.results) {
          const tanks = tanksByLot[lot.id] || { prems_8_9: [], tanks_10: [], prems_6_7: [], bonus_tanks: [] };
          const allTanks = [...tanks.prems_8_9, ...tanks.tanks_10, ...tanks.prems_6_7, ...tanks.bonus_tanks];
          lots[lot.id] = {
            status: lot.status,
            lastSeenInCsv: lot.last_seen,
            inactiveSince: lot.inactive_since,
            onFunpay: lot.on_funpay === 1,
            no_battles: lot.no_battles === 1,
            scoreBase: lot.score_data ? JSON.parse(lot.score_data) : { tagCounts: {}, totalTanks: 0 },
            ui: { images: lot.images ? JSON.parse(lot.images) : [], thumb: lot.thumb || '', isHidden: lot.is_hidden === 1 },
            data: {
              price: lot.price || '', funpay_link: lot.funpay_link || '',
              year: lot.year || '', bonds: lot.bonds || '', gold: lot.gold || '',
              silver: lot.silver || '', spg: lot.spg || '', boosters: lot.boosters || '',
              crew: lot.crew || '', camo: lot.camo || '', '3dstyles': lot.styles3d || '',
              prems_8_9_count: lot.prems_8_9_count || 0, tanks_10_count: lot.tanks_10_count || 0,
              prems_6_7_count: lot.prems_6_7_count || 0, bonus_tanks_count: lot.bonus_tanks_count || 0,
              premcount: lot.prem_count || 0,
              prems_8_9: tanks.prems_8_9, tanks_10: tanks.tanks_10,
              prems_6_7: tanks.prems_6_7, bonus_tanks: tanks.bonus_tanks, all_tanks: allTanks,
            }
          };
        }
        return json({ id: 'lots', name: 'TankNexus', lots });
      }

      // ── GET /api/lots/:id — один аккаунт ─────────────────────
      const lotMatch = path.match(/^\/api\/lots\/([^/]+)$/);
      if (lotMatch && request.method === 'GET') {
        const id = lotMatch[1];
        const lot = await env.DB.prepare('SELECT * FROM lots WHERE id = ?').bind(id).first();
        if (!lot) return json({ error: 'Не найдено' }, 404);
        const tanks = await env.DB.prepare(
          'SELECT tank_name, category FROM lot_tanks WHERE lot_id = ?'
        ).bind(id).all();
        return json({ ...lot, tanks: tanks.results });
      }

      // ── POST /api/import/accounts — импорт CSV аккаунтов ─────
      if (path === '/api/import/accounts' && request.method === 'POST') {
        const user = await requireAuth(request);
        if (!user) return json({ error: 'Нет доступа' }, 401);

        const body = await request.json().catch(() => ({}));
        const csvText = body.csv;
        if (!csvText) return json({ error: 'CSV не передан' }, 400);

        const tanksRows = await env.DB.prepare('SELECT * FROM tanks').all();
        const tanksMap = {};
        for (const t of tanksRows.results) tanksMap[t.name] = t;

        const rows = parseCSV(csvText);
        const today = todayStr();
        const csvById = {};

        for (const row of rows) {
          const rawId = row[COL_ACCOUNTS.id];
          if (!rawId || !rawId.trim()) continue;
          const id = rawId.trim();
          if (id === 'ID') continue;
          const data = {};
          for (const [field, colIdx] of Object.entries(COL_ACCOUNTS)) {
            if (field === 'id') continue;
            data[field] = row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
          }
          csvById[id] = data;
        }

        const stats = { added: 0, updated: 0, markedInactive: 0, deleted: 0 };

        for (const [id, csvData] of Object.entries(csvById)) {
          const prems_8_9 = normalizeTanks(csvData.prems_8_9);
          const tanks_10 = normalizeTanks(csvData.tanks_10);
          const prems_6_7 = normalizeTanks(csvData.prems_6_7);
          const bonus_tanks = normalizeTanks(csvData.bonus_tanks);
          const allTanks = [...prems_8_9, ...tanks_10, ...prems_6_7, ...bonus_tanks];
          const counts = computeCounts(allTanks, tanksMap);
          const scoreBase = computeScoreBase(prems_8_9, tanksMap);
          const no_battles = csvData.no_battles === 'Без боёв' ? 1 : 0;
          const onFunpay = detectOnFunpay(csvData.funpay_link) ? 1 : 0;

          const existing = await env.DB.prepare('SELECT id FROM lots WHERE id = ?').bind(id).first();

          if (existing) {
            await env.DB.prepare(`
              UPDATE lots SET
                status = 'active', last_seen = ?, inactive_since = NULL,
                on_funpay = ?, price = ?, funpay_link = ?, year = ?,
                bonds = ?, gold = ?, silver = ?, spg = ?, boosters = ?,
                crew = ?, camo = ?, styles3d = ?, no_battles = ?,
                prems_8_9_count = ?, tanks_10_count = ?, prems_6_7_count = ?,
                bonus_tanks_count = ?, prem_count = ?, score_data = ?
              WHERE id = ?
            `).bind(
              today, onFunpay, csvData.price, csvData.funpay_link, csvData.year,
              csvData.bonds, csvData.gold, csvData.silver, csvData.spg, csvData.boosters,
              csvData.crew, csvData.camo, csvData['3dstyles'], no_battles,
              counts.prems_8_9_count, counts.tanks_10_count, counts.prems_6_7_count,
              counts.bonus_tanks_count, counts.premcount, JSON.stringify(scoreBase), id
            ).run();
            stats.updated++;
          } else {
            await env.DB.prepare(`
              INSERT INTO lots (
                id, status, last_seen, inactive_since, on_funpay,
                price, funpay_link, year, bonds, gold, silver,
                spg, boosters, crew, camo, styles3d, no_battles,
                prems_8_9_count, tanks_10_count, prems_6_7_count,
                bonus_tanks_count, prem_count, score_data,
                is_hidden, thumb, images
              ) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'','[]')
            `).bind(
              id, 'active', today, onFunpay,
              csvData.price, csvData.funpay_link, csvData.year,
              csvData.bonds, csvData.gold, csvData.silver,
              csvData.spg, csvData.boosters, csvData.crew, csvData.camo, csvData['3dstyles'],
              no_battles, counts.prems_8_9_count, counts.tanks_10_count, counts.prems_6_7_count,
              counts.bonus_tanks_count, counts.premcount, JSON.stringify(scoreBase)
            ).run();
            stats.added++;
          }

          await env.DB.prepare('DELETE FROM lot_tanks WHERE lot_id = ?').bind(id).run();
          const tankCategories = { prems_8_9, tanks_10, prems_6_7, bonus_tanks };
          for (const [cat, arr] of Object.entries(tankCategories)) {
            for (const tankName of arr) {
              await env.DB.prepare(
                'INSERT INTO lot_tanks (lot_id, tank_name, category) VALUES (?, ?, ?)'
              ).bind(id, tankName, cat).run();
            }
          }
        }

        const allLots = await env.DB.prepare('SELECT id, status, inactive_since FROM lots').all();
        const toDelete = [];
        for (const lot of allLots.results) {
          if (csvById[lot.id]) continue;
          if (lot.status === 'active') {
            await env.DB.prepare(
              `UPDATE lots SET status = 'inactive', inactive_since = ? WHERE id = ?`
            ).bind(today, lot.id).run();
            stats.markedInactive++;
          } else if (lot.status === 'inactive' && lot.inactive_since) {
            if (daysBetween(lot.inactive_since, today) > 7) toDelete.push(lot.id);
          }
        }

        for (const id of toDelete) {
          await env.DB.prepare('DELETE FROM lot_tanks WHERE lot_id = ?').bind(id).run();
          await env.DB.prepare('DELETE FROM lots WHERE id = ?').bind(id).run();
          stats.deleted++;
        }

        return json({ ok: true, stats });
      }

      // ── POST /api/import/tanks — импорт CSV танков ────────────
      if (path === '/api/import/tanks' && request.method === 'POST') {
        const user = await requireAuth(request);
        if (!user) return json({ error: 'Нет доступа' }, 401);

        const body = await request.json().catch(() => ({}));
        const csvText = body.csv;
        if (!csvText) return json({ error: 'CSV не передан' }, 400);

        const rows = parseCSV(csvText);
        const csvByName = {};

        for (const row of rows) {
          const rawName = row[COL_TANKS.name];
          if (!rawName || !rawName.trim()) continue;
          const name = rawName.trim();
          const data = {};
          for (const [field, colIdx] of Object.entries(COL_TANKS)) {
            if (field === 'name') continue;
            data[field] = row[colIdx] !== undefined ? String(row[colIdx]).trim() : '';
          }
          csvByName[name] = data;
        }

        const stats = { added: 0, updated: 0, deleted: 0 };

        for (const [name, d] of Object.entries(csvByName)) {
          const isPrem = d.isPrem === 'Прем' ? 1 : 0;
          const tags = d.tags ? d.tags.split(',').map(s => s.trim()).filter(Boolean).join(',') : '';
          const existing = await env.DB.prepare('SELECT name FROM tanks WHERE name = ?').bind(name).first();
          if (existing) {
            await env.DB.prepare(`
              UPDATE tanks SET icon=?, tier=?, type=?, nation=?, is_prem=?,
              interest_level=?, description_a=?, description_b=?, description_c=?, tags=?
              WHERE name=?
            `).bind(d.icon, parseInt(d.tier)||0, d.type, d.nation, isPrem,
              parseInt(d.interest_level)||0, d.description_a, d.description_b, d.description_c, tags, name
            ).run();
            stats.updated++;
          } else {
            await env.DB.prepare(`
              INSERT INTO tanks (name,icon,tier,type,nation,is_prem,interest_level,description_a,description_b,description_c,tags)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)
            `).bind(name, d.icon, parseInt(d.tier)||0, d.type, d.nation, isPrem,
              parseInt(d.interest_level)||0, d.description_a, d.description_b, d.description_c, tags
            ).run();
            stats.added++;
          }
        }

        const allTanks = await env.DB.prepare('SELECT name FROM tanks').all();
        for (const t of allTanks.results) {
          if (!csvByName[t.name]) {
            await env.DB.prepare('DELETE FROM tanks WHERE name = ?').bind(t.name).run();
            stats.deleted++;
          }
        }

        return json({ ok: true, stats });
      }

      // ── PUT /api/lots/:id — обновить аккаунт (админка) ───────
      if (path.match(/^\/api\/lots\/([^/]+)$/) && request.method === 'PUT') {
        const user = await requireAuth(request);
        if (!user) return json({ error: 'Нет доступа' }, 401);
        const id = path.match(/^\/api\/lots\/([^/]+)$/)[1];
        const body = await request.json().catch(() => ({}));
        const fields = ['status','price','funpay_link','is_hidden','thumb','images','on_funpay'];
        const updates = [];
        const vals = [];
        for (const f of fields) {
          if (body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(body[f]); }
        }
        if (!updates.length) return json({ error: 'Нет полей для обновления' }, 400);
        vals.push(id);
        await env.DB.prepare(`UPDATE lots SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
        return json({ ok: true });
      }

      return json({ error: 'Не найдено' }, 404);

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};
